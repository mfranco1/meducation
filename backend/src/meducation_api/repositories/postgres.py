"""Release-pinned synchronous reader adapters with bounded immutable catalog caching."""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from threading import Lock
from typing import Any, Self
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import Connection, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.runtime import PostgresRuntime
from meducation_api.operations import database_failure, dependency_result
from meducation_api.repositories.question_bank import (
    Flashcard,
    FlashcardDeck,
    FlashcardSubjectSummary,
    Question,
    Quiz,
    Subject,
)
from meducation_api.repositories.source import ContentView
from meducation_api.settings import Settings


@dataclass(frozen=True)
class Catalog:
    subjects: tuple[Subject, ...]
    quizzes: tuple[Quiz, ...]
    question_ids: dict[str, tuple[str, ...]]
    decks: tuple[FlashcardDeck, ...]
    card_ids: dict[str, tuple[str, ...]]


def _rows(connection: Connection, table: str, release: UUID) -> list[dict[str, Any]]:
    # Callers supply only the fixed reader view names below.
    return [
        dict(row)
        for row in connection.execute(
            text(f"SELECT * FROM content.{table} WHERE release_id=:release ORDER BY position"),
            {"release": release},
        ).mappings()
    ]


def _load_catalog(connection: Connection, release: UUID) -> Catalog:
    subjects = tuple(
        Subject.model_validate({k: r[k] for k in ("id", "name", "accent")})
        for r in _rows(connection, "published_subjects", release)
    )
    quizzes = tuple(
        Quiz(id=r["id"], subjectId=r["subject_id"], name=r["name"])
        for r in _rows(connection, "published_quizzes", release)
    )
    decks = tuple(
        FlashcardDeck.model_validate(
            {
                "id": r["id"],
                "subjectId": r["subject_id"],
                "name": r["name"],
                **({"description": r["description"]} if r["description"] is not None else {}),
            }
        )
        for r in _rows(connection, "published_decks", release)
    )
    memberships: list[dict[str, tuple[str, ...]]] = []
    for table, parent in (("published_questions", "quiz_id"), ("published_flashcards", "deck_id")):
        groups: dict[str, list[str]] = {}
        for row in connection.execute(
            text(
                f"SELECT id,{parent} FROM content.{table} WHERE release_id=:release ORDER BY position"
            ),
            {"release": release},
        ).mappings():
            groups.setdefault(row[parent], []).append(row["id"])
        memberships.append({key: tuple(ids) for key, ids in groups.items()})
    return Catalog(subjects, quizzes, memberships[0], decks, memberships[1])


class PostgresQuestionBankRepository:
    def __init__(self, connection: Connection, release: UUID, revision: str, catalog: Catalog):
        self.connection, self.release, self._revision, self.catalog = (
            connection,
            release,
            revision,
            catalog,
        )

    @property
    def revision(self) -> str:
        return self._revision

    def list_subjects(self) -> list[Subject]:
        return [s.model_copy(deep=True) for s in self.catalog.subjects]

    def has_subject(self, subject_id: str) -> bool:
        return any(s.id == subject_id for s in self.catalog.subjects)

    def subject_quiz_summary(self, subject_id: str) -> tuple[int, list[str]]:
        ids = [q.id for q in self.catalog.quizzes if q.subjectId == subject_id]
        return len(ids), ids

    def list_quizzes(self, subject_id: str) -> list[tuple[Quiz, int]]:
        return [
            (q.model_copy(deep=True), len(self.catalog.question_ids.get(q.id, ())))
            for q in self.catalog.quizzes
            if q.subjectId == subject_id
        ]

    def get_quiz(self, quiz_id: str) -> tuple[Quiz, int] | None:
        return next(
            (
                (q.model_copy(deep=True), len(self.catalog.question_ids.get(q.id, ())))
                for q in self.catalog.quizzes
                if q.id == quiz_id
            ),
            None,
        )

    def list_question_ids(self, quiz_id: str) -> list[str]:
        return list(self.catalog.question_ids.get(quiz_id, ()))

    def list_questions(self, quiz_id: str) -> list[Question]:
        fields = {
            "id": "id",
            "quizId": "quiz_id",
            "stem": "stem",
            "choices": "choices",
            "rationale": "rationale",
            "answer": "answer",
            "verifiedAnswer": "verified_answer",
            "answerNote": "answer_note",
            "rationaleMeta": "rationale_meta",
            "choiceExplanations": "choice_explanations",
            "pearls": "pearls",
            "metadata": "metadata",
        }
        rows = self.connection.execute(
            text(
                "SELECT * FROM content.published_questions WHERE release_id=:release AND quiz_id=:parent ORDER BY position"
            ),
            {"release": self.release, "parent": quiz_id},
        ).mappings()
        return [
            Question.model_validate(
                {key: r[column] for key, column in fields.items() if r[column] is not None}
            )
            for r in rows
        ]


class PostgresFlashcardCatalogRepository:
    def __init__(self, connection: Connection, release: UUID, revision: str, catalog: Catalog):
        self.connection, self.release, self._revision, self.catalog = (
            connection,
            release,
            revision,
            catalog,
        )

    @property
    def revision(self) -> str:
        return self._revision

    def has_subject(self, subject_id: str) -> bool:
        return any(s.id == subject_id for s in self.catalog.subjects)

    def list_subjects(self) -> list[FlashcardSubjectSummary]:
        result = []
        for subject in self.catalog.subjects:
            decks = [d for d in self.catalog.decks if d.subjectId == subject.id]
            result.append(
                FlashcardSubjectSummary(
                    **subject.model_dump(),
                    deckCount=len(decks),
                    deckIds=[d.id for d in decks],
                    emptyDeckIds=[d.id for d in decks if not self.catalog.card_ids.get(d.id)],
                )
            )
        return result

    def list_catalog(self, subject_id: str) -> list[tuple[FlashcardDeck, int]]:
        return [
            (d.model_copy(deep=True), len(self.catalog.card_ids.get(d.id, ())))
            for d in self.catalog.decks
            if d.subjectId == subject_id
        ]

    def has_deck(self, deck_id: str) -> bool:
        return any(d.id == deck_id for d in self.catalog.decks)

    def list_cards(self, deck_id: str) -> list[Flashcard]:
        fields = {
            "id": "id",
            "deckId": "deck_id",
            "front": "front",
            "back": "back",
            "sources": "sources",
            "reviewNote": "review_note",
        }
        rows = self.connection.execute(
            text(
                "SELECT * FROM content.published_flashcards WHERE release_id=:release AND deck_id=:parent ORDER BY position"
            ),
            {"release": self.release, "parent": deck_id},
        ).mappings()
        return [
            Flashcard.model_validate(
                {key: r[column] for key, column in fields.items() if r[column] is not None}
            )
            for r in rows
        ]


class PostgresContentSource:
    def __init__(self, settings: Settings):
        self.runtime = PostgresRuntime(settings)
        self._catalogs: dict[UUID, tuple[int, Catalog]] = {}
        self._lock = Lock()

    def __enter__(self) -> Self:
        self.runtime.__enter__()
        return self

    def __exit__(self, *args: object) -> None:
        self.runtime.__exit__(*args)
        self._catalogs.clear()

    @contextmanager
    def view(self) -> Iterator[ContentView]:
        try:
            with self.runtime.engine.connect() as connection:
                connection.exec_driver_sql("SET LOCAL statement_timeout = '10s'")
                connection.exec_driver_sql("SET LOCAL lock_timeout = '3s'")
                selected = (
                    connection.execute(
                        text(
                            "SELECT p.release_id,p.publication_sequence,r.quiz_revision,r.flashcard_revision "
                            "FROM content.active_publication p JOIN content.published_releases r USING(release_id) "
                            "WHERE p.publication_sequence>0"
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if selected is None:
                    raise ContentDatabaseError("No active finalized content release.")
                release, sequence = selected["release_id"], selected["publication_sequence"]
                with self._lock:
                    cached = self._catalogs.get(release)
                    catalog = cached[1] if cached else _load_catalog(connection, release)
                    self._catalogs[release] = (max(sequence, cached[0] if cached else 0), catalog)
                    if len(self._catalogs) > 2:
                        oldest = min(self._catalogs, key=lambda key: self._catalogs[key][0])
                        del self._catalogs[oldest]
                yield ContentView(
                    PostgresQuestionBankRepository(
                        connection, release, selected["quiz_revision"], catalog
                    ),
                    PostgresFlashcardCatalogRepository(
                        connection, release, selected["flashcard_revision"], catalog
                    ),
                    release,
                    sequence,
                )
            dependency_result("reader")
        except (SQLAlchemyError, ValidationError) as error:
            database_failure("reader", error)
            raise ContentDatabaseError(
                "Content database unavailable; no SQL or credentials logged."
            ) from None

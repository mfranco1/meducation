"""Small in-memory protocol doubles for HTTP response/cleanup tests only.

No file selection or runtime configuration: callers provide explicit synthetic
objects. Real persistence and independent parity are exercised against PostgreSQL.
"""

import copy
import hashlib
import json
from contextlib import contextmanager

from meducation_api.main import create_app
from meducation_api.repositories.question_bank import Bank, FlashcardBank, FlashcardSubjectSummary
from meducation_api.repositories.source import ContentView
from meducation_api.settings import Settings


def revision(value):
    return "sha256-" + hashlib.sha256(value.encode()).hexdigest()


class FixtureQuestionRepository:
    def __init__(self, value):
        self.bank = Bank.model_validate(value)
        self.revision = revision(json.dumps(value, ensure_ascii=False, indent=2) + "\n")

    def list_subjects(self):
        return self.bank.subjects[:]

    def has_subject(self, id):
        return any(row.id == id for row in self.bank.subjects)

    def subject_quiz_summary(self, id):
        ids = [row.id for row in self.bank.quizzes if row.subjectId == id]
        return len(ids), ids

    def list_quizzes(self, id):
        return [
            (row, len(self.list_questions(row.id)))
            for row in self.bank.quizzes
            if row.subjectId == id
        ]

    def get_quiz(self, id):
        row = next((row for row in self.bank.quizzes if row.id == id), None)
        return (row, len(self.list_questions(id))) if row else None

    def list_questions(self, id):
        return [row for row in self.bank.questions if row.quizId == id]

    def list_question_ids(self, id):
        return [row.id for row in self.list_questions(id)]


class FixtureFlashcardRepository:
    def __init__(self, value, subjects):
        self.bank = FlashcardBank.model_validate(value)
        self.subjects = subjects
        assert all(any(s.id == d.subjectId for s in subjects) for d in self.bank.decks)
        self.revision = revision(
            "flashcards-v2\n"
            + json.dumps(
                [s.model_dump() for s in subjects], ensure_ascii=False, separators=(",", ":")
            )
            + "\n"
            + json.dumps(value, ensure_ascii=False, indent=2)
            + "\n"
        )

    def has_subject(self, id):
        return any(row.id == id for row in self.subjects)

    def list_subjects(self):
        return [
            FlashcardSubjectSummary(
                **s.model_dump(),
                deckCount=len(self.list_catalog(s.id)),
                deckIds=[d.id for d, _ in self.list_catalog(s.id)],
                emptyDeckIds=[d.id for d, count in self.list_catalog(s.id) if not count],
            )
            for s in self.subjects
        ]

    def list_catalog(self, id):
        return [
            (row, len(self.list_cards(row.id))) for row in self.bank.decks if row.subjectId == id
        ]

    def has_deck(self, id):
        return any(row.id == id for row in self.bank.decks)

    def list_cards(self, id):
        return [row for row in self.bank.cards if row.deckId == id]


class FixtureContentSource:
    def __init__(self, quizzes, flashcards=None, *, questions=None):
        self.quizzes = copy.deepcopy(quizzes)
        self.flashcards = copy.deepcopy(
            flashcards if flashcards is not None else {"schemaVersion": 2, "decks": [], "cards": []}
        )
        self.questions = questions
        self._view = None

    def __enter__(self):
        questions = self.questions or FixtureQuestionRepository(self.quizzes)
        self._view = ContentView(
            questions, FixtureFlashcardRepository(self.flashcards, questions.list_subjects())
        )
        return self

    def __exit__(self, *args):
        self._view = None

    @contextmanager
    def view(self):
        assert self._view is not None
        yield self._view


def fixture_app(quizzes, flashcards=None, *, questions=None):
    return create_app(
        Settings(_env_file=None),
        source_factory=lambda _: FixtureContentSource(quizzes, flashcards, questions=questions),
    )

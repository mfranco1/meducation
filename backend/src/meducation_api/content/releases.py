"""Release store and activation."""

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import Connection, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.content.draft import canonical_documents, revisions
from meducation_api.content_policy import artifact_text
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.repositories.question_bank import Bank, FlashcardBank
from meducation_api.strict_json import StrictDecoder


@dataclass(frozen=True)
class ReleaseIdentity:
    release_id: UUID
    quiz_revision: str
    flashcard_revision: str


@dataclass(frozen=True)
class Publication:
    release_id: UUID
    publication_sequence: int


def paired_artifacts(quiz_text: str, flashcard_text: str) -> tuple[str, str]:
    """Validate stored contracts without hydrating defaults or rewriting authored strings."""
    try:
        q = json.loads(quiz_text, cls=StrictDecoder)
        f = json.loads(flashcard_text, cls=StrictDecoder)
        bank = Bank.model_validate(q, strict=True)
        flashcards = FlashcardBank.model_validate(f, strict=True)
        topics = {topic.id for topic in bank.topics}
        if any(deck.topicId not in topics for deck in flashcards.decks):
            raise ValueError("Flashcard topic is missing from the paired question bank.")
        return artifact_text(q), artifact_text(f)
    except ValueError, TypeError:
        raise ContentDatabaseError(
            "Invalid paired stored content; no content or SQL logged."
        ) from None


def _call(connection: Connection, statement: str, params: dict[str, Any]) -> Any:
    try:
        return connection.execute(text(statement), params).scalar_one()
    except SQLAlchemyError:
        raise ContentDatabaseError(
            "Content transaction was rejected; no content, SQL or credentials logged."
        ) from None


def store_release(
    connection: Connection, *, quiz_text: str, flashcard_text: str
) -> ReleaseIdentity:
    qtext, ftext = canonical_documents(*paired_artifacts(quiz_text, flashcard_text))
    revision = revisions(qtext, ftext)
    release_id = _call(
        connection,
        "SELECT content.store_release(:q, :f, :quiz_revision, :flashcard_revision)",
        {
            "q": qtext,
            "f": ftext,
            "quiz_revision": revision["quizRevision"],
            "flashcard_revision": revision["flashcardRevision"],
        },
    )
    return ReleaseIdentity(release_id, revision["quizRevision"], revision["flashcardRevision"])


def activate_release(
    connection: Connection,
    *,
    release_id: UUID,
    expected_sequence: int,
    actor: str,
    reason: str,
) -> Publication:
    sequence = _call(
        connection,
        "SELECT content.activate_release(:release, :expected, :actor, :reason)",
        {"release": release_id, "expected": expected_sequence, "actor": actor, "reason": reason},
    )
    return Publication(release_id, sequence)

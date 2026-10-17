"""Release store and activation."""

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import Connection, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.content_policy import artifact_text
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.repositories.question_bank import Bank, FlashcardBank


@dataclass(frozen=True)
class ReleaseIdentity:
    release_id: UUID
    quiz_revision: str
    flashcard_revision: str


@dataclass(frozen=True)
class Publication:
    release_id: UUID
    publication_sequence: int


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate stored object keys are forbidden.")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError("Non-finite stored numbers are forbidden.")


def paired_artifacts(quiz_text: str, flashcard_text: str) -> tuple[str, str]:
    """Validate stored contracts without hydrating defaults or rewriting authored strings."""
    try:
        q = json.loads(
            quiz_text, object_pairs_hook=_unique_object, parse_constant=_invalid_constant
        )
        f = json.loads(
            flashcard_text, object_pairs_hook=_unique_object, parse_constant=_invalid_constant
        )
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


def _call(connection: Connection, statement: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        result: Any = connection.execute(text(statement), params).scalar_one()
    except SQLAlchemyError:
        raise ContentDatabaseError(
            "Content transaction was rejected; no content, SQL or credentials logged."
        ) from None
    if not isinstance(result, dict):
        raise ContentDatabaseError("Invalid content-operation result.")
    return result


def store_release(
    connection: Connection,
    *,
    operation_id: UUID,
    quiz_text: str,
    flashcard_text: str,
    source_hashes: dict[str, str],
    actor: str,
    reason: str,
) -> ReleaseIdentity:
    qtext, ftext = paired_artifacts(quiz_text, flashcard_text)
    result = _call(
        connection,
        "SELECT content.store_release(:op, :q, :f, CAST(:hashes AS jsonb), :actor, :reason)",
        {
            "op": operation_id,
            "q": qtext,
            "f": ftext,
            "hashes": json.dumps(source_hashes),
            "actor": actor,
            "reason": reason,
        },
    )
    return ReleaseIdentity(
        UUID(result["release_id"]), result["quiz_revision"], result["flashcard_revision"]
    )


def activate_release(
    connection: Connection,
    *,
    operation_id: UUID,
    release_id: UUID,
    expected_sequence: int,
    actor: str,
    reason: str,
) -> Publication:
    result = _call(
        connection,
        "SELECT content.activate_release(:op, :release, :expected, :actor, :reason)",
        {
            "op": operation_id,
            "release": release_id,
            "expected": expected_sequence,
            "actor": actor,
            "reason": reason,
        },
    )
    return Publication(UUID(result["release_id"]), result["publication_sequence"])

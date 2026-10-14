"""Private transactional primitives; no HTTP/file importer or authority cutover."""

import json
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.content_policy import ContentPolicyError, PairedContentValidator, ValidatedPair
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
        subjects = {subject.id for subject in bank.subjects}
        if any(deck.subjectId not in subjects for deck in flashcards.decks):
            raise ValueError("Flashcard subject is missing from the paired question bank.")
        artifacts = [
            json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
            for value in (q, f)
        ]
        return artifacts[0], artifacts[1]
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
    reservations: Sequence[UUID] = (),
) -> ReleaseIdentity:
    qtext, ftext = paired_artifacts(quiz_text, flashcard_text)
    result = _call(
        connection,
        "SELECT content.store_release(:op, :q, :f, CAST(:hashes AS jsonb), :actor, :reason, CAST(:reservations AS uuid[]))",
        {
            "op": operation_id,
            "q": qtext,
            "f": ftext,
            "hashes": json.dumps(source_hashes),
            "actor": actor,
            "reason": reason,
            "reservations": list(reservations),
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


def reserve_ids(
    engine: Engine,
    *,
    operation_id: UUID,
    counts: dict[str, int],
    expected_draft_revision: int,
    expected_publication_sequence: int,
    intent: str,
    actor: str,
    reason: str,
) -> dict[str, list[str]]:
    """Commit reservations separately, before entering a draft/release transaction."""
    with engine.begin() as connection:
        result = _call(
            connection,
            "SELECT content.reserve_ids(:op, CAST(:counts AS jsonb), :draft, :publication, :intent, :actor, :reason)",
            {
                "op": operation_id,
                "counts": json.dumps(counts),
                "draft": expected_draft_revision,
                "publication": expected_publication_sequence,
                "intent": intent,
                "actor": actor,
                "reason": reason,
            },
        )
    if not all(
        isinstance(ids, list) and all(isinstance(value, str) for value in ids)
        for ids in result.values()
    ):
        raise ContentDatabaseError("Invalid reservation result.")
    return result


def save_draft(
    connection: Connection,
    *,
    operation_id: UUID,
    quiz_text: str,
    flashcard_text: str,
    expected_revision: int,
    base_sequence: int,
    actor: str,
    reason: str,
    reservations: Sequence[UUID] = (),
    validator: PairedContentValidator | None = None,
) -> int:
    # A database authoring save cannot bypass the same policy used by HTTP preview.
    try:
        pair = (validator or PairedContentValidator()).documents(quiz_text, flashcard_text)
    except ContentPolicyError:
        raise ContentDatabaseError(
            "Paired draft policy validation failed; no content logged."
        ) from None
    return _save_validated_draft(
        connection,
        pair=pair,
        operation_id=operation_id,
        expected_revision=expected_revision,
        base_sequence=base_sequence,
        actor=actor,
        reason=reason,
        reservations=reservations,
    )


def _save_validated_draft(
    connection: Connection,
    *,
    pair: ValidatedPair,
    operation_id: UUID,
    expected_revision: int,
    base_sequence: int,
    actor: str,
    reason: str,
    reservations: Sequence[UUID] = (),
) -> int:
    # Internal commit hook: the service obtains a fresh validation proof, never a browser proof.
    qtext, ftext = pair.quiz_artifact, pair.flashcard_artifact
    result = _call(
        connection,
        "SELECT content.save_draft(:op, :q, :f, :expected, :base, :actor, :reason, CAST(:reservations AS uuid[]))",
        {
            "op": operation_id,
            "q": qtext,
            "f": ftext,
            "expected": expected_revision,
            "base": base_sequence,
            "actor": actor,
            "reason": reason,
            "reservations": list(reservations),
        },
    )
    return int(result["draft_revision"])


@dataclass(frozen=True)
class AuthoredPublication:
    release: ReleaseIdentity
    publication_sequence: int
    draft_revision: int


def _publication_outcome(result: Any) -> AuthoredPublication:
    try:
        return AuthoredPublication(
            ReleaseIdentity(
                UUID(result["release_id"]), result["quiz_revision"], result["flashcard_revision"]
            ),
            result["publication_sequence"],
            result["draft_revision"],
        )
    except KeyError, TypeError, ValueError:
        raise ContentDatabaseError("Invalid authored-publication result.") from None


def _publish_parameters(
    operation_id: UUID,
    pair: ValidatedPair,
    expected_revision: int,
    expected_sequence: int,
    preview: str,
    actor: str,
    reason: str,
) -> dict[str, Any]:
    return {
        "op": operation_id,
        "q": pair.quiz_artifact,
        "f": pair.flashcard_artifact,
        "draft": expected_revision,
        "publication": expected_sequence,
        "policy": pair.policy_version,
        "preview": preview,
        "actor": actor,
        "reason": reason,
    }


def authored_publication_result(
    connection: Connection,
    *,
    operation_id: UUID,
    pair: ValidatedPair,
    expected_revision: int,
    expected_sequence: int,
    preview: str,
    actor: str,
    reason: str,
) -> AuthoredPublication | None:
    try:
        value: Any = connection.execute(
            text(
                "SELECT content.authored_publish_result(:op,:q,:f,:draft,:publication,:policy,:preview,:actor,:reason)"
            ),
            _publish_parameters(
                operation_id, pair, expected_revision, expected_sequence, preview, actor, reason
            ),
        ).scalar_one()
    except SQLAlchemyError:
        raise ContentDatabaseError(
            "Publication replay lookup was rejected; no SQL or content logged."
        ) from None
    return None if value is None else _publication_outcome(value)


def _publish_validated_draft(
    connection: Connection,
    *,
    operation_id: UUID,
    pair: ValidatedPair,
    expected_revision: int,
    expected_sequence: int,
    preview: str,
    actor: str,
    reason: str,
) -> AuthoredPublication:
    result = _call(
        connection,
        "SELECT content.publish_draft(:op,:q,:f,:draft,:publication,:policy,:preview,:actor,:reason)",
        _publish_parameters(
            operation_id, pair, expected_revision, expected_sequence, preview, actor, reason
        ),
    )
    return _publication_outcome(result)


def _reviewed_parameters(
    operation_id: UUID,
    pair: ValidatedPair,
    expected_revision: int,
    expected_sequence: int,
    base_sequence: int,
    preview: str,
    actor: str,
    reason: str,
    reservations: Sequence[UUID],
) -> dict[str, Any]:
    return {
        **_publish_parameters(
            operation_id, pair, expected_revision, expected_sequence, preview, actor, reason
        ),
        "base": base_sequence,
        "reservations": list(reservations),
    }


def reviewed_draft_result(
    connection: Connection,
    *,
    operation_id: UUID,
    pair: ValidatedPair,
    expected_revision: int,
    expected_sequence: int,
    base_sequence: int,
    preview: str,
    actor: str,
    reason: str,
    reservations: Sequence[UUID],
) -> int | None:
    try:
        value: Any = connection.execute(
            text(
                "SELECT content.reviewed_save_result(:op,:q,:f,:draft,:publication,:base,:policy,:preview,CAST(:reservations AS uuid[]),:actor,:reason)"
            ),
            _reviewed_parameters(
                operation_id,
                pair,
                expected_revision,
                expected_sequence,
                base_sequence,
                preview,
                actor,
                reason,
                reservations,
            ),
        ).scalar_one()
    except SQLAlchemyError:
        raise ContentDatabaseError(
            "Draft replay lookup was rejected; no SQL or content logged."
        ) from None
    return None if value is None else int(value["draft_revision"])


def _save_reviewed_draft(
    connection: Connection,
    *,
    operation_id: UUID,
    pair: ValidatedPair,
    expected_revision: int,
    expected_sequence: int,
    base_sequence: int,
    preview: str,
    actor: str,
    reason: str,
    reservations: Sequence[UUID],
) -> int:
    value = _call(
        connection,
        "SELECT content.save_reviewed_draft(:op,:q,:f,:draft,:publication,:base,:policy,:preview,CAST(:reservations AS uuid[]),:actor,:reason)",
        _reviewed_parameters(
            operation_id,
            pair,
            expected_revision,
            expected_sequence,
            base_sequence,
            preview,
            actor,
            reason,
            reservations,
        ),
    )
    return int(value["draft_revision"])

"""Paired preview/save/publication with fresh policy validation and captured context.

The actor is trusted backend/operator context, never a browser field. Session,
CSRF, MFA and the restricted editor role must precede any future HTTP exposure.
"""

import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.content_policy import ContentPolicyError, PairedContentValidator, ValidatedPair
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.operations import (
    AuthoredPublication,
    _publish_validated_draft,
    _save_reviewed_draft,
    authored_publication_result,
    reviewed_draft_result,
)


class AuthoringConflict(ContentDatabaseError):
    def __init__(self, code: str):
        super().__init__("Authoring context changed; review the current draft again.")
        self.code = code


@dataclass(frozen=True)
class DraftContext:
    revision: int
    publication_sequence: int
    base_publication_sequence: int
    base_release_id: UUID | None
    published_release_id: UUID | None
    quiz_document: str
    flashcard_document: str


@dataclass(frozen=True)
class AuthoringPreview:
    action: str
    context: DraftContext
    pair: ValidatedPair
    reason: str
    reservation_ids: tuple[UUID, ...]
    fingerprint: str


def _context(connection: Connection) -> DraftContext:
    # One statement supplies one coherent pair/context. Human preview uses no row locks.
    statement = """SELECT d.revision, d.base_publication_sequence, d.base_release_id,
        d.quiz_document,d.flashcard_document,p.publication_sequence,p.release_id
        FROM content.draft d CROSS JOIN content.active_publication p"""
    row = connection.execute(text(statement)).mappings().one()
    return DraftContext(
        row["revision"],
        row["publication_sequence"],
        row["base_publication_sequence"],
        row["base_release_id"],
        row["release_id"],
        row["quiz_document"],
        row["flashcard_document"],
    )


def _expected(context: DraftContext, revision: int, publication: int) -> None:
    if context.revision != revision or context.publication_sequence != publication:
        raise AuthoringConflict("draft_or_publication_stale")


def _binding(
    action: str,
    context: DraftContext,
    pair: ValidatedPair,
    actor: str,
    reason: str,
    reservations: Sequence[UUID],
) -> str:
    payload = [
        "meducation-authoring-preview-v1",
        action,
        context.revision,
        context.publication_sequence,
        context.base_publication_sequence,
        str(context.base_release_id) if context.base_release_id else None,
        str(context.published_release_id) if context.published_release_id else None,
        pair.quiz_artifact,
        pair.flashcard_artifact,
        pair.policy_version,
        actor,
        reason,
        [str(value) for value in reservations],
    ]
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


class PairedAuthoringService:
    def __init__(
        self, engine: Engine, *, actor: str, validator: PairedContentValidator | None = None
    ):
        if not actor.strip() or len(actor) > 256:
            raise ValueError("A bounded trusted backend actor is required.")
        self.engine = engine
        self.actor = actor
        self.validator = validator or PairedContentValidator()

    def load(self) -> DraftContext:
        try:
            with self.engine.connect() as connection:
                return _context(connection)
        except SQLAlchemyError:
            raise ContentDatabaseError("Authoring load failed; no SQL or content logged.") from None

    @staticmethod
    def _reason(reason: str) -> None:
        if not reason.strip() or len(reason) > 2000:
            raise ContentPolicyError(422, "reason_required")

    def preview(
        self,
        pair: Any,
        *,
        expected_revision: int,
        expected_sequence: int,
        reason: str,
        reservation_ids: Sequence[UUID] = (),
    ) -> AuthoringPreview:
        self._reason(reason)
        if len(reservation_ids) > 10000 or len(set(reservation_ids)) != len(reservation_ids):
            raise ContentPolicyError(422, "invalid_reservations")
        context = self.load()
        _expected(context, expected_revision, expected_sequence)
        validated = self.validator.validate(pair)
        reservations = tuple(sorted(reservation_ids, key=str))
        return AuthoringPreview(
            "save",
            context,
            validated,
            reason,
            reservations,
            _binding("save", context, validated, self.actor, reason, reservations),
        )

    def publish_preview(
        self, *, expected_revision: int, expected_sequence: int, reason: str
    ) -> AuthoringPreview:
        self._reason(reason)
        context = self.load()
        _expected(context, expected_revision, expected_sequence)
        if (
            context.base_publication_sequence != context.publication_sequence
            or context.base_release_id != context.published_release_id
        ):
            raise AuthoringConflict("draft_base_stale")
        validated = self.validator.documents(context.quiz_document, context.flashcard_document)
        return AuthoringPreview(
            "publish",
            context,
            validated,
            reason,
            (),
            _binding("publish", context, validated, self.actor, reason, ()),
        )

    def _check_preview(self, preview: AuthoringPreview, action: str) -> None:
        self._reason(preview.reason)
        if preview.action != action or preview.fingerprint != _binding(
            action,
            preview.context,
            preview.pair,
            self.actor,
            preview.reason,
            preview.reservation_ids,
        ):
            raise AuthoringConflict("preview_stale")

    def save(self, preview: AuthoringPreview, *, operation_id: UUID) -> int:
        self._check_preview(preview, "save")
        try:
            with self.engine.connect() as connection:
                replay = reviewed_draft_result(
                    connection,
                    operation_id=operation_id,
                    pair=preview.pair,
                    expected_revision=preview.context.revision,
                    expected_sequence=preview.context.publication_sequence,
                    preview=preview.fingerprint,
                    base_sequence=preview.context.base_publication_sequence,
                    actor=self.actor,
                    reason=preview.reason,
                    reservations=preview.reservation_ids,
                )
            if replay is not None:
                return replay
        except SQLAlchemyError:
            raise ContentDatabaseError(
                "Draft replay lookup failed; no SQL or content logged."
            ) from None
        # Validate anew: an earlier preview is not a proof for a later mutation.
        pair = self.validator.documents(preview.pair.quiz_artifact, preview.pair.flashcard_artifact)
        if pair != preview.pair:
            raise AuthoringConflict("preview_stale")
        try:
            with self.engine.begin() as connection:
                return _save_reviewed_draft(
                    connection,
                    pair=pair,
                    operation_id=operation_id,
                    expected_revision=preview.context.revision,
                    expected_sequence=preview.context.publication_sequence,
                    base_sequence=preview.context.base_publication_sequence,
                    preview=preview.fingerprint,
                    actor=self.actor,
                    reason=preview.reason,
                    reservations=preview.reservation_ids,
                )
        except SQLAlchemyError:
            raise ContentDatabaseError(
                "Authoring save failed atomically; no SQL or content logged."
            ) from None

    def publish(self, preview: AuthoringPreview, *, operation_id: UUID) -> AuthoredPublication:
        self._check_preview(preview, "publish")
        try:
            with self.engine.connect() as connection:
                replay = authored_publication_result(
                    connection,
                    operation_id=operation_id,
                    pair=preview.pair,
                    expected_revision=preview.context.revision,
                    expected_sequence=preview.context.publication_sequence,
                    preview=preview.fingerprint,
                    actor=self.actor,
                    reason=preview.reason,
                )
            if replay is not None:
                return replay
            # The captured pair is revalidated outside the transaction, then SQL compares
            # exact artifacts under the draft/publication locks before it creates any release.
            pair = self.validator.documents(
                preview.pair.quiz_artifact, preview.pair.flashcard_artifact
            )
            if pair != preview.pair:
                raise AuthoringConflict("preview_stale")
            with self.engine.begin() as connection:
                return _publish_validated_draft(
                    connection,
                    operation_id=operation_id,
                    pair=pair,
                    expected_revision=preview.context.revision,
                    expected_sequence=preview.context.publication_sequence,
                    preview=preview.fingerprint,
                    actor=self.actor,
                    reason=preview.reason,
                )
        except SQLAlchemyError:
            raise ContentDatabaseError(
                "Authored publication failed atomically; no SQL or content logged."
            ) from None

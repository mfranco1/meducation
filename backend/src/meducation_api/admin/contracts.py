"""Bounded wire contracts; no actor or authentication fields from browsers."""

import re
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from meducation_api.auth.oidc import AuthError

Decimal = Annotated[str, Field(pattern=r"^(0|[1-9][0-9]{0,18})$")]
Fingerprint = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Reason = Annotated[str, Field(min_length=1, max_length=2000)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Expected(Contract):
    draftRevision: Decimal
    publicationSequence: Decimal

    @model_validator(mode="after")
    def bounded(self) -> Expected:
        if any(
            int(v) > 9223372036854775807 for v in (self.draftRevision, self.publicationSequence)
        ):
            raise ValueError("Revision exceeds bigint")
        return self


class Slot(Contract):
    kind: Literal["s", "q", "i", "d", "f"]
    count: Annotated[int, Field(ge=1, le=10000)]
    parentId: str | None = None

    @model_validator(mode="after")
    def destination(self) -> Slot:
        if self.kind == "s" and self.parentId is not None or self.kind != "s" and not self.parentId:
            raise ValueError("Creation destination required")
        return self


class Intent(Contract):
    slots: Annotated[list[Slot], Field(min_length=1, max_length=10000)]


class Binding(Intent):
    reservationId: str


class SaveIntent(Contract):
    reservations: Annotated[list[Binding], Field(max_length=10000)]


class ContextCommand(Contract):
    expected: Expected
    reason: Reason

    @model_validator(mode="after")
    def nonblank(self) -> ContextCommand:
        if not self.reason.strip():
            raise ValueError("Reason required")
        return self


class Mutation(ContextCommand):
    operationId: str


class Reservation(Mutation):
    counts: dict[str, int]
    intent: Intent

    @model_validator(mode="after")
    def counts_match(self) -> Reservation:
        totals: dict[str, int] = {}
        for slot in self.intent.slots:
            totals[slot.kind] = totals.get(slot.kind, 0) + slot.count
        if totals != self.counts or not 1 <= sum(totals.values()) <= 10000:
            raise ValueError("Counts must match creation slots")
        return self


class Candidate(ContextCommand):
    pair: dict[str, Any]
    reservationIds: Annotated[list[str], Field(max_length=10000)]
    intent: SaveIntent

    @model_validator(mode="after")
    def unique_bindings(self) -> Candidate:
        ids = self.reservationIds
        if len(set(ids)) != len(ids) or sorted(ids) != sorted(
            b.reservationId for b in self.intent.reservations
        ):
            raise ValueError("Reservation bindings differ")
        return self


class Save(Candidate):
    operationId: str
    previewFingerprint: Fingerprint


class Publish(Mutation):
    previewFingerprint: Fingerprint


class Undo(Mutation):
    targetRevision: Decimal


class Export(Contract):
    target: Literal["draft", "release"]
    draftRevision: Decimal | None = None
    expected: Expected | None = None
    releaseId: str | None = None

    @model_validator(mode="after")
    def selection(self) -> Export:
        if (
            self.target == "draft"
            and (self.draftRevision is None or self.expected is None or self.releaseId is not None)
            or self.target == "release"
            and (
                self.releaseId is None
                or self.draftRevision is not None
                or self.expected is not None
            )
        ):
            raise ValueError("Exact export target required")
        return self


def parse_contract(cls: type[Contract], value: Any) -> dict[str, Any]:
    try:
        result = cls.model_validate(value).model_dump(exclude_none=True)

        def uuids(node: Any) -> None:
            if isinstance(node, dict):
                for k, v in node.items():
                    if (
                        k in ("draftRevision", "publicationSequence", "targetRevision")
                        and int(v) > 9223372036854775807
                    ):
                        raise ValueError("Revision exceeds bigint")
                    if k in ("operationId", "reservationId", "releaseId"):
                        uuid_value(v)
                    elif k == "reservationIds":
                        for item in v:
                            uuid_value(item)
                    elif k != "pair":
                        uuids(v)
            elif isinstance(node, list):
                for item in node:
                    uuids(item)

        uuids(result)
        return result
    except ValidationError, ValueError, TypeError:
        raise AuthError(400, "invalid_admin_envelope") from None


def uuid_value(value: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}", value):
        raise ValueError("UUID required")
    return str(UUID(value))

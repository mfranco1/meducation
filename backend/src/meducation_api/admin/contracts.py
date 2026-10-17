"""Bounded wire contracts for the record editor; no actor or authentication fields."""

import re
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from meducation_api.auth.oidc import AuthError

RecordId = Annotated[str, Field(pattern=r"^[a-zA-Z0-9-]{1,128}$")]
Version = Annotated[int, Field(ge=1, le=2147483647)]
MAX_BULK = 1000
RECORD_BYTES = 1024 * 1024
BULK_BYTES = 16 * 1024 * 1024


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Create(Contract):
    parentId: RecordId | None = None
    # Omitted: append after the parent's last child. Explicit null: first child.
    afterId: RecordId | None = None
    fields: dict[str, Any]


class Update(Contract):
    expectedVersion: Version
    # Top-level merge patch: a key set to null removes that optional field.
    fields: dict[str, Any]


class Delete(Contract):
    expectedVersion: Version
    cascade: bool = False


class Move(Contract):
    expectedVersion: Version
    parentId: RecordId | None = None
    afterId: RecordId | None = None


class Bulk(Contract):
    afterId: RecordId | None = None
    records: Annotated[list[dict[str, Any]], Field(min_length=1, max_length=MAX_BULK)]


class Revert(Contract):
    expectedVersion: Version | None = None


class Empty(Contract):
    pass


class Activate(Contract):
    expectedPublicationSequence: Annotated[int, Field(ge=0)] | None = None


class Export(Contract):
    target: Literal["draft", "release"]
    releaseId: str | None = None


def parse_contract(cls: type[Contract], value: Any) -> tuple[dict[str, Any], set[str]]:
    """Validated fields plus the keys the client actually sent (null vs omitted)."""
    try:
        if not isinstance(value, dict):
            raise TypeError("Object required")
        parsed = cls.model_validate(value)
        result = parsed.model_dump()
        if "releaseId" in result and result["releaseId"] is not None:
            result["releaseId"] = uuid_value(result["releaseId"])
        if cls is Export and (result["target"] == "release") != (result["releaseId"] is not None):
            raise ValueError("Exact export target required")
        return result, set(value)
    except ValidationError, ValueError, TypeError:
        raise AuthError(400, "invalid_admin_envelope") from None


def uuid_value(value: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}", value):
        raise ValueError("UUID required")
    return str(UUID(value))

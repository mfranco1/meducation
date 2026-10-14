"""Owner-only allocation range jobs; independent evidence is durable before DB admission."""

import fcntl
import hashlib
import json
import os
import re
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.migrate import migration_head

KINDS = ("s", "q", "i", "d", "f")
MAXIMUM = 9007199254740992
MAX_RECORD = 16 * 1024


def encode(record: dict[str, Any]) -> bytes:
    return (
        json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode()


def digest(record: dict[str, Any]) -> str:
    return hashlib.sha256(encode(record)).hexdigest()


def _numbers(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == set(KINDS)
        and all(type(number) is int and 1 <= number <= MAXIMUM for number in value.values())
    )


def read_journal(folder: Path, *, durable: bool = False) -> list[dict[str, Any]]:
    """No truncation repair or latest-record guessing; incomplete chains fail closed."""
    records: list[dict[str, Any]] = []
    previous: str | None = None
    lineage = None
    for path in sorted(folder.iterdir()):
        if path.name == ".allocation.lock":
            continue
        if not re.fullmatch(r"[0-9]{20}\.json", path.name) or path.is_symlink():
            raise ContentDatabaseError("Allocation journal contains an unexpected entry.")
        with path.open("rb") as stream:
            raw = stream.read(MAX_RECORD + 1)
            if durable:
                # Repaired/ahead records may have survived a failed fsync. Prove
                # durability of the complete prefix before admitting descendants.
                os.fsync(stream.fileno())
        if len(raw) > MAX_RECORD:
            raise ContentDatabaseError("Allocation record exceeds the limit.")
        record = json.loads(raw)
        generation = len(records) + 1
        if (
            not isinstance(record, dict)
            or set(record)
            != {
                "version",
                "lineage",
                "generation",
                "previous",
                "floors",
                "ceilings",
                "schemaHead",
                "recovery",
            }
            or type(record["version"]) is not int
            or record["version"] != 1
            or type(record["generation"]) is not int
            or record["generation"] != generation
            or path.name != f"{generation:020d}.json"
            or record["previous"] != previous
            or not isinstance(record["lineage"], str)
            or not _numbers(record["floors"])
            or not _numbers(record["ceilings"])
            or type(record["recovery"]) is not bool
            or record["schemaHead"] != migration_head()
            or raw != encode(record)
        ):
            raise ContentDatabaseError("Allocation journal is incomplete or unsupported.")
        if str(UUID(record["lineage"])) != record["lineage"]:
            raise ContentDatabaseError("Allocation lineage must be a canonical UUID.")
        if lineage is not None and record["lineage"] != lineage:
            raise ContentDatabaseError("Allocation journal lineage changed.")
        for kind in KINDS:
            if record["ceilings"][kind] <= record["floors"][kind] or (
                records and record["floors"][kind] < records[-1]["ceilings"][kind]
            ):
                raise ContentDatabaseError("Allocation journal ceilings rewind.")
        lineage = record["lineage"]
        previous = digest(record)
        records.append(record)
    if durable:
        sync_directory(folder)
    return records


@contextmanager
def journal_locks(primary: Path, independent: Path) -> Iterator[None]:
    # Do not create destinations implicitly: their retention/protection is an operator choice.
    directories = [primary.resolve(strict=True), independent.resolve(strict=True)]
    if directories[0] == directories[1] or os.path.samefile(*directories):
        raise ContentDatabaseError("Allocation journals must be distinct directories.")
    with ExitStack() as stack:
        for folder in sorted(directories):
            if not folder.is_dir() or folder.stat().st_mode & 0o077:
                raise ContentDatabaseError("Allocation journal directories must be private (0700).")
            fd = os.open(folder / ".allocation.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            stack.callback(os.close, fd)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ContentDatabaseError(
                    "Another allocation job holds the journal lock."
                ) from None
        yield


def sync_directory(folder: Path) -> None:
    directory_fd = os.open(folder, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def append_record(folder: Path, record: dict[str, Any]) -> None:
    path = folder / f"{record['generation']:020d}.json"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    # Leave partial evidence on failure; a subsequent job must reject/reconcile it.
    with os.fdopen(fd, "wb") as stream:
        stream.write(encode(record))
        stream.flush()
        os.fsync(stream.fileno())
    sync_directory(folder)


def _locked_state(connection: Connection) -> tuple[dict[str, Any], dict[str, int]]:
    connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
    connection.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
    if (
        connection.exec_driver_sql("SELECT version_num FROM content.alembic_version").scalar_one()
        != migration_head()
    ):
        raise ContentDatabaseError("Allocation job requires the current schema head.")
    # All reservation/import paths take counters in this same fixed order.
    rows = connection.execute(
        text(
            "SELECT kind,next_number FROM content.id_counters ORDER BY CASE kind WHEN 's' THEN 1 WHEN 'q' THEN 2 WHEN 'i' THEN 3 WHEN 'd' THEN 4 ELSE 5 END FOR UPDATE"
        )
    ).all()
    floors = {row.kind: row.next_number for row in rows}
    state = dict(
        connection.execute(
            text("SELECT * FROM content.allocation_fence WHERE singleton FOR UPDATE")
        )
        .mappings()
        .one()
    )
    return state, floors


def issue_range(
    engine: Engine,
    *,
    primary: Path,
    independent: Path,
    size: int,
    recovery: bool,
    reason: str,
    independent_copy_confirmed: bool = False,
    rehearsal: bool = False,
) -> dict[str, Any]:
    """Persist two complete journals before advancing counters/admitting a new range.

    Independent retention cannot be proved from a pathname; the operator attests that
    the second destination survives loss of the host. Rehearsals require an isolated DB.
    Recovery deliberately burns the entire last permitted range, not only used IDs.
    """
    if (
        type(size) is not int
        or not 1 <= size <= 100000
        or not isinstance(reason, str)
        or not reason.strip()
        or len(reason) > 2000
    ):
        raise ContentDatabaseError("Allocation range size/reason is invalid.")
    if rehearsal:
        if engine.url.host != "127.0.0.1" or not (engine.url.database or "").startswith(
            ("meducation_test_", "meducation_verify_")
        ):
            raise ContentDatabaseError(
                "Allocation rehearsal requires an isolated loopback test database."
            )
    elif not independent_copy_confirmed:
        raise ContentDatabaseError(
            "Confirm the independent destination's durable off-device retention first."
        )
    try:
        with journal_locks(primary, independent), engine.begin() as connection:
            state, floors = _locked_state(connection)
            a, b = read_journal(primary, durable=True), read_journal(independent, durable=True)
            if a != b:
                raise ContentDatabaseError(
                    "Independent allocation journals differ; admission refused."
                )
            latest = a[-1] if a else None
            if latest and latest["lineage"] != str(state["lineage"]):
                raise ContentDatabaseError(
                    "Allocation evidence belongs to another database lineage."
                )
            if state["required"] and not latest:
                raise ContentDatabaseError("Required allocation evidence is missing.")
            if state["generation"] > len(a) or (
                state["generation"]
                and (
                    digest(a[state["generation"] - 1]) != state["record_digest"]
                    or a[state["generation"] - 1]["ceilings"] != state["ceilings"]
                )
            ):
                raise ContentDatabaseError(
                    "Allocation evidence is older than or differs from the database."
                )
            if recovery:
                if (state["required"] and not state["paused"]) or latest is None:
                    raise ContentDatabaseError(
                        "Recovery requires protected, quarantined allocation state and complete journals."
                    )
                floors = {kind: max(floors[kind], latest["ceilings"][kind]) for kind in KINDS}
            elif state["paused"] or state["generation"] != len(a):
                raise ContentDatabaseError(
                    "Allocation state needs explicit recovery reconciliation."
                )
            else:
                # Range extension starts after every previously permitted ID. This
                # intentionally burns any unused tail instead of reopening old ranges.
                floors = {
                    kind: max(floors[kind], latest["ceilings"][kind] if latest else 1)
                    for kind in KINDS
                }
            ceilings = {kind: floors[kind] + size for kind in KINDS}
            if max(ceilings.values()) > MAXIMUM:
                raise ContentDatabaseError("Allocation number space is exhausted.")
            record = {
                "version": 1,
                "lineage": str(state["lineage"]),
                "generation": len(a) + 1,
                "previous": digest(latest) if latest else None,
                "floors": floors,
                "ceilings": ceilings,
                "schemaHead": migration_head(),
                "recovery": recovery,
            }
            append_record(primary, record)
            append_record(independent, record)
            signature = digest(record)
            for kind in KINDS:
                connection.execute(
                    text("UPDATE content.id_counters SET next_number=:floor WHERE kind=:kind"),
                    {"floor": floors[kind], "kind": kind},
                )
            connection.execute(
                text(
                    "UPDATE content.allocation_fence SET required=true,paused=false,generation=:generation,record_digest=:digest,ceilings=CAST(:ceilings AS jsonb) WHERE singleton"
                ),
                {
                    "generation": record["generation"],
                    "digest": signature,
                    "ceilings": json.dumps(ceilings),
                },
            )
            connection.execute(
                text(
                    "INSERT INTO content.allocation_fence_events(generation,record_digest,floors,ceilings,recovery,reason) VALUES(:generation,:digest,CAST(:floors AS jsonb),CAST(:ceilings AS jsonb),:recovery,:reason)"
                ),
                {
                    "generation": record["generation"],
                    "digest": signature,
                    "floors": json.dumps(floors),
                    "ceilings": json.dumps(ceilings),
                    "recovery": recovery,
                    "reason": reason,
                },
            )
        return {
            "lineage": record["lineage"],
            "generation": record["generation"],
            "recordSha256": signature,
            "ceilings": ceilings,
            "recovery": recovery,
            "rehearsal": rehearsal,
        }
    except OSError, ValueError, TypeError, KeyError, SQLAlchemyError:
        raise ContentDatabaseError(
            "Allocation evidence/job failed; no paths, SQL or credentials logged."
        ) from None

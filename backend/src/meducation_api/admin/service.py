"""Record editor over the per-record draft tables: one transaction per write.

Every write bumps the record version, appends a `draft_changes` row and validates the
affected record with the shared content policy on a minimal pair (record + ancestors).
Publication validates the whole pair and reuses the release store/activation path.
"""

import hashlib
import json
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from decimal import Decimal, localcontext
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.auth.store import Principal, SessionStore
from meducation_api.content_policy import ContentPolicyError, PairedContentValidator, PolicyIssue
from meducation_api.db.draft import (
    CHILDREN,
    FLASHCARD_KINDS,
    FLASHCARD_SCHEMA,
    KINDS,
    QUIZ_KINDS,
    QUIZ_SCHEMA,
    Kind,
    allocate_ids,
    build_documents,
    documents_from_records,
    insert_statement,
    record_from_row,
    reset_draft,
    revisions,
    row_from_record,
    update_statement,
)
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.operations import activate_release, store_release
from meducation_api.operations import database_failure, dependency_result

MISSING: Any = object()
PUBLISH_REASON = "Publish the draft"
ACTIVATE_REASON = "Activate a retained release"
PLACEHOLDER_QUESTION = {
    "stem": "Placeholder",
    "choices": [{"id": "A", "text": "A"}, {"id": "B", "text": "B"}],
    "answer": "A",
    "rationale": "Placeholder",
}


class DraftError(Exception):
    def __init__(self, status: int, code: str, message: str, **extra: Any):
        super().__init__(message)
        self.status = status
        self.code = code
        self.extra = extra


def _invalid_fields(kind: Kind, fields: Mapping[str, Any], path: str) -> None:
    unknown = [key for key in fields if key not in kind.field_keys]
    if unknown:
        issues = tuple(
            PolicyIssue(path + "." + key, "unknown_field", "Field is not editable on this record.")
            for key in unknown[:200]
        )
        raise ContentPolicyError(422, "invalid_content", issues, len(unknown))


def _decimal(value: Decimal) -> str:
    return format(value, "f")


def _spread(prev: Decimal | None, nxt: Decimal | None, count: int) -> list[Decimal]:
    with localcontext() as context:
        context.prec = 1000
        if prev is None and nxt is None:
            return [Decimal(k) for k in range(count)]
        if nxt is None:
            assert prev is not None
            return [prev + k for k in range(1, count + 1)]
        if prev is None:
            return [nxt - (count + 1 - k) for k in range(1, count + 1)]
        step = (nxt - prev) / (2 if count == 1 else 10 ** len(str(count)))
        return [prev + step * k for k in range(1, count + 1)]


class DraftService:
    def __init__(
        self,
        engine: Engine,
        store: SessionStore,
        principal: Principal,
        validator: PairedContentValidator | None = None,
    ):
        self.engine = engine
        self.store = store
        self.principal = principal
        self.validator = validator or PairedContentValidator()

    # Transactions -----------------------------------------------------------------

    @contextmanager
    def _transaction(self, *, fresh: bool = False, write: bool = True) -> Iterator[Connection]:
        self.store.recheck(self.principal, fresh=fresh)
        try:
            if write:
                with self.engine.begin() as c:
                    c.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
                    c.exec_driver_sql("SET LOCAL statement_timeout = '120s'")
                    # One lock serializes every draft writer and publication.
                    c.execute(text("SELECT 1 FROM content.draft_state FOR UPDATE"))
                    yield c
            else:
                with (
                    self.engine.connect().execution_options(isolation_level="REPEATABLE READ") as c,
                    c.begin(),
                ):
                    c.exec_driver_sql("SET TRANSACTION READ ONLY")
                    c.exec_driver_sql("SET LOCAL statement_timeout = '120s'")
                    yield c
            dependency_result("editor")
        except SQLAlchemyError as error:
            state = str(getattr(getattr(error, "orig", None), "sqlstate", ""))
            if state == "55P03":
                raise DraftError(409, "draft_busy", "Another draft write is in progress.") from None
            constraint = getattr(
                getattr(getattr(error, "orig", None), "diag", None), "constraint_name", ""
            )
            if state == "23505" and str(constraint).endswith("_name_key"):
                raise DraftError(
                    409, "duplicate_name", "Another record in the same place already has this name."
                ) from None
            if state.startswith("23"):
                raise DraftError(
                    409, "draft_conflict", "The draft changed during this write."
                ) from None
            database_failure("editor", error)
            raise DraftError(503, "editor_unavailable", "The draft is unavailable.") from None

    # Rows and records ---------------------------------------------------------------

    @staticmethod
    def _get(c: Connection, kind: Kind, identifier: str) -> dict[str, Any] | None:
        row = (
            c.execute(
                text(f"SELECT * FROM content.{kind.table} WHERE id=:id FOR UPDATE"),
                {"id": identifier},
            )
            .mappings()
            .one_or_none()
        )
        return None if row is None else dict(row)

    @staticmethod
    def _wire(kind: Kind, row: Mapping[str, Any]) -> dict[str, Any]:
        return {**record_from_row(kind, row), "version": row["version"]}

    def _snapshot_record(self, kind: Kind, row: Mapping[str, Any]) -> dict[str, Any]:
        return {**self._wire(kind, row), "position": _decimal(row["position"])}

    def _require(self, c: Connection, kind: Kind, identifier: str) -> dict[str, Any]:
        row = self._get(c, kind, identifier)
        if row is None:
            raise DraftError(404, "record_not_found", "The record does not exist in the draft.")
        return row

    def _check_version(self, kind: Kind, row: Mapping[str, Any], expected: int | None) -> None:
        if expected is None:
            raise DraftError(400, "invalid_admin_envelope", "expectedVersion is required.")
        if row["version"] != expected:
            raise DraftError(
                409,
                "version_conflict",
                "The record changed since it was loaded.",
                current=self._wire(kind, row),
            )

    def _log(
        self, c: Connection, kind: Kind, entries: Sequence[tuple[str, str, Any, Any]]
    ) -> list[int]:
        """Append (entity id, action, before, after) change rows in order."""
        if not entries:
            return []
        items = [{"id": i, "action": a, "before": b, "after": f} for i, a, b, f in entries]
        return sorted(
            c.execute(
                text(
                    "INSERT INTO content.draft_changes(actor,kind,entity_id,action,before,after) "
                    "SELECT :actor,:kind,x->>'id',x->>'action',"
                    "CASE WHEN json_typeof(x->'before')='object' THEN x->'before' END,"
                    "CASE WHEN json_typeof(x->'after')='object' THEN x->'after' END "
                    "FROM json_array_elements(CAST(:items AS json)) WITH ORDINALITY e(x,n) "
                    "ORDER BY n RETURNING change_id"
                ),
                {
                    "actor": self.principal.actor,
                    "kind": kind.name,
                    "items": json.dumps(items, ensure_ascii=False, allow_nan=False),
                },
            ).scalars()
        )

    @staticmethod
    def _latest_change(c: Connection) -> int:
        return int(
            c.execute(
                text("SELECT coalesce(max(change_id),0) FROM content.draft_changes")
            ).scalar_one()
        )

    # Validation ---------------------------------------------------------------------

    def _ancestors(self, c: Connection, kind: Kind, parent_id: str | None) -> dict[str, list[Any]]:
        collections: dict[str, list[Any]] = {name: [] for name in KINDS}
        name, identifier = kind.parent, parent_id
        while name is not None and identifier is not None:
            parent_kind = KINDS[name]
            row = self._get(c, parent_kind, identifier)
            if row is None:
                raise DraftError(422, "parent_not_found", "The parent record does not exist.")
            collections[name] = [record_from_row(parent_kind, row)]
            name = parent_kind.parent
            identifier = row[parent_kind.parent_column] if parent_kind.parent_column else None
        return collections

    def _validate(
        self,
        c: Connection,
        kind: Kind,
        records: list[dict[str, Any]],
        parent_id: str | None,
        *,
        bulk: bool = False,
    ) -> None:
        collections = self._ancestors(c, kind, parent_id)
        collections[kind.name] = records
        if kind.name == "quizzes":
            # A quiz needs a question to form a valid pair; empty quizzes are a publish check.
            collections["questions"] = [
                {"id": f"i{n + 1}", "quizId": record["id"], **PLACEHOLDER_QUESTION}
                for n, record in enumerate(records)
            ]
        pair = {
            "quizzes": {"schemaVersion": QUIZ_SCHEMA, **{n: collections[n] for n in QUIZ_KINDS}},
            "flashcards": {
                "schemaVersion": FLASHCARD_SCHEMA,
                **{n: collections[n] for n in FLASHCARD_KINDS},
            },
        }
        try:
            self.validator.validate(pair)
        except ContentPolicyError as error:
            issues = []
            for issue in error.issues:
                path = issue.path
                for index in range(len(records)):
                    prefix = f"$.pair.{kind.bank}.{kind.collection}[{index}]"
                    if path == prefix or path.startswith((prefix + ".", prefix + "[")):
                        target = f"$.records[{index}]" if bulk else "$.record"
                        path = target + path[len(prefix) :]
                        break
                issues.append(PolicyIssue(path, issue.code, issue.message))
            raise ContentPolicyError(
                error.status, error.code, tuple(issues), error.total_issues
            ) from None

    # Placement ----------------------------------------------------------------------

    def _positions(
        self,
        c: Connection,
        kind: Kind,
        parent_id: str | None,
        after: Any,
        *,
        exclude: str | None = None,
        count: int = 1,
    ) -> list[Decimal]:
        table = "content." + kind.table
        sibling = f"{kind.parent_column}=:parent" if kind.parent_column else "true"
        params = {"parent": parent_id, "self": exclude or ""}

        def value(sql: str, **extra: Any) -> Decimal | None:
            result: Decimal | None = c.execute(text(sql), {**params, **extra}).scalar_one()
            return result

        if after is MISSING or after is None:
            edge = value(
                f"SELECT {'max' if after is MISSING else 'min'}(position) FROM {table} "
                f"WHERE {sibling} AND id<>:self"
            )
            if edge is None:
                prev = value(f"SELECT max(position) FROM {table} WHERE id<>:self")
                return _spread(prev, None, count)
            if after is MISSING:
                nxt = value(
                    f"SELECT min(position) FROM {table} WHERE position>:p AND id<>:self", p=edge
                )
                return _spread(edge, nxt, count)
            prev = value(
                f"SELECT max(position) FROM {table} WHERE position<:p AND id<>:self", p=edge
            )
            return _spread(prev, edge, count)
        anchor = (
            c.execute(text(f"SELECT * FROM {table} WHERE id=:id"), {"id": after})
            .mappings()
            .one_or_none()
        )
        if (
            anchor is None
            or after == exclude
            or (kind.parent_column and anchor[kind.parent_column] != parent_id)
        ):
            raise DraftError(422, "invalid_placement", "afterId must be a sibling record.")
        nxt = value(
            f"SELECT min(position) FROM {table} WHERE position>:p AND id<>:self",
            p=anchor["position"],
        )
        return _spread(anchor["position"], nxt, count)

    def _insert(
        self, c: Connection, kind: Kind, record: dict[str, Any], position: Decimal, version: int
    ) -> dict[str, Any]:
        c.execute(
            text(insert_statement(kind)),
            {**row_from_record(kind, record), "position": position, "version": version},
        )
        return self._require(c, kind, record["id"])

    # Reads --------------------------------------------------------------------------

    def snapshot(self, c: Connection | None = None) -> dict[str, Any]:
        if c is None:
            with self._transaction(write=False) as connection:
                return self.snapshot(connection)
        rows = {
            name: [
                dict(row)
                for row in c.execute(
                    text(f"SELECT * FROM content.{kind.table} ORDER BY position")
                ).mappings()
            ]
            for name, kind in KINDS.items()
        }
        documents = documents_from_records(
            {name: [record_from_row(KINDS[name], row) for row in rows[name]] for name in rows}
        )
        active = c.execute(
            text(
                "SELECT p.release_id,p.publication_sequence,r.quiz_artifact,r.flashcard_artifact "
                "FROM content.active_publication p LEFT JOIN content.releases r USING(release_id)"
            )
        ).one()
        state = c.execute(
            text("SELECT base_release_id,published_change_id FROM content.draft_state")
        ).one()
        changed = (
            documents != (active[2], active[3]) if active[0] is not None else any(rows.values())
        )
        return {
            **{name: [self._wire(KINDS[name], row) for row in rows[name]] for name in rows},
            "changed": changed,
            "latestChangeId": self._latest_change(c),
            "publishedChangeId": state[1],
            "baseReleaseId": None if state[0] is None else str(state[0]),
            "activeReleaseId": None if active[0] is None else str(active[0]),
            "publicationSequence": active[1],
        }

    def changes(self, since: int, limit: int) -> dict[str, Any]:
        with self._transaction(write=False) as c:
            found = (
                c.execute(
                    text(
                        "SELECT * FROM content.draft_changes WHERE change_id>:since "
                        "ORDER BY change_id LIMIT :limit"
                    ),
                    {"since": since, "limit": limit + 1},
                )
                .mappings()
                .all()
            )
            latest = self._latest_change(c)
        return {
            "changes": [
                {
                    "changeId": row["change_id"],
                    "createdAt": row["created_at"].isoformat(),
                    "actor": row["actor"],
                    "kind": row["kind"],
                    "entityId": row["entity_id"],
                    "action": row["action"],
                    "before": row["before"],
                    "after": row["after"],
                }
                for row in found[:limit]
            ],
            "latestChangeId": latest,
            "hasMore": len(found) > limit,
        }

    # Record writes ------------------------------------------------------------------

    def _parent_argument(self, kind: Kind, parent_id: str | None) -> None:
        if (kind.parent is None) != (parent_id is None):
            raise DraftError(
                400, "invalid_admin_envelope", "parentId is required except for subjects."
            )

    def create(
        self, kind: Kind, parent_id: str | None, after: Any, fields: dict[str, Any]
    ) -> dict[str, Any]:
        self._parent_argument(kind, parent_id)
        _invalid_fields(kind, fields, "$.fields")
        with self._transaction() as c:
            identifier = allocate_ids(c, kind, 1)[0]
            record: dict[str, Any] = {"id": identifier}
            if kind.parent_key:
                record[kind.parent_key] = parent_id
            record.update({key: fields[key] for key in kind.field_keys if key in fields})
            self._validate(c, kind, [record], parent_id)
            position = self._positions(c, kind, parent_id, after)[0]
            row = self._insert(c, kind, record, position, 1)
            change = self._log(
                c, kind, [(identifier, "create", None, self._snapshot_record(kind, row))]
            )
            return {"record": self._wire(kind, row), "changeId": change[0]}

    def bulk(
        self, kind: Kind, parent_id: str, after: Any, items: list[dict[str, Any]]
    ) -> dict[str, Any]:
        for index, fields in enumerate(items):
            _invalid_fields(kind, fields, f"$.records[{index}]")
        with self._transaction() as c:
            assert kind.parent is not None
            if self._get(c, KINDS[kind.parent], parent_id) is None:
                raise DraftError(404, "record_not_found", "The parent record does not exist.")
            identifiers = allocate_ids(c, kind, len(items))
            records = []
            for identifier, fields in zip(identifiers, items, strict=True):
                record: dict[str, Any] = {"id": identifier}
                if kind.parent_key:
                    record[kind.parent_key] = parent_id
                record.update({key: fields[key] for key in kind.field_keys if key in fields})
                records.append(record)
            self._validate(c, kind, records, parent_id, bulk=True)
            positions = self._positions(c, kind, parent_id, after, count=len(records))
            c.execute(
                text(insert_statement(kind)),
                [
                    {**row_from_record(kind, record), "position": position, "version": 1}
                    for record, position in zip(records, positions, strict=True)
                ],
            )
            rows = [
                dict(row)
                for row in c.execute(
                    text(
                        f"SELECT * FROM content.{kind.table} WHERE id=ANY(:ids) ORDER BY position"
                    ),
                    {"ids": identifiers},
                ).mappings()
            ]
            changes = self._log(
                c,
                kind,
                [(row["id"], "create", None, self._snapshot_record(kind, row)) for row in rows],
            )
            return {"records": [self._wire(kind, row) for row in rows], "changeIds": changes}

    def update(
        self, kind: Kind, identifier: str, expected: int, fields: dict[str, Any]
    ) -> dict[str, Any]:
        _invalid_fields(kind, fields, "$.fields")
        with self._transaction() as c:
            row = self._require(c, kind, identifier)
            self._check_version(kind, row, expected)
            current = record_from_row(kind, row)
            changed = dict(current)
            for key, value in fields.items():
                if value is None:
                    changed.pop(key, None)
                else:
                    changed[key] = value
            if row["field_order"] is None:
                changed = {key: changed[key] for key in kind.keys if key in changed}
            if changed == current and list(changed) == list(current):
                return {"record": self._wire(kind, row), "changeId": None}
            return self._replace(c, kind, row, changed, "update")

    def _replace(
        self,
        c: Connection,
        kind: Kind,
        row: Mapping[str, Any],
        record: dict[str, Any],
        action: str,
        position: Decimal | None = None,
    ) -> dict[str, Any]:
        parent_id = record.get(kind.parent_key) if kind.parent_key else None
        self._validate(c, kind, [record], parent_id)
        c.execute(
            text(update_statement(kind)),
            {**row_from_record(kind, record), "version": row["version"] + 1},
        )
        if position is not None:
            c.execute(
                text(f"UPDATE content.{kind.table} SET position=:p WHERE id=:id"),
                {"p": position, "id": record["id"]},
            )
        after = self._require(c, kind, record["id"])
        change = self._log(
            c,
            kind,
            [
                (
                    record["id"],
                    action,
                    self._snapshot_record(kind, row),
                    self._snapshot_record(kind, after),
                )
            ],
        )
        return {"record": self._wire(kind, after), "changeId": change[0]}

    def move(
        self, kind: Kind, identifier: str, expected: int, parent_id: str | None, after: Any
    ) -> dict[str, Any]:
        if kind.parent is None and parent_id is not None:
            raise DraftError(400, "invalid_admin_envelope", "Subjects have no parent.")
        with self._transaction() as c:
            row = self._require(c, kind, identifier)
            self._check_version(kind, row, expected)
            record = record_from_row(kind, row)
            target = row[kind.parent_column] if kind.parent_column else None
            if parent_id is not None and kind.parent_key:
                target = parent_id
                record[kind.parent_key] = parent_id
            position = self._positions(c, kind, target, after, exclude=identifier)[0]
            return self._replace(c, kind, row, record, "move", position)

    def _descendants(
        self, c: Connection, kind: Kind, ids: list[str]
    ) -> list[tuple[Kind, list[dict[str, Any]]]]:
        """Rows below `ids`, deepest level first."""
        levels: list[tuple[Kind, list[dict[str, Any]]]] = []
        for child_name in CHILDREN[kind.name]:
            child = KINDS[child_name]
            found = [
                dict(row)
                for row in c.execute(
                    text(
                        f"SELECT * FROM content.{child.table} WHERE {child.parent_column}=ANY(:ids) "
                        "ORDER BY position FOR UPDATE"
                    ),
                    {"ids": ids},
                ).mappings()
            ]
            if found:
                levels = self._descendants(c, child, [r["id"] for r in found]) + levels
                levels.append((child, found))
        return levels

    def delete(
        self, kind: Kind, identifier: str, expected: int | None, cascade: bool
    ) -> dict[str, Any]:
        with self._transaction() as c:
            row = self._require(c, kind, identifier)
            self._check_version(kind, row, expected)
            return self._delete(c, kind, row, cascade)

    def _delete(
        self, c: Connection, kind: Kind, row: dict[str, Any], cascade: bool
    ) -> dict[str, Any]:
        levels = self._descendants(c, kind, [row["id"]])
        if levels and not cascade:
            counts: dict[str, int] = {}
            for child, found in levels:
                counts[child.name] = counts.get(child.name, 0) + len(found)
            raise DraftError(
                409, "has_children", "Delete the children first or pass cascade.", children=counts
            )
        deleted: list[dict[str, str]] = []
        changes: list[int] = []
        for level_kind, found in [*levels, (kind, [row])]:
            c.execute(
                text(f"DELETE FROM content.{level_kind.table} WHERE id=ANY(:ids)"),
                {"ids": [r["id"] for r in found]},
            )
            changes += self._log(
                c,
                level_kind,
                [(r["id"], "delete", self._snapshot_record(level_kind, r), None) for r in found],
            )
            deleted += [{"kind": level_kind.name, "id": r["id"]} for r in found]
        return {"deleted": deleted, "changeIds": changes}

    def revert(self, change_id: int, expected: int | None) -> dict[str, Any]:
        with self._transaction() as c:
            change = (
                c.execute(
                    text("SELECT * FROM content.draft_changes WHERE change_id=:id"),
                    {"id": change_id},
                )
                .mappings()
                .one_or_none()
            )
            if change is None:
                raise DraftError(404, "change_not_found", "The change does not exist.")
            kind = KINDS[change["kind"]]
            snapshot = change["before"] or change["after"]
            if not set(snapshot) <= {*kind.keys, "version", "position"} or (
                kind.parent_key and kind.parent_key not in snapshot
            ):
                raise DraftError(
                    409, "change_obsolete", "The change predates the current content schema."
                )
            current = self._get(c, kind, change["entity_id"])
            before = change["before"]
            response: dict[str, Any] = {"kind": kind.name, "id": change["entity_id"]}
            if change["action"] == "create":
                if current is None:
                    raise DraftError(404, "record_not_found", "The record no longer exists.")
                self._check_version(kind, current, expected)
                result = self._delete(c, kind, current, False)
                return {**response, "record": None, "changeId": result["changeIds"][0]}
            record = {k: v for k, v in before.items() if k not in ("version", "position")}
            position = Decimal(before["position"])
            parent_id = record.get(kind.parent_key) if kind.parent_key else None
            if (
                change["action"] != "update"
                and parent_id is not None
                and self._get(c, KINDS[kind.parent or ""], parent_id) is None
            ):
                raise DraftError(409, "parent_missing", "The original parent no longer exists.")
            restore_position = change["action"] in ("move", "delete")
            if restore_position:
                taken = c.execute(
                    text(f"SELECT id FROM content.{kind.table} WHERE position=:p"), {"p": position}
                ).scalar_one_or_none()
                if taken is not None and taken != change["entity_id"]:
                    raise DraftError(409, "position_taken", "The original position is in use.")
            if change["action"] == "delete":
                if current is not None:
                    raise DraftError(409, "record_exists", "The record already exists.")
                self._validate(c, kind, [record], parent_id)
                row = self._insert(c, kind, record, position, before["version"] + 1)
                ids = self._log(
                    c, kind, [(row["id"], "create", None, self._snapshot_record(kind, row))]
                )
                return {**response, "record": self._wire(kind, row), "changeId": ids[0]}
            if current is None:
                raise DraftError(404, "record_not_found", "The record no longer exists.")
            self._check_version(kind, current, expected)
            if change["action"] == "update" and kind.parent_key and kind.parent_column:
                # Field reverts keep the record where it is now.
                record[kind.parent_key] = current[kind.parent_column]
            result = self._replace(
                c,
                kind,
                current,
                record,
                change["action"],
                position if restore_position else None,
            )
            return {**response, **result}

    # Draft-wide actions -------------------------------------------------------------

    def discard(self) -> dict[str, Any]:
        with self._transaction(fresh=True) as c:
            active: UUID | None = c.execute(
                text("SELECT release_id FROM content.active_publication")
            ).scalar_one()
            if active is None:
                raise DraftError(409, "publication_required", "There is no active release.")
            reset_draft(c, active)
            return self.snapshot(c)

    def publish(self) -> dict[str, Any]:
        with self._transaction(fresh=True) as c:
            return publish_draft(
                c,
                self.validator,
                self.principal.actor,
                recheck=lambda: self.store.recheck(self.principal, fresh=True),
            )

    # Releases -----------------------------------------------------------------------

    def releases(self, limit: int, cursor: str | None) -> dict[str, Any]:
        with self._transaction(write=False) as c:
            active: UUID | None = c.execute(
                text("SELECT release_id FROM content.active_publication")
            ).scalar_one()
            found = (
                c.execute(
                    text(
                        "SELECT t.release_id,t.quiz_revision,t.flashcard_revision,t.created_at,"
                        "(SELECT max(publication_sequence) FROM content.publication_events p "
                        "WHERE p.release_id=t.release_id) AS latest FROM content.releases t "
                        "WHERE state='finalized' AND quiz_schema_version=:schema "
                        "AND (CAST(:cursor AS uuid) IS NULL OR "
                        "(created_at,release_id)<(SELECT created_at,release_id FROM content.releases "
                        "WHERE release_id=CAST(:cursor AS uuid))) "
                        "ORDER BY created_at DESC,release_id DESC LIMIT :limit"
                    ),
                    {"cursor": cursor, "limit": limit, "schema": QUIZ_SCHEMA},
                )
                .mappings()
                .all()
            )
        return {
            "releases": [
                {
                    "releaseId": str(row["release_id"]),
                    "quizRevision": row["quiz_revision"],
                    "flashcardRevision": row["flashcard_revision"],
                    "createdAt": row["created_at"].isoformat(),
                    "latestPublicationSequence": row["latest"],
                    "active": row["release_id"] == active,
                }
                for row in found
            ]
        }

    def activate(self, release_id: UUID, expected: int | None) -> dict[str, Any]:
        with self._transaction(fresh=True) as c:
            current: int = c.execute(
                text("SELECT publication_sequence FROM content.active_publication")
            ).scalar_one()
            if expected is not None and expected != current:
                raise DraftError(409, "publication_stale", "The active release changed.")
            if not c.execute(
                text(
                    "SELECT EXISTS(SELECT 1 FROM content.releases WHERE release_id=:r "
                    "AND state='finalized' AND quiz_schema_version=:schema)"
                ),
                {"r": release_id, "schema": QUIZ_SCHEMA},
            ).scalar_one():
                raise DraftError(404, "release_not_found", "The release does not exist.")
            try:
                publication = activate_release(
                    c,
                    operation_id=uuid4(),
                    release_id=release_id,
                    expected_sequence=current,
                    actor=self.principal.actor,
                    reason=ACTIVATE_REASON,
                )
            except ContentDatabaseError:
                raise DraftError(
                    503, "activate_failed", "The release could not be activated."
                ) from None
            return {
                "releaseId": str(publication.release_id),
                "publicationSequence": publication.publication_sequence,
            }

    def export_pair(self, release_id: str | None) -> tuple[str, str, dict[str, Any]]:
        """Artifacts plus manifest context for the draft (None) or a finalized release."""
        with self._transaction(write=False) as c:
            active = c.execute(
                text("SELECT release_id,publication_sequence FROM content.active_publication")
            ).one()
            if release_id is None:
                quiz, flashcards = build_documents(c)
                state = c.execute(text("SELECT base_release_id FROM content.draft_state")).one()
                context: dict[str, Any] = {
                    "latestChangeId": self._latest_change(c),
                    "baseReleaseId": None if state[0] is None else str(state[0]),
                }
            else:
                found = c.execute(
                    text(
                        "SELECT quiz_artifact,flashcard_artifact FROM content.releases "
                        "WHERE release_id=CAST(:r AS uuid) AND state='finalized'"
                    ),
                    {"r": release_id},
                ).one_or_none()
                if found is None:
                    raise DraftError(404, "release_not_found", "The release does not exist.")
                quiz, flashcards = found[0], found[1]
                context = {}
        context["publication"] = {
            "releaseId": None if active[0] is None else str(active[0]),
            "sequence": active[1],
            "selectedIsCurrent": release_id is not None and str(active[0]) == release_id,
        }
        context["revisions"] = revisions(quiz, flashcards)
        return quiz, flashcards, context


def publish_draft(
    c: Connection,
    validator: PairedContentValidator,
    actor: str,
    recheck: Callable[[], None] = lambda: None,
) -> dict[str, Any]:
    """Store and activate the draft as a release; `c` must hold the draft_state lock."""
    quiz, flashcards = build_documents(c)
    active = c.execute(
        text(
            "SELECT p.release_id,p.publication_sequence,r.quiz_artifact,r.flashcard_artifact "
            "FROM content.active_publication p LEFT JOIN content.releases r USING(release_id)"
        )
    ).one()
    unchanged = (
        (quiz, flashcards) == (active[2], active[3])
        if active[0] is not None
        else not json.loads(quiz)["subjects"] and not json.loads(flashcards)["decks"]
    )
    if unchanged:
        return {
            "published": False,
            "releaseId": None if active[0] is None else str(active[0]),
            "publicationSequence": active[1],
        }
    pair = validator.documents(quiz, flashcards)
    if (pair.quiz_artifact, pair.flashcard_artifact) != (quiz, flashcards):
        raise DraftError(503, "publish_failed", "Publication serialization differs.")
    recheck()
    try:
        release = store_release(
            c,
            operation_id=uuid4(),
            quiz_text=quiz,
            flashcard_text=flashcards,
            source_hashes={
                "quiz": hashlib.sha256(quiz.encode()).hexdigest(),
                "flashcard": hashlib.sha256(flashcards.encode()).hexdigest(),
            },
            actor=actor,
            reason=PUBLISH_REASON,
        )
        publication = activate_release(
            c,
            operation_id=uuid4(),
            release_id=release.release_id,
            expected_sequence=active[1],
            actor=actor,
            reason=PUBLISH_REASON,
        )
    except ContentDatabaseError:
        raise DraftError(503, "publish_failed", "The release could not be stored.") from None
    latest = DraftService._latest_change(c)
    c.execute(
        text("UPDATE content.draft_state SET base_release_id=:r,published_change_id=:c"),
        {"r": release.release_id, "c": latest},
    )
    return {
        "published": True,
        "releaseId": str(release.release_id),
        "publicationSequence": publication.publication_sequence,
        "quizRevision": release.quiz_revision,
        "flashcardRevision": release.flashcard_revision,
        "publishedChangeId": latest,
    }

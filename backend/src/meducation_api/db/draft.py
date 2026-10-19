"""Per-record draft storage: row/record mapping, document build, release load and IDs.

Records use the stored document shape (camelCase keys). Top-level key order is kept in
`field_order` only when it differs from the canonical order; nested values are `json`
columns, which keep their own key order. Documents are built from rows ordered by
`position` and serialized exactly like release artifacts.
"""

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import Connection, text

from meducation_api.content_policy import artifact_text
from meducation_api.db.engine import ContentDatabaseError

QUIZ_SCHEMA = 5
FLASHCARD_SCHEMA = 3


@dataclass(frozen=True)
class Kind:
    name: str  # API and change-log name; also the document collection except cards.
    table: str
    collection: str
    bank: str  # "quizzes" or "flashcards" (paired validator envelope keys)
    prefix: str
    parent: str | None
    parent_key: str | None
    parent_column: str | None
    # (document key, column, json column)
    fields: tuple[tuple[str, str, bool], ...]

    @property
    def keys(self) -> tuple[str, ...]:
        return ("id", *((self.parent_key,) if self.parent_key else ()), *self.field_keys)

    @property
    def field_keys(self) -> tuple[str, ...]:
        return tuple(key for key, _, _ in self.fields)

    @property
    def numeric_ids(self) -> bool:
        return self.prefix in ("s", "t", "q", "i")

    @property
    def sequence(self) -> str:
        return (
            "content.draft_"
            + {"s": "subject", "t": "topic", "q": "quiz", "i": "question"}[self.prefix]
            + "_ids"
        )


KINDS: dict[str, Kind] = {
    kind.name: kind
    for kind in (
        Kind(
            "subjects",
            "draft_subjects",
            "subjects",
            "quizzes",
            "s",
            None,
            None,
            None,
            (
                ("name", "name", False),
                ("accent", "accent", False),
                ("description", "description", False),
            ),
        ),
        Kind(
            "topics",
            "draft_topics",
            "topics",
            "quizzes",
            "t",
            "subjects",
            "subjectId",
            "subject_id",
            (("name", "name", False), ("description", "description", False)),
        ),
        Kind(
            "quizzes",
            "draft_quizzes",
            "quizzes",
            "quizzes",
            "q",
            "topics",
            "topicId",
            "topic_id",
            (("name", "name", False), ("description", "description", False)),
        ),
        Kind(
            "questions",
            "draft_questions",
            "questions",
            "quizzes",
            "i",
            "quizzes",
            "quizId",
            "quiz_id",
            (
                ("stem", "stem", False),
                ("choices", "choices", True),
                ("answer", "answer", False),
                ("verifiedAnswer", "verified_answer", False),
                ("answerNote", "answer_note", False),
                ("rationale", "rationale", False),
                ("rationaleMeta", "rationale_meta", True),
                ("choiceExplanations", "choice_explanations", True),
                ("pearls", "pearls", True),
                ("metadata", "metadata", True),
            ),
        ),
        Kind(
            "decks",
            "draft_decks",
            "decks",
            "flashcards",
            "d",
            "topics",
            "topicId",
            "topic_id",
            (("name", "name", False), ("description", "description", False)),
        ),
        Kind(
            "cards",
            "draft_flashcards",
            "cards",
            "flashcards",
            "f",
            "decks",
            "deckId",
            "deck_id",
            (
                ("front", "front", False),
                ("back", "back", False),
                ("sources", "sources", False),
                ("reviewNote", "review_note", False),
            ),
        ),
    )
}
CHILDREN: dict[str, tuple[str, ...]] = {
    "subjects": ("topics",),
    "topics": ("quizzes", "decks"),
    "quizzes": ("questions",),
    "decks": ("cards",),
    "questions": (),
    "cards": (),
}
QUIZ_KINDS = ("subjects", "topics", "quizzes", "questions")
FLASHCARD_KINDS = ("decks", "cards")


def record_from_row(kind: Kind, row: Mapping[str, Any]) -> dict[str, Any]:
    values: dict[str, Any] = {"id": row["id"]}
    if kind.parent_key and kind.parent_column:
        values[kind.parent_key] = row[kind.parent_column]
    for key, column, _ in kind.fields:
        if row[column] is not None:
            values[key] = row[column]
    order = list(row["field_order"] or kind.keys)
    order += [key for key in kind.keys if key not in order]
    return {key: values[key] for key in order if key in values}


def row_from_record(kind: Kind, record: Mapping[str, Any]) -> dict[str, Any]:
    """Column values for a validated record; absent optional fields become NULL."""
    canonical = [key for key in kind.keys if key in record]
    row: dict[str, Any] = {
        "id": record["id"],
        "field_order": None if list(record) == canonical else list(record),
    }
    if kind.parent_key and kind.parent_column:
        row[kind.parent_column] = record[kind.parent_key]
    for key, column, is_json in kind.fields:
        value = record.get(key)
        row[column] = (
            json.dumps(value, ensure_ascii=False, allow_nan=False)
            if is_json and value is not None
            else value
        )
    return row


def insert_statement(kind: Kind) -> str:
    columns = ["id", "version", "position", "field_order"]
    if kind.parent_column:
        columns.append(kind.parent_column)
    columns += [column for _, column, _ in kind.fields]
    json_columns = {column for _, column, is_json in kind.fields if is_json}
    values = [
        f"CAST(:{column} AS json)" if column in json_columns else ":" + column for column in columns
    ]
    return f"INSERT INTO content.{kind.table}({','.join(columns)}) VALUES({','.join(values)})"


def update_statement(kind: Kind) -> str:
    """Replace the content of one row (identity and position stay)."""
    columns = ["field_order"]
    if kind.parent_column:
        columns.append(kind.parent_column)
    columns += [column for _, column, _ in kind.fields]
    json_columns = {column for _, column, is_json in kind.fields if is_json}
    assignments = [
        f"{column}=CAST(:{column} AS json)" if column in json_columns else f"{column}=:{column}"
        for column in columns
    ]
    return f"UPDATE content.{kind.table} SET {','.join(assignments)},version=:version WHERE id=:id"


def rows(connection: Connection, kind: Kind) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in connection.execute(
            text(f"SELECT * FROM content.{kind.table} ORDER BY position")
        ).mappings()
    ]


def documents_from_records(records: Mapping[str, list[dict[str, Any]]]) -> tuple[str, str]:
    quizzes = {"schemaVersion": QUIZ_SCHEMA, **{name: records[name] for name in QUIZ_KINDS}}
    flashcards = {
        "schemaVersion": FLASHCARD_SCHEMA,
        **{name: records[name] for name in FLASHCARD_KINDS},
    }
    return artifact_text(quizzes), artifact_text(flashcards)


def build_documents(connection: Connection) -> tuple[str, str]:
    """Quiz and flashcard artifacts from draft rows."""
    return documents_from_records(
        {
            name: [record_from_row(kind, row) for row in rows(connection, kind)]
            for name, kind in KINDS.items()
        }
    )


def revisions(quiz_text: str, flashcard_text: str) -> dict[str, str]:
    """Content revisions as `content.checked_artifacts` computes them."""
    bank = json.loads(quiz_text)
    registry = [
        json.dumps(
            [{key: record[key] for key in keys if key in record} for record in bank[name]],
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
        for name, keys in (
            ("subjects", ("id", "name", "accent", "description")),
            ("topics", ("id", "subjectId", "name", "description")),
        )
    ]
    return {
        "quizRevision": "sha256-" + hashlib.sha256(quiz_text.encode()).hexdigest(),
        "flashcardRevision": "sha256-"
        + hashlib.sha256(
            "\n".join(["flashcards-v3", *registry, flashcard_text]).encode()
        ).hexdigest(),
    }


def load_release(
    connection: Connection, release_id: UUID, versions: Mapping[tuple[str, str], int] | None = None
) -> None:
    """Fill empty draft tables from a finalized release's artifacts, keeping positions.

    `versions` maps (kind, id) to the version a record had before it was replaced, so a
    reloaded record never repeats a version an editor may still hold.
    """
    artifacts = connection.execute(
        text(
            "SELECT quiz_artifact,flashcard_artifact FROM content.releases "
            "WHERE release_id=:id AND state='finalized'"
        ),
        {"id": release_id},
    ).one_or_none()
    if artifacts is None:
        raise ContentDatabaseError("Selected finalized release does not exist.")
    documents = {"quizzes": json.loads(artifacts[0]), "flashcards": json.loads(artifacts[1])}
    if documents["quizzes"]["schemaVersion"] != QUIZ_SCHEMA:
        raise ContentDatabaseError("Selected release predates the current content schema.")
    for name, kind in KINDS.items():
        records = documents[kind.bank][kind.collection]
        if records:
            connection.execute(
                text(insert_statement(kind)),
                [
                    {
                        **row_from_record(kind, record),
                        "position": index,
                        "version": (versions or {}).get((name, record["id"]), 0) + 1,
                    }
                    for index, record in enumerate(records)
                ],
            )


def clear(connection: Connection) -> dict[tuple[str, str], int]:
    """Delete every draft row (children first); return the replaced versions."""
    replaced: dict[tuple[str, str], int] = {}
    for name in ("questions", "cards", "quizzes", "decks", "topics", "subjects"):
        for row in connection.execute(
            text(f"DELETE FROM content.{KINDS[name].table} RETURNING id,version")
        ):
            replaced[(name, str(row[0]))] = int(row[1])
    return replaced


def reset_draft(connection: Connection, release_id: UUID) -> None:
    """Replace the draft with a release and mark every recorded change as published."""
    load_release(connection, release_id, clear(connection))
    connection.execute(
        text(
            "UPDATE content.draft_state SET base_release_id=:r,published_change_id="
            "(SELECT coalesce(max(change_id),0) FROM content.draft_changes)"
        ),
        {"r": release_id},
    )


def id_floor(connection: Connection, kind: Kind) -> int:
    """Largest numeric suffix ever used for a kind, across every release and the draft."""
    pattern = "^" + kind.prefix + "[1-9][0-9]*$"
    release_table = {"s": "subjects", "t": "topics", "q": "quizzes", "i": "questions"}[kind.prefix]
    value: Any = connection.execute(
        text(f"""
SELECT coalesce(max(n),0) FROM (
  SELECT substring(id FROM 2)::numeric n FROM content.{release_table} WHERE id ~ :p
  UNION ALL SELECT substring(id FROM 2)::numeric FROM content.{kind.table} WHERE id ~ :p
) ids"""),
        {"p": pattern},
    ).scalar_one()
    return int(value)


def advance_id_sequences(connection: Connection, by: int) -> dict[str, int]:
    """Move each numeric-ID sequence `by` past the larger of its position and every known ID.

    Use after restoring an older backup so IDs that learners may have seen are not reused.
    Returns the next ID number each kind will receive.
    """
    if by < 0:
        raise ValueError("Advance must not be negative.")
    result: dict[str, int] = {}
    for kind in KINDS.values():
        if not kind.numeric_ids:
            continue
        sequence = connection.execute(
            text(f"SELECT last_value,is_called FROM {kind.sequence}")
        ).one()
        current = int(sequence[0]) if sequence[1] else int(sequence[0]) - 1
        used = max(current, id_floor(connection, kind)) + by
        if used >= 9007199254740991:
            raise ContentDatabaseError("ID sequence would exceed the supported range.")
        if used > 0:
            connection.execute(
                text("SELECT setval(CAST(:s AS regclass),:v,true)"), {"s": kind.sequence, "v": used}
            )
        else:
            connection.execute(
                text("SELECT setval(CAST(:s AS regclass),1,false)"), {"s": kind.sequence}
            )
        result[kind.prefix] = used + 1
    return result


def allocate_ids(connection: Connection, kind: Kind, count: int) -> list[str]:
    """New IDs: UUID-based for decks and cards, sequence numbers (never reused) otherwise."""
    if not kind.numeric_ids:
        return list(
            connection.execute(
                text("SELECT :p || '-' || gen_random_uuid()::text FROM generate_series(1,:n)"),
                {"p": kind.prefix, "n": count},
            ).scalars()
        )
    numbers = connection.execute(
        text("SELECT nextval(CAST(:s AS regclass)) FROM generate_series(1,:n)"),
        {"s": kind.sequence, "n": count},
    )
    return [kind.prefix + str(row[0]) for row in numbers]

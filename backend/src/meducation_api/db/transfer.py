"""Captured paired-file import and independently reconstructed immutable exports."""

import hashlib
import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.operations import ReleaseIdentity, paired_artifacts, store_release

MAX_FILE_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True)
class CapturedPair:
    quiz_artifact: str
    flashcard_artifact: str
    quiz_source_sha256: str
    flashcard_source_sha256: str
    warnings: int

    @property
    def source_hashes(self) -> dict[str, str]:
        return {"quiz": self.quiz_source_sha256, "flashcard": self.flashcard_source_sha256}


def _read(path: Path) -> bytes:
    with path.open("rb") as stream:
        value = stream.read(MAX_FILE_BYTES + 1)
    if len(value) > MAX_FILE_BYTES:
        raise ContentDatabaseError("Content input exceeds the 64 MiB per-file limit.")
    return value


def capture_pair(quiz: Path, flashcard: Path, *, repository: Path) -> CapturedPair:
    """Read once; validate these exact bytes with both existing policy implementations."""
    try:
        qb, fb = _read(quiz), _read(flashcard)
        qtext, ftext = paired_artifacts(qb.decode("utf-8"), fb.decode("utf-8"))
        # Reject unpaired surrogate code points before any database transaction.
        qtext.encode("utf-8")
        ftext.encode("utf-8")
        runner = repository / "node_modules/tsx/dist/loader.mjs"
        gate = repository / "scripts/content/validate-paired-files.ts"
        if not runner.is_file() or not gate.is_file():
            raise ContentDatabaseError(
                "Import requires a repository checkout with npm ci completed."
            )
        with tempfile.TemporaryDirectory(prefix="meducation-content-validation-") as folder:
            qpath, fpath = Path(folder) / "quiz.json", Path(folder) / "flashcards.json"
            for path, value in ((qpath, qb), (fpath, fb)):
                path.touch(mode=0o600)
                path.write_bytes(value)
            checked = subprocess.run(
                [
                    "node",
                    "--import",
                    str(runner.resolve()),
                    str(gate.resolve()),
                    str(qpath),
                    str(fpath),
                ],
                cwd=repository,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
        if checked.returncode:
            raise ContentDatabaseError(
                "Paired repository content validation failed; no content logged."
            )
        summary = json.loads(checked.stdout)
        if summary.get("errors") != 0 or type(summary.get("warnings")) is not int:
            raise ContentDatabaseError("Invalid repository validation result.")
        return CapturedPair(
            qtext,
            ftext,
            hashlib.sha256(qb).hexdigest(),
            hashlib.sha256(fb).hexdigest(),
            summary["warnings"],
        )
    except OSError, UnicodeError, ValueError, subprocess.SubprocessError:
        raise ContentDatabaseError(
            "Content capture/validation failed; no input or paths logged."
        ) from None


def import_pair(
    engine: Engine, pair: CapturedPair, *, operation_id: UUID, actor: str, reason: str
) -> ReleaseIdentity:
    try:
        with engine.begin() as connection:
            return store_release(
                connection,
                operation_id=operation_id,
                quiz_text=pair.quiz_artifact,
                flashcard_text=pair.flashcard_artifact,
                source_hashes=pair.source_hashes,
                actor=actor,
                reason=reason,
            )
    except SQLAlchemyError:
        raise ContentDatabaseError(
            "Content import failed atomically; no SQL or credentials logged."
        ) from None


# Only these fixed tables/columns are used; identifiers never come from user input.
_COLLECTIONS = (
    ("subjects", "subjects", {"id": "id", "name": "name", "accent": "accent"}),
    ("quizzes", "quizzes", {"id": "id", "subjectId": "subject_id", "name": "name"}),
    (
        "questions",
        "questions",
        {
            "id": "id",
            "quizId": "quiz_id",
            "stem": "stem",
            "choices": "choices",
            "answer": "answer",
            "verifiedAnswer": "verified_answer",
            "answerNote": "answer_note",
            "rationale": "rationale",
            "rationaleMeta": "rationale_meta",
            "choiceExplanations": "choice_explanations",
            "pearls": "pearls",
            "metadata": "metadata",
        },
    ),
    (
        "decks",
        "decks",
        {
            "id": "id",
            "subjectId": "subject_id",
            "name": "name",
            "description": "description",
        },
    ),
    (
        "cards",
        "flashcards",
        {
            "id": "id",
            "deckId": "deck_id",
            "front": "front",
            "back": "back",
            "sources": "sources",
            "reviewNote": "review_note",
        },
    ),
)


def _ordered(actual: Any, template: Any, path: str = "$") -> Any:
    """Use only artifact key order; all exported leaves come from normalized rows."""
    if type(actual) is not type(template):
        raise ContentDatabaseError(f"Release reconstruction type differs at {path}.")
    if isinstance(actual, dict):
        if actual.keys() != template.keys():
            raise ContentDatabaseError(f"Release reconstruction fields differ at {path}.")
        return {key: _ordered(actual[key], template[key], path + "." + key) for key in template}
    if isinstance(actual, list):
        if len(actual) != len(template):
            raise ContentDatabaseError(f"Release reconstruction length differs at {path}.")
        return [_ordered(value, template[i], f"{path}[{i}]") for i, value in enumerate(actual)]
    if actual != template:
        raise ContentDatabaseError(f"Release reconstruction value differs at {path}.")
    return actual


def _digest(value: str) -> str:
    return "sha256-" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def reconstruct_release(
    connection: Connection, release_id: UUID
) -> tuple[str, str, dict[str, Any]]:
    release = (
        connection.execute(
            text("SELECT * FROM content.releases WHERE release_id=:id AND state='finalized'"),
            {"id": release_id},
        )
        .mappings()
        .one_or_none()
    )
    if release is None:
        raise ContentDatabaseError("Selected finalized release does not exist.")
    q: dict[str, Any] = {"schemaVersion": 4}
    f: dict[str, Any] = {"schemaVersion": 2}
    for name, table, fields in _COLLECTIONS:
        rows = (
            connection.execute(
                text(f"SELECT * FROM content.{table} WHERE release_id=:id ORDER BY position"),
                {"id": release_id},
            )
            .mappings()
            .all()
        )
        if [row["position"] for row in rows] != list(range(len(rows))):
            raise ContentDatabaseError("Release collection ordinals differ.")
        (q if name in ("subjects", "quizzes", "questions") else f)[name] = [
            {key: row[column] for key, column in fields.items() if row[column] is not None}
            for row in rows
        ]
    qt, ft = paired_artifacts(
        json.dumps(_ordered(q, json.loads(release["quiz_artifact"])), ensure_ascii=False),
        json.dumps(_ordered(f, json.loads(release["flashcard_artifact"])), ensure_ascii=False),
    )
    subjects = json.dumps(
        [{key: s[key] for key in ("id", "name", "accent")} for s in q["subjects"]],
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )
    if (
        qt != release["quiz_artifact"]
        or ft != release["flashcard_artifact"]
        or _digest(qt) != release["quiz_revision"]
        or _digest("flashcards-v2\n" + subjects + "\n" + ft) != release["flashcard_revision"]
    ):
        raise ContentDatabaseError("Release artifacts/revisions differ from normalized content.")
    active = (
        connection.execute(
            text("SELECT release_id,publication_sequence FROM content.active_publication")
        )
        .mappings()
        .one()
    )
    sequences: Any = (
        connection.execute(
            text(
                "SELECT publication_sequence FROM content.publication_events WHERE release_id=:id "
                "ORDER BY publication_sequence"
            ),
            {"id": release_id},
        )
        .scalars()
        .all()
    )
    manifest = {
        "manifestVersion": 1,
        "releaseId": str(release_id),
        "schemaVersions": {"quiz": 4, "flashcard": 2},
        "revisions": {"quiz": release["quiz_revision"], "flashcard": release["flashcard_revision"]},
        "artifactsSha256": {
            "quiz": hashlib.sha256(qt.encode()).hexdigest(),
            "flashcard": hashlib.sha256(ft.encode()).hexdigest(),
        },
        "publication": {
            "observedActiveReleaseId": str(active["release_id"]) if active["release_id"] else None,
            "observedActiveSequence": active["publication_sequence"],
            "selectedReleaseSequences": sequences,
        },
    }
    return qt, ft, manifest


def export_release(engine: Engine, release_id: UUID, output: Path) -> dict[str, Any]:
    """New directory only; manifest is the last completion marker. Never overwrite files."""
    try:
        with (
            engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection,
            connection.begin(),
        ):
            connection.exec_driver_sql("SET TRANSACTION READ ONLY")
            qt, ft, manifest = reconstruct_release(connection, release_id)
        output.mkdir(mode=0o700)
        try:
            for name, value in (
                ("questionBank.json", qt),
                ("flashcardBank.json", ft),
                ("manifest.json", json.dumps(manifest, indent=2) + "\n"),
            ):
                with (output / name).open("x", encoding="utf-8", newline="\n") as stream:
                    stream.write(value)
        except BaseException:
            shutil.rmtree(output)
            raise
        return manifest
    except SQLAlchemyError, OSError, ValueError:
        raise ContentDatabaseError(
            "Content export failed; no files overwritten or SQL logged."
        ) from None

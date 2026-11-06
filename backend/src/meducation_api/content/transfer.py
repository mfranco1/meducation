"""Validated capture of paired files, reconstructed immutable exports and offline export checks."""

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

from meducation_api.content.draft import FLASHCARD_SCHEMA, QUIZ_SCHEMA, build_documents
from meducation_api.content.draft import revisions as content_revisions
from meducation_api.content.releases import paired_artifacts
from meducation_api.content_policy import ContentPolicyError, parse_json
from meducation_api.db.engine import ContentDatabaseError

MAX_FILE_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True)
class CapturedPair:
    quiz_artifact: str
    flashcard_artifact: str
    warnings: int


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
        return CapturedPair(qtext, ftext, summary["warnings"])
    except OSError, UnicodeError, ValueError, subprocess.SubprocessError:
        raise ContentDatabaseError(
            "Content capture/validation failed; no input or paths logged."
        ) from None


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
    if release["quiz_schema_version"] != QUIZ_SCHEMA:
        raise ContentDatabaseError("Selected release predates the current content schema.")
    qt, ft = build_documents(connection, release_id)
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
        "schemaVersions": {"quiz": QUIZ_SCHEMA, "flashcard": FLASHCARD_SCHEMA},
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


def inspect_export(directory: Path, *, repository: Path, audit: bool = False) -> dict[str, Any]:
    """Support operator directories and extracted HTTP ZIPs, with manifest byte checks.

    Digests prove internal consistency, not authenticity or that an export is current.
    The selected manifest supplies the context; no live DB credentials are required.
    """
    try:
        manifest_bytes = _read(directory / "manifest.json")
        manifest = parse_json(manifest_bytes)
        if not isinstance(manifest, dict):
            raise TypeError("Invalid export manifest")
        if manifest.get("manifestVersion") == 1:
            names = ("questionBank.json", "flashcardBank.json")
            expected = manifest["artifactsSha256"]
            revisions = manifest["revisions"]
            context = {
                "target": "release",
                "unpublished": False,
                "releaseId": str(UUID(manifest["releaseId"])),
                "publication": manifest["publication"],
            }
            if manifest["schemaVersions"] != {"quiz": QUIZ_SCHEMA, "flashcard": FLASHCARD_SCHEMA}:
                raise ValueError("Unsupported export schema")
        elif manifest.get("contractVersion") in (1, 2):
            version = manifest["contractVersion"]
            names = ("questionBank.generated.json", "flashcardBank.generated.json")
            expected = {
                "quiz": manifest["digests"]["quizSha256"],
                "flashcard": manifest["digests"]["flashcardSha256"],
            }
            revisions = {
                "quiz": manifest["digests"]["quizRevision"],
                "flashcard": manifest["digests"]["flashcardRevision"],
            }
            target = manifest["target"]
            if target not in ("draft", "release") or manifest["unpublished"] is not (
                target == "draft"
            ):
                raise ValueError("Invalid export target")
            if manifest["schemas"] != {"quizzes": QUIZ_SCHEMA, "flashcards": FLASHCARD_SCHEMA}:
                raise ValueError("Unsupported export schema")
            # v1 drafts carried a document revision; v2 drafts carry the latest change ID.
            draft_keys = (
                ("draftRevision", "basePublicationSequence")
                if version == 1
                else ("latestChangeId",)
            )
            if target == "release":
                UUID(manifest["releaseId"])
            elif manifest["releaseId"] is not None or not (
                isinstance(manifest[draft_keys[0]], str) and manifest[draft_keys[0]].isdecimal()
                if version == 1
                else type(manifest[draft_keys[0]]) is int and manifest[draft_keys[0]] >= 0
            ):
                raise ValueError("Invalid draft context")
            context = {
                key: manifest[key]
                for key in (
                    "target",
                    "unpublished",
                    "releaseId",
                    "baseReleaseId",
                    "publication",
                    *draft_keys,
                )
            }
        else:
            raise ValueError("Unsupported export manifest")
        # Capture once; validate these same bytes rather than reopening mutable inputs.
        raw = [_read(directory / name) for name in names]
        hashes = {
            key: hashlib.sha256(value).hexdigest()
            for key, value in zip(("quiz", "flashcard"), raw, strict=True)
        }
        if hashes != expected:
            raise ValueError("Export byte digests differ")
        with tempfile.TemporaryDirectory(prefix="meducation-export-check-") as folder:
            paths = [Path(folder) / name for name in names]
            for path, value in zip(paths, raw, strict=True):
                path.touch(mode=0o600)
                path.write_bytes(value)
            pair = capture_pair(*paths, repository=repository)
        bank, flashcards = json.loads(pair.quiz_artifact), json.loads(pair.flashcard_artifact)
        computed = content_revisions(pair.quiz_artifact, pair.flashcard_artifact)
        actual_revisions = {
            "quiz": computed["quizRevision"],
            "flashcard": computed["flashcardRevision"],
        }
        if actual_revisions != revisions:
            raise ValueError("Export content revisions differ")
        if manifest.get("contractVersion") in (1, 2):
            ids = {
                key: [row["id"] for row in rows]
                for document in (bank, flashcards)
                for key, rows in document.items()
                if key != "schemaVersion"
            }
            if ids != manifest["ids"]:
                raise ValueError("Export identity inventory differs")
        report: dict[str, Any] = {
            "result": "pass",
            "source": "selected-export",
            "context": context,
            "artifactsSha256": hashes,
            "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
            "warnings": pair.warnings,
            "revisions": actual_revisions,
            "currentDatabaseCompared": False,
        }
        if audit:
            questions = bank["questions"]
            report["explanations"] = {
                "questions": len(questions),
                "withRationale": sum(bool(q["rationale"]) for q in questions),
                "withSources": sum(
                    bool(q.get("rationaleMeta", {}).get("sources")) for q in questions
                ),
                "rows": [
                    {
                        "id": q["id"],
                        "quizId": q["quizId"],
                        "rationaleLength": len(q["rationale"]),
                        "hasSources": bool(q.get("rationaleMeta", {}).get("sources")),
                    }
                    for q in questions
                ],
            }
        return report
    except KeyError, TypeError, ValueError, OSError, ContentPolicyError:
        raise ContentDatabaseError(
            "Selected export validation failed; no content or paths logged."
        ) from None

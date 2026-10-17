"""Offline checks of an explicitly selected paired export; never load bundled banks."""

import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any
from uuid import UUID

from meducation_api.content_policy import ContentPolicyError, parse_json
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.transfer import _read, capture_pair


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
            if manifest["schemaVersions"] != {"quiz": 4, "flashcard": 2}:
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
            if manifest["schemas"] != {"quizzes": 4, "flashcards": 2}:
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
        subjects = json.dumps(
            [
                {key: subject[key] for key in ("id", "name", "accent")}
                for subject in bank["subjects"]
            ],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        actual_revisions = {
            "quiz": "sha256-" + hashlib.sha256(pair.quiz_artifact.encode()).hexdigest(),
            "flashcard": "sha256-"
            + hashlib.sha256(
                ("flashcards-v2\n" + subjects + "\n" + pair.flashcard_artifact).encode()
            ).hexdigest(),
        }
        if actual_revisions != revisions:
            raise ValueError("Export content revisions differ")
        if manifest.get("contractVersion") in (1, 2):
            ids = {
                key: [row["id"] for row in document[key]]
                for document, keys in (
                    (bank, ("subjects", "quizzes", "questions")),
                    (flashcards, ("decks", "cards")),
                )
                for key in keys
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
                "aiReviewed": sum(
                    q.get("rationaleMeta", {}).get("provenance") == "ai_draft_reviewed"
                    for q in questions
                ),
                "answersUnderReview": sum(
                    bool(q.get("rationaleMeta", {}).get("answerReviewNote")) for q in questions
                ),
                "rows": [
                    {
                        "id": q["id"],
                        "quizId": q["quizId"],
                        "rationaleLength": len(q["rationale"]),
                        "provenance": q.get("rationaleMeta", {}).get("provenance"),
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

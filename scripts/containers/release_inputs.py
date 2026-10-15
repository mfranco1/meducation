"""Pin an explicitly selected operator release export without consulting archive banks."""

import hashlib
import json

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.export_tools import inspect_export
from meducation_api.db.transfer import _read, capture_pair

EXPORT_FILES = ("manifest.json", "questionBank.json", "flashcardBank.json")


def export_hashes(directory):
    return {name: hashlib.sha256(_read(directory / name)).hexdigest() for name in EXPORT_FILES}


def capture_export(directory, snapshot, *, repository):
    """Snapshot once, validate the same bytes, and retain only sanitized provenance.

    This mode accepts the documented export-release directory, never an unpublished
    draft or arbitrary pair. Manifest consistency does not establish authenticity
    or current publication; the operator must separately record those observations.
    """
    try:
        snapshot.mkdir(mode=0o700)
        for name in EXPORT_FILES:
            path = snapshot / name
            path.touch(mode=0o600)
            path.write_bytes(_read(directory / name))
        report = inspect_export(snapshot, repository=repository)
        manifest = json.loads((snapshot / "manifest.json").read_bytes())
        if manifest.get("manifestVersion") != 1:
            raise ContentDatabaseError("Select a published operator export-release directory.")
        publication = manifest["publication"]
        sequences = publication["selectedReleaseSequences"]
        if not sequences or any(type(s) is not int or s <= 0 for s in sequences):
            raise ContentDatabaseError("Selected release has no valid publication history.")
        pair = capture_pair(
            snapshot / "questionBank.json", snapshot / "flashcardBank.json", repository=repository
        )
        return pair, {
            "context": report["context"],
            "manifestSha256": report["manifestSha256"],
            "artifactsSha256": report["artifactsSha256"],
            "revisions": report["revisions"],
            "warnings": report["warnings"],
            "filesSha256": export_hashes(snapshot),
        }
    except OSError, KeyError, TypeError, ValueError:
        raise ContentDatabaseError("Selected release export capture failed; no content logged.") from None


def require_unchanged_export(directory, provenance):
    if export_hashes(directory) != provenance["filesSha256"]:
        raise ContentDatabaseError("Selected export changed during verification.")

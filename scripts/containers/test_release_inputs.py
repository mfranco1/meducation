"""Selected-export admission must fail before any Docker/database work."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend/src"))

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.operations import paired_artifacts
from release_inputs import capture_export, require_unchanged_export


@pytest.fixture
def selected(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    q = json.loads((ROOT / "tests/fixtures/bank-contract-cases.json").read_text())["base"]
    f = {"schemaVersion": 2, "decks": [], "cards": []}
    qt, ft = paired_artifacts(json.dumps(q), json.dumps(f))
    subjects = json.dumps(q["subjects"], ensure_ascii=False, separators=(",", ":"))
    manifest = {
        "manifestVersion": 1,
        "releaseId": "11111111-1111-4111-8111-111111111111",
        "schemaVersions": {"quiz": 4, "flashcard": 2},
        "artifactsSha256": {
            "quiz": hashlib.sha256(qt.encode()).hexdigest(),
            "flashcard": hashlib.sha256(ft.encode()).hexdigest(),
        },
        "revisions": {
            "quiz": "sha256-" + hashlib.sha256(qt.encode()).hexdigest(),
            "flashcard": "sha256-"
            + hashlib.sha256(("flashcards-v2\n" + subjects + "\n" + ft).encode()).hexdigest(),
        },
        "publication": {"selectedReleaseSequences": [3], "observedActiveSequence": 3},
    }
    (source / "questionBank.json").write_text(qt)
    (source / "flashcardBank.json").write_text(ft)
    (source / "manifest.json").write_text(json.dumps(manifest))
    return source, manifest


def test_selected_export_preserves_exact_bytes_and_detects_later_mutation(selected, tmp_path):
    source, _ = selected
    pair, provenance = capture_export(source, tmp_path / "snapshot", repository=ROOT)
    assert pair.quiz_artifact == (source / "questionBank.json").read_text()
    assert provenance["context"]["unpublished"] is False
    require_unchanged_export(source, provenance)
    (source / "questionBank.json").write_text("changed private content")
    with pytest.raises(ContentDatabaseError, match="changed during verification"):
        require_unchanged_export(source, provenance)
    assert pair.quiz_artifact == (tmp_path / "snapshot/questionBank.json").read_text()


@pytest.mark.parametrize(
    "fault", ["missing", "bytes", "schema", "revision", "draft", "unpublished", "duplicate"]
)
def test_selected_export_rejects_bad_pair_or_provenance(selected, tmp_path, fault):
    source, manifest = selected
    if fault == "missing":
        (source / "flashcardBank.json").unlink()
    elif fault == "bytes":
        (source / "flashcardBank.json").write_text("private corruption")
    elif fault == "schema":
        manifest["schemaVersions"]["quiz"] = 3
    elif fault == "revision":
        manifest["revisions"]["quiz"] = "sha256-" + "0" * 64
    elif fault == "draft":
        manifest.pop("manifestVersion")
        manifest.update(contractVersion=1, target="draft", unpublished=True)
    elif fault == "unpublished":
        manifest["publication"]["selectedReleaseSequences"] = []
    (source / "manifest.json").write_text(
        '{"manifestVersion":1,"manifestVersion":1}' if fault == "duplicate" else json.dumps(manifest)
    )
    with pytest.raises(ContentDatabaseError) as error:
        capture_export(source, tmp_path / "snapshot", repository=ROOT)
    assert "private corruption" not in str(error.value)


@pytest.mark.parametrize(
    "options",
    [
        [],
        ["--small-fixture", "--export-directory", "missing"],
        ["--export-directory", "missing", "--api-image", "current", "--previous-api-image", "prior"],
        ["--export-directory", "missing"],
    ],
)
def test_invalid_selected_mode_never_calls_docker(tmp_path, options):
    result = subprocess.run(
        [sys.executable, "scripts/containers/verify-postgres-release.py",
         "--output", str(tmp_path / "report.json"), *options],
        cwd=ROOT, capture_output=True, text=True,
        # Docker is deliberately absent; parser/capture failures must come first.
        env={"PATH": str(Path(sys.executable).parent)},
        check=False,
    )
    assert result.returncode != 0
    assert any(message in result.stderr for message in (
        "one of the arguments", "not allowed with argument", "parity only", "Content verification failed; no SQL",
    ))
    assert "Docker command failed" not in result.stderr
    assert "No such file or directory: 'docker'" not in result.stderr
    assert not (tmp_path / "report.json").exists()


@pytest.mark.parametrize("location", ["inside-export", "existing-report"])
def test_selected_report_cannot_replace_export_or_evidence(selected, tmp_path, location):
    source, _ = selected
    output = source / "manifest.json" if location == "inside-export" else tmp_path / "report.json"
    if location == "existing-report":
        output.write_text("retained evidence")
    before = output.read_bytes()
    result = subprocess.run(
        [sys.executable, "scripts/containers/verify-postgres-release.py", "--export-directory",
         str(source), "--output", str(output)], cwd=ROOT, capture_output=True, text=True, check=False,
    )
    assert result.returncode == 2
    assert "new path outside the immutable export" in result.stderr
    assert output.read_bytes() == before

"""Selected export checks stay offline and reject mismatched or ambiguous evidence."""

import hashlib
import json

import pytest
from support import ROOT, base_pair

from meducation_api.content.draft import revisions as content_revisions
from meducation_api.content.releases import paired_artifacts
from meducation_api.content.transfer import inspect_export
from meducation_api.db.engine import ContentDatabaseError


def export_fixture(folder, *, target="release", operator=False):
    q, f = base_pair()
    raw = [json.dumps(value, ensure_ascii=False).encode() for value in (q, f)]
    hashes = [hashlib.sha256(value).hexdigest() for value in raw]
    qt, ft = paired_artifacts(*(value.decode() for value in raw))
    digest = content_revisions(qt, ft)
    revisions = {"quiz": digest["quizRevision"], "flashcard": digest["flashcardRevision"]}
    release = "11111111-1111-4111-8111-111111111111"
    if operator:
        names = ("questionBank.json", "flashcardBank.json")
        manifest = {
            "manifestVersion": 1,
            "revisions": revisions,
            "releaseId": release,
            "schemaVersions": {"quiz": 6, "flashcard": 4},
            "artifactsSha256": dict(zip(("quiz", "flashcard"), hashes, strict=True)),
            "publication": {"observedActiveSequence": 2},
        }
    else:
        names = ("questionBank.generated.json", "flashcardBank.generated.json")
        manifest = {
            "contractVersion": 1,
            "target": target,
            "unpublished": target == "draft",
            "releaseId": release if target == "release" else None,
            "draftRevision": "4" if target == "draft" else None,
            "baseReleaseId": release if target == "draft" else None,
            "basePublicationSequence": "2" if target == "draft" else None,
            "publication": {"releaseId": release, "sequence": "2"},
            "schemas": {"quizzes": 6, "flashcards": 4},
            "digests": {
                "quizSha256": hashes[0],
                "flashcardSha256": hashes[1],
                "quizRevision": revisions["quiz"],
                "flashcardRevision": revisions["flashcard"],
            },
            "ids": {
                key: [row["id"] for row in doc[key]]
                for doc, keys in (
                    (q, ("subjects", "topics", "quizzes", "questions")),
                    (f, ("decks", "cards")),
                )
                for key in keys
            },
        }
    for name, value in zip(names, raw, strict=True):
        (folder / name).write_bytes(value)
    (folder / "manifest.json").write_text(json.dumps(manifest))
    return manifest, names


@pytest.mark.parametrize("kind", ["operator", "release", "draft"])
def test_selected_exports_validate_and_audit_without_database_or_bundled_content(tmp_path, kind):
    _, names = export_fixture(
        tmp_path, target=kind if kind != "operator" else "release", operator=kind == "operator"
    )
    before = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    report = inspect_export(tmp_path, repository=ROOT, audit=True)
    assert report["source"] == "selected-export"
    assert report["currentDatabaseCompared"] is False
    assert report["context"]["unpublished"] is (kind == "draft")
    assert report["explanations"]["questions"] == 1
    assert report["artifactsSha256"]["quiz"] == hashlib.sha256(before[names[0]]).hexdigest()
    assert not (ROOT / "src/content/questionBank.generated.json").exists()
    assert {p.name: p.read_bytes() for p in tmp_path.iterdir()} == before


@pytest.mark.parametrize(
    "fault",
    [
        "missing",
        "changed",
        "version",
        "unpublished",
        "draft-revision",
        "duplicate",
        "schema",
        "revisions",
        "ids",
    ],
)
def test_export_rejects_incomplete_tampered_or_ambiguous_evidence(tmp_path, fault):
    manifest, names = export_fixture(tmp_path, target="draft")
    if fault == "missing":
        (tmp_path / names[1]).unlink()
    elif fault == "changed":
        (tmp_path / names[0]).write_text("private content")
    elif fault == "version":
        manifest["contractVersion"] = 99
    elif fault == "unpublished":
        manifest["unpublished"] = False
    elif fault == "draft-revision":
        manifest["draftRevision"] = None
    elif fault == "schema":
        manifest["schemas"]["quizzes"] = 3
    elif fault == "revisions":
        manifest["digests"]["quizRevision"] = "sha256-" + "0" * 64
    elif fault == "ids":
        manifest["ids"]["questions"] = []
    if fault == "duplicate":
        (tmp_path / "manifest.json").write_text('{"contractVersion":1,"contractVersion":1}')
    else:
        (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ContentDatabaseError) as error:
        inspect_export(tmp_path, repository=ROOT)
    assert "private content" not in str(error.value)


def test_export_cli_does_not_need_settings_and_never_overwrites_report(
    tmp_path, monkeypatch, capsys
):
    from meducation_api.db.cli import main

    export_fixture(tmp_path)
    report = tmp_path / "report.json"
    monkeypatch.setenv("MEDUCATION_DATABASE_ENVIRONMENT", "invalid")
    monkeypatch.setattr(
        "sys.argv",
        [
            "meducation-db",
            "audit-export",
            "--directory",
            str(tmp_path),
            "--repository",
            str(ROOT),
            "--report",
            str(report),
        ],
    )
    main()
    assert report.stat().st_mode & 0o777 == 0o600
    original = report.read_bytes()
    with pytest.raises(SystemExit):
        main()
    assert report.read_bytes() == original
    assert "Live database currency was not checked" in capsys.readouterr().out

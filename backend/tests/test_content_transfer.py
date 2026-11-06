"""Captured-input boundaries use existing fixture content."""

import json

import pytest
from support import ROOT, base_pair

from meducation_api.content.transfer import capture_pair
from meducation_api.db.engine import ContentDatabaseError


def files(tmp_path):
    q, f = base_pair()
    paths = tmp_path / "quiz.json", tmp_path / "flashcards.json"
    for path, doc in zip(paths, (q, f), strict=True):
        path.write_text(json.dumps(doc, ensure_ascii=False))
    return paths


@pytest.mark.skipif(
    not (ROOT / "node_modules/tsx/dist/loader.mjs").is_file(),
    reason="Cross-runtime capture requires npm ci; native PG jobs exercise the gate",
)
def test_capture_preserves_files_and_holds_captured_content(tmp_path):
    paths = files(tmp_path)
    before = [p.read_bytes() for p in paths]
    captured = capture_pair(*paths, repository=ROOT)
    assert [p.read_bytes() for p in paths] == before
    paths[0].write_text("changed after capture")
    assert json.loads(captured.quiz_artifact)["questions"][0]["answer"] == "B"


@pytest.mark.parametrize(
    "case", ["invalid-second", "rich-policy", "missing-repository", "duplicate", "surrogate"]
)
def test_capture_rejects_both_structure_and_rich_policy_without_rewriting(tmp_path, case):
    paths = files(tmp_path)
    repository = ROOT
    if case == "invalid-second":
        paths[1].write_text('{"schemaVersion":4,"decks":[],"cards":null}')
    elif case == "rich-policy":
        if not (ROOT / "node_modules/tsx/dist/loader.mjs").is_file():
            pytest.skip("Cross-runtime policy requires npm ci; native PG jobs exercise the gate")
        q = json.loads(paths[0].read_text())
        q["questions"][0]["stem"] = '<script>alert("private")</script>'
        paths[0].write_text(json.dumps(q))
    elif case == "surrogate":
        q = json.loads(paths[0].read_text())
        q["questions"][0]["stem"] = "bad\ud800"
        paths[0].write_text(json.dumps(q))
    elif case == "missing-repository":
        repository = tmp_path
    else:
        paths[0].write_text(
            paths[0]
            .read_text()
            .replace('"schemaVersion": 6', '"schemaVersion":6,"schemaVersion":6')
        )
    before = [p.read_bytes() for p in paths]
    with pytest.raises(ContentDatabaseError) as error:
        capture_pair(*paths, repository=repository)
    assert "private" not in str(error.value)
    assert [p.read_bytes() for p in paths] == before

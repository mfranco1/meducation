"""Captured-input and reconstruction boundaries use existing fixture content."""

import copy
import hashlib
import json
from pathlib import Path

import pytest

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.transfer import _ordered, capture_pair

ROOT = Path(__file__).resolve().parents[2]


def files(tmp_path):
    q = json.loads((ROOT / "tests/fixtures/bank-contract-cases.json").read_text())["base"]
    f = {"schemaVersion": 2, "decks": [], "cards": []}
    paths = tmp_path / "quiz.json", tmp_path / "flashcards.json"
    for path, doc in zip(paths, (q, f), strict=True):
        path.write_text(json.dumps(doc, ensure_ascii=False))
    return paths


@pytest.mark.skipif(
    not (ROOT / "node_modules/tsx/dist/loader.mjs").is_file(),
    reason="Cross-runtime capture requires npm ci; native PG jobs exercise the gate",
)
def test_capture_hashes_original_bytes_and_preserves_files(tmp_path):
    paths = files(tmp_path)
    before = [p.read_bytes() for p in paths]
    captured = capture_pair(*paths, repository=ROOT)
    assert captured.source_hashes == {
        "quiz": hashlib.sha256(before[0]).hexdigest(),
        "flashcard": hashlib.sha256(before[1]).hexdigest(),
    }
    assert [p.read_bytes() for p in paths] == before
    paths[0].write_text("changed after capture")
    assert json.loads(captured.quiz_artifact)["questions"][0]["verifiedAnswer"] == "B"


@pytest.mark.parametrize(
    "case", ["invalid-second", "rich-policy", "missing-repository", "duplicate", "surrogate"]
)
def test_capture_rejects_both_structure_and_rich_policy_without_rewriting(tmp_path, case):
    paths = files(tmp_path)
    repository = ROOT
    if case == "invalid-second":
        paths[1].write_text('{"schemaVersion":2,"decks":[],"cards":null}')
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
            .replace('"schemaVersion": 4', '"schemaVersion":4,"schemaVersion":4')
        )
    before = [p.read_bytes() for p in paths]
    with pytest.raises(ContentDatabaseError) as error:
        capture_pair(*paths, repository=repository)
    assert "private" not in str(error.value)
    assert [p.read_bytes() for p in paths] == before


@pytest.mark.parametrize("change", ["type", "leaf", "extra", "missing", "order"])
def test_reconstruction_never_substitutes_template_content(change):
    template = {
        "second": [{"id": "i1", "text": "original"}, {"id": "i2", "text": "next"}],
        "first": 4,
    }
    actual = copy.deepcopy(template)
    if change == "type":
        actual["first"] = 4.0
    elif change == "leaf":
        actual["second"][0]["text"] = "different"
    elif change == "extra":
        actual["extra"] = "bad"
    elif change == "missing":
        actual.pop("first")
    else:
        actual["second"].reverse()
    with pytest.raises(ContentDatabaseError):
        _ordered(actual, template)
    assert list(_ordered({"first": 4, "second": template["second"]}, template)) == [
        "second",
        "first",
    ]

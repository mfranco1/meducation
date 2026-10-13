"""Stored-pair parsing preserves raw shape and rejects ambiguous input before SQL."""

import json
from pathlib import Path

import pytest

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.operations import paired_artifacts

ROOT = Path(__file__).resolve().parents[2]


def pair():
    q = json.loads((ROOT / "tests/fixtures/bank-contract-cases.json").read_text())["base"]
    f = {"schemaVersion": 2, "decks": [], "cards": []}
    return q, f


def test_artifacts_preserve_raw_field_order_omission_and_source_answers():
    q, f = pair()
    q["questions"][0]["verifiedAnswer"] = "B"
    q["questions"][0]["answerNote"] = ""
    output = paired_artifacts(json.dumps(q, ensure_ascii=False), json.dumps(f))
    assert output == tuple(json.dumps(v, ensure_ascii=False, indent=2) + "\n" for v in (q, f))
    stored = json.loads(output[0])["questions"][0]
    assert stored["answer"] == "A" and stored["verifiedAnswer"] == "B"
    assert stored["answerNote"] == "" and "metadata" not in stored


@pytest.mark.parametrize(
    "mutate", ["duplicate", "null", "nonfinite", "missing-subject", "unknown-field"]
)
def test_bad_pairs_fail_before_sql_without_exposing_content(mutate):
    q, f = pair()
    q["questions"][0]["stem"] = "Private fixture text"
    if mutate == "null":
        q["questions"][0]["metadata"] = None
    elif mutate == "nonfinite":
        q["schemaVersion"] = float("nan")
    elif mutate == "missing-subject":
        f["decks"] = [{"id": "d1", "subjectId": "s99", "name": "Unknown"}]
    elif mutate == "unknown-field":
        q["questions"][0]["legacyHint"] = "invalid"
    text = json.dumps(q, ensure_ascii=False)
    if mutate == "duplicate":
        text = text.replace('"schemaVersion": 4', '"schemaVersion": 4, "schemaVersion": 4', 1)
    with pytest.raises(ContentDatabaseError) as error:
        paired_artifacts(text, json.dumps(f))
    assert "Private fixture text" not in str(error.value)

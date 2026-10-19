import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from meducation_api.repositories.question_bank import Bank

FIXTURES = json.loads(
    (Path(__file__).resolve().parents[2] / "tests/fixtures/bank-contract-cases.json").read_text(
        encoding="utf-8"
    )
)


def bank_for(change: str) -> dict:
    bank = copy.deepcopy(FIXTURES["base"])
    question = bank["questions"][0]
    if change == "valid_metadata":
        question["metadata"] = {"topic": "Anatomy", "tags": ["reviewed"]}
        question["rationaleMeta"] = {"sources": "Reference"}
    elif change == "duplicate_question":
        bank["questions"].append(copy.deepcopy(question))
    elif change == "unknown_quiz":
        question["quizId"] = "q9"
    elif change == "unknown_topic":
        bank["quizzes"][0]["topicId"] = "t9"
    elif change == "unknown_topic_subject":
        bank["topics"][0]["subjectId"] = "s9"
    elif change == "schema_version":
        bank["schemaVersion"] = 5
    elif change == "provided_answer":
        question["answer"] = "Z"
    elif change == "choice_label":
        question["choices"][0]["id"] = "a"
    elif change == "metadata_unknown_field":
        question["metadata"] = {"discipline": "Anatomy"}
    elif change == "metadata_tags":
        question["metadata"] = {"tags": [2]}
    elif change == "noncontiguous":
        bank["quizzes"].append({"id": "q2", "topicId": "t1", "name": "Second quiz"})
        bank["questions"].append({**copy.deepcopy(question), "id": "i2", "quizId": "q2"})
        bank["questions"].append({**copy.deepcopy(question), "id": "i3"})
    elif change == "null_metadata":
        question["metadata"] = None
    elif change == "blank_subject":
        bank["subjects"][0]["name"] = "  "
    elif change == "blank_quiz":
        bank["quizzes"][0]["name"] = "  "
    elif change == "pearls":
        question["pearls"] = [2]
    elif change == "extra_question_field":
        question["legacyHint"] = "obsolete"
    return bank


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda case: case["id"])
def test_shared_stored_bank_contract(case: dict) -> None:
    bank = bank_for(case["change"])
    if case["valid"]:
        assert Bank.model_validate(bank).schemaVersion == 6
    else:
        with pytest.raises(ValidationError):
            Bank.model_validate(bank)


def test_shared_unicode_revision() -> None:
    import hashlib

    from meducation_api.db.operations import paired_artifacts

    text, _ = paired_artifacts(
        json.dumps(bank_for("none"), ensure_ascii=False),
        '{"schemaVersion":4,"decks":[],"cards":[]}',
    )
    assert "sha256-" + hashlib.sha256(text.encode()).hexdigest() == (
        "sha256-ae95deb91c85e524f9b6e81d380420d3bf7507e0e7a632e842a3d37a2a7f1a65"
    )

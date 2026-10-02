import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from meducation_api.repositories.question_bank import Bank, JsonQuestionBankRepository

FIXTURES = json.loads(
    (Path(__file__).resolve().parents[2] / "tests/fixtures/bank-contract-cases.json").read_text(
        encoding="utf-8"
    )
)


def bank_for(change: str) -> dict:
    bank = copy.deepcopy(FIXTURES["base"])
    question = bank["questions"][0]
    if change == "duplicate_question":
        bank["questions"].append(copy.deepcopy(question))
    elif change == "unknown_quiz":
        question["quizId"] = "q9"
    elif change == "schema_version":
        bank["schemaVersion"] = 3
    elif change == "provided_answer":
        question["answer"] = "Z"
    elif change == "choice_label":
        question["choices"][0]["id"] = "a"
    elif change == "review_provenance":
        question["rationaleMeta"] = {"provenance": "ai_draft_reviewed"}
    return bank


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda case: case["id"])
def test_shared_stored_bank_contract(case: dict) -> None:
    bank = bank_for(case["change"])
    if case["valid"]:
        assert Bank.model_validate(bank).schemaVersion == 4
    else:
        with pytest.raises(ValidationError):
            Bank.model_validate(bank)


def test_shared_unicode_revision(tmp_path: Path) -> None:
    path = tmp_path / "bank.json"
    path.write_text(json.dumps(bank_for("none"), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    assert JsonQuestionBankRepository(path).revision == (
        "sha256-3428200bbea813f67a79fb5a36bbaa0a83b0148cd4dfdfc5cef5cdb32045b8d8"
    )

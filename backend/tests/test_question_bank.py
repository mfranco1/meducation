import json

import pytest
from fastapi.testclient import TestClient

from meducation_api.main import create_app
from meducation_api.repositories.question_bank import Bank, JsonQuestionBankRepository
from meducation_api.settings import Settings


@pytest.fixture
def bank_data() -> dict:
    return {
        "schemaVersion": 4,
        "subjects": [{"id": "s1", "name": "Subject", "accent": "#123456"}],
        "quizzes": [{"id": "q1", "subjectId": "s1", "name": "Quiz"}],
        "questions": [
            {
                "id": "i1",
                "quizId": "q1",
                "stem": "A **stem**",
                "choices": [
                    {"id": "A", "text": "One"},
                    {"id": "B", "text": "Two"},
                ],
                "answer": "A",
                "verifiedAnswer": "B",
                "rationale": "Explanation",
            }
        ],
    }


def test_bank_rejects_invalid_version_and_answer(bank_data: dict) -> None:
    wrong_version = {**bank_data, "schemaVersion": 3}
    with pytest.raises(ValueError, match="Unsupported question bank schema"):
        Bank.model_validate(wrong_version)
    wrong_answer = {**bank_data, "questions": [{**bank_data["questions"][0], "answer": "Z"}]}
    with pytest.raises(ValueError, match="unknown provided answer"):
        Bank.model_validate(wrong_answer)


def test_json_repository_preserves_order_and_revision(tmp_path, bank_data: dict) -> None:
    bank_path = tmp_path / "bank.json"
    bank_path.write_text(
        json.dumps(bank_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    repository = JsonQuestionBankRepository(bank_path)
    assert repository.list_quizzes("s1")[0][1] == 1
    question = repository.list_questions("q1")[0]
    assert [choice.id for choice in question.choices] == ["A", "B"]
    assert question.answer == "A"
    assert question.verifiedAnswer == "B"
    assert (
        repository.revision
        == "sha256-32bdf23077ed576d363a787df5fd8d3f91f0b7503108406c45a156974534e65a"
    )


def test_content_api_and_revision_conflicts(tmp_path, bank_data: dict) -> None:
    bank_path = tmp_path / "bank.json"
    bank_path.write_text(json.dumps(bank_data, indent=2) + "\n", encoding="utf-8")
    app = create_app(Settings(bank_path=bank_path))
    with TestClient(app) as client:
        assert client.get("/health/live").json() == {"status": "live"}
        assert client.get("/health/ready").json() == {"status": "ready"}
        assert (
            "SubjectCatalogResponse" in client.get("/openapi.json").json()["components"]["schemas"]
        )
        subjects = client.get("/api/v1/subjects")
        assert subjects.status_code == 200
        assert subjects.headers["etag"].startswith('"sha256-')
        revision = subjects.json()["revision"]
        quizzes = client.get("/api/v1/subjects/s1/quizzes")
        assert quizzes.json()["quizzes"][0]["questionCount"] == 1
        assert quizzes.json()["quizzes"][0]["questionIds"] == ["i1"]
        questions = client.get(f"/api/v1/quizzes/q1/questions?revision={revision}")
        api_question = questions.json()["questions"][0]
        assert api_question["verifiedAnswer"] == "B"
        assert "metadata" not in api_question
        assert client.get("/api/v1/quizzes/q-missing/questions").status_code == 404
        assert client.get("/api/v1/subjects?revision=stale").status_code == 409
        assert (
            client.get(
                "/api/v1/subjects", headers={"If-None-Match": subjects.headers["etag"]}
            ).status_code
            == 304
        )


def test_canonical_bank_loads() -> None:
    bank = JsonQuestionBankRepository(Settings().bank_path)
    assert bank.bank.schemaVersion == 4
    assert bank.bank.subjects
    assert bank.bank.quizzes
    assert bank.bank.questions

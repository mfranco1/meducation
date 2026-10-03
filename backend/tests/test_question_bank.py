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
    revision = repository.revision
    assert repository.subject_quiz_summary("s1") == (1, ["q1"])
    repository.raw["unused-test-mutation"] = True
    assert repository.revision == revision
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
        assert subjects.json()["subjects"][0]["quizCount"] == 1
        assert subjects.json()["subjects"][0]["quizIds"] == ["q1"]
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


def test_injected_repository_skips_payload_build_for_conditional_response(
    tmp_path, bank_data: dict
) -> None:
    bank_path = tmp_path / "bank.json"
    bank_path.write_text(json.dumps(bank_data, indent=2) + "\n", encoding="utf-8")

    class CountingRepository(JsonQuestionBankRepository):
        subject_reads = 0

        def list_subjects(self):
            self.subject_reads += 1
            return super().list_subjects()

    repository = CountingRepository(bank_path)
    app = create_app(Settings(bank_path=bank_path), repository_factory=lambda _: repository)
    with TestClient(app) as client:
        first = client.get("/api/v1/subjects")
        assert first.status_code == 200
        assert repository.subject_reads == 1
        cached = client.get("/api/v1/subjects", headers={"If-None-Match": first.headers["etag"]})
        assert cached.status_code == 304
        assert repository.subject_reads == 1
        conflict = client.get(
            "/api/v1/subjects?revision=stale", headers={"If-None-Match": first.headers["etag"]}
        )
        assert conflict.status_code == 409
        assert repository.subject_reads == 1


def test_sparse_nested_metadata_is_preserved_in_api_response(tmp_path, bank_data: dict) -> None:
    bank_path = tmp_path / "bank.json"
    bank_data["questions"][0]["rationaleMeta"] = {"sources": "Reference"}
    bank_data["questions"][0]["metadata"] = {"topic": "Anatomy"}
    bank_path.write_text(json.dumps(bank_data, indent=2) + "\n", encoding="utf-8")
    app = create_app(Settings(bank_path=bank_path))
    with TestClient(app) as client:
        question = client.get("/api/v1/quizzes/q1/questions").json()["questions"][0]
        assert question["rationaleMeta"] == {"sources": "Reference"}
        assert question["metadata"] == {"topic": "Anatomy"}
        assert "answerNote" not in question


@pytest.mark.parametrize(
    ("path", "code"),
    [
        ("/api/v1/subjects/s-missing/quizzes", "subject_not_found"),
        ("/api/v1/quizzes/q-missing", "quiz_not_found"),
        ("/api/v1/quizzes/q-missing/questions", "quiz_not_found"),
    ],
)
def test_missing_catalog_resources_return_specific_404(
    tmp_path, bank_data: dict, path: str, code: str
) -> None:
    bank_path = tmp_path / "bank.json"
    bank_path.write_text(json.dumps(bank_data) + "\n", encoding="utf-8")
    with TestClient(create_app(Settings(bank_path=bank_path))) as client:
        response = client.get(path)
        assert response.status_code == 404
        assert response.json() == {"detail": {"code": code}}


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/subjects",
        "/api/v1/subjects/s1/quizzes",
        "/api/v1/quizzes/q1",
        "/api/v1/quizzes/q1/questions",
    ],
)
def test_all_content_routes_reject_stale_revision_and_if_match(
    tmp_path, bank_data: dict, path: str
) -> None:
    bank_path = tmp_path / "bank.json"
    bank_path.write_text(json.dumps(bank_data) + "\n", encoding="utf-8")
    with TestClient(create_app(Settings(bank_path=bank_path))) as client:
        for response in (
            client.get(f"{path}?revision=stale"),
            client.get(path, headers={"If-Match": '"stale"'}),
        ):
            assert response.status_code == 409
            assert response.json() == {"detail": {"code": "content_revision_changed"}}
        current = client.get(path)
        assert current.status_code == 200
        assert client.get(path, headers={"If-None-Match": current.headers["etag"]}).status_code == 304


def test_invalid_bank_fails_startup_and_unstarted_app_reports_unready(tmp_path, bank_data: dict) -> None:
    bank_path = tmp_path / "bank.json"
    bank_path.write_text(json.dumps({**bank_data, "questions": []}) + "\n", encoding="utf-8")
    app = create_app(Settings(bank_path=bank_path))
    with pytest.raises(RuntimeError, match="Canonical question bank could not be loaded"), TestClient(app):
        pass

    # Without a successful lifespan, the route must not claim the bank is ready.
    client = TestClient(create_app(Settings(bank_path=bank_path)))
    assert client.get("/health/ready").status_code == 503

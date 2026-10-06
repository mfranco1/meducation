import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from meducation_api.main import create_app
from meducation_api.repositories.question_bank import FlashcardBank, JsonFlashcardCatalogRepository
from meducation_api.settings import Settings


@pytest.fixture
def quiz_bank() -> dict:
    return {
        "schemaVersion": 4,
        "subjects": [
            {"id": "s1", "name": "Subject One", "accent": "#123456"},
            {"id": "s2", "name": "Subject Two", "accent": "#654321"},
        ],
        "quizzes": [],
        "questions": [],
    }


@pytest.fixture
def flashcard_bank() -> dict:
    fixture = Path(__file__).resolve().parents[2] / "tests/fixtures/flashcard-bank-contract.json"
    return json.loads(fixture.read_text(encoding="utf-8"))["bank"]


def write_json(path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def test_flashcard_bank_rejects_bad_schema_and_references(flashcard_bank: dict) -> None:
    invalid_version = {**flashcard_bank, "schemaVersion": 2}
    with pytest.raises(ValidationError, match="Unsupported flashcard bank schema"):
        FlashcardBank.model_validate(invalid_version)
    invalid_ref = copy.deepcopy(flashcard_bank)
    invalid_ref["cards"][0]["deckId"] = "d-missing"
    with pytest.raises(ValidationError, match="unknown deck"):
        FlashcardBank.model_validate(invalid_ref)
    null_optional = copy.deepcopy(flashcard_bank)
    null_optional["decks"][0]["description"] = None
    with pytest.raises(ValidationError, match="must be omitted"):
        FlashcardBank.model_validate(null_optional)


def test_flashcard_repository_preserves_order_and_checks_shared_subjects(tmp_path, quiz_bank: dict, flashcard_bank: dict) -> None:
    quiz_path = tmp_path / "quiz.json"
    flashcard_path = tmp_path / "flashcards.json"
    write_json(quiz_path, quiz_bank)
    write_json(flashcard_path, flashcard_bank)
    from meducation_api.repositories.question_bank import JsonQuestionBankRepository

    subjects = JsonQuestionBankRepository(quiz_path).list_subjects()
    repository = JsonFlashcardCatalogRepository(flashcard_path, subjects)
    assert repository.revision == "sha256-a601a3fb3815d69a237aabff72005a5b286b3de3e04e12d918c1611a8104bd10"
    assert [(topic.id, topic.name) for topic in repository.list_catalog("s1")[0]] == [
        ("t-neuro", "Neuroanatomy"), ("t-empty", "Empty topic")
    ]
    assert [(deck.id, count) for deck, count in repository.list_catalog("s1")[1]] == [
        ("d-cranial", 2), ("d-empty", 0)
    ]
    assert [card.id for card in repository.list_cards("d-cranial")] == ["f-1", "f-2"]
    assert [subject.deckCount for subject in repository.list_subjects()] == [2, 0]
    broken = copy.deepcopy(flashcard_bank)
    broken["topics"][0]["subjectId"] = "s-unknown"
    write_json(flashcard_path, broken)
    with pytest.raises(RuntimeError, match="subject missing"):
        JsonFlashcardCatalogRepository(flashcard_path, subjects)


def test_flashcard_revision_changes_when_shared_subject_metadata_changes(tmp_path, quiz_bank: dict, flashcard_bank: dict) -> None:
    quiz_path = tmp_path / "quiz.json"
    flashcard_path = tmp_path / "flashcards.json"
    write_json(quiz_path, quiz_bank)
    write_json(flashcard_path, flashcard_bank)
    from meducation_api.repositories.question_bank import JsonQuestionBankRepository

    subjects = JsonQuestionBankRepository(quiz_path).list_subjects()
    original = JsonFlashcardCatalogRepository(flashcard_path, subjects).revision
    changed = copy.deepcopy(subjects)
    changed[0] = changed[0].model_copy(update={"name": "Renamed subject"})
    assert JsonFlashcardCatalogRepository(flashcard_path, changed).revision != original


def test_flashcard_api_catalog_cards_revision_and_missing_routes(tmp_path, quiz_bank: dict, flashcard_bank: dict) -> None:
    quiz_path = tmp_path / "quiz.json"
    flashcard_path = tmp_path / "flashcards.json"
    write_json(quiz_path, quiz_bank)
    write_json(flashcard_path, flashcard_bank)
    app = create_app(Settings(bank_path=quiz_path, flashcard_bank_path=flashcard_path))
    with TestClient(app) as client:
        subjects = client.get("/api/v1/flashcards/subjects")
        assert subjects.status_code == 200
        assert subjects.json()["subjects"][0]["deckCount"] == 2
        assert subjects.json()["subjects"][0]["deckIds"] == ["d-cranial", "d-empty"]
        revision = subjects.json()["revision"]
        assert subjects.headers["etag"].startswith('"sha256-')

        catalog = client.get(f"/api/v1/flashcards/subjects/s1/catalog?revision={revision}")
        assert catalog.status_code == 200
        assert [topic["id"] for topic in catalog.json()["topics"]] == ["t-neuro", "t-empty"]
        assert [deck["cardCount"] for deck in catalog.json()["decks"]] == [2, 0]
        cards = client.get(f"/api/v1/flashcards/decks/d-cranial/cards?revision={revision}")
        assert [card["id"] for card in cards.json()["cards"]] == ["f-1", "f-2"]
        assert catalog.json()["decks"][0]["cardIds"] == ["f-1", "f-2"]

        assert client.get("/api/v1/flashcards/subjects/s-missing/catalog").status_code == 404
        assert client.get("/api/v1/flashcards/decks/d-missing/cards").status_code == 404
        assert client.get("/api/v1/flashcards/decks/d-cranial/cards?revision=stale").status_code == 409
        assert client.get("/api/v1/flashcards/subjects", headers={"If-None-Match": subjects.headers["etag"]}).status_code == 304

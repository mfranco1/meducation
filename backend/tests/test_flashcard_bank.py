import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from fixture_content import fixture_app
from pydantic import ValidationError

from meducation_api.repositories.question_bank import FlashcardBank


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


def test_flashcard_bank_rejects_bad_schema_and_references(flashcard_bank: dict) -> None:
    invalid_version = {**flashcard_bank, "schemaVersion": 1}
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


def test_flashcard_api_catalog_cards_revision_and_missing_routes(
    quiz_bank: dict, flashcard_bank: dict
) -> None:
    app = fixture_app(quiz_bank, flashcard_bank)
    with TestClient(app) as client:
        subjects = client.get("/api/v1/flashcards/subjects")
        assert subjects.status_code == 200
        assert subjects.json()["subjects"][0]["deckCount"] == 2
        assert subjects.json()["subjects"][0]["deckIds"] == ["d-cranial", "d-empty"]
        revision = subjects.json()["revision"]
        assert subjects.headers["etag"].startswith('"sha256-')

        catalog = client.get(f"/api/v1/flashcards/subjects/s1/catalog?revision={revision}")
        assert catalog.status_code == 200
        assert set(catalog.json()) == {"revision", "decks"}
        assert [deck["cardCount"] for deck in catalog.json()["decks"]] == [2, 0]
        assert [deck["subjectId"] for deck in catalog.json()["decks"]] == ["s1", "s1"]
        cards = client.get(f"/api/v1/flashcards/decks/d-cranial/cards?revision={revision}")
        assert [card["id"] for card in cards.json()["cards"]] == ["f-1", "f-2"]
        assert catalog.json()["decks"][0]["cardIds"] == ["f-1", "f-2"]

        assert client.get("/api/v1/flashcards/subjects/s-missing/catalog").status_code == 404
        assert client.get("/api/v1/flashcards/decks/d-missing/cards").status_code == 404
        assert (
            client.get("/api/v1/flashcards/decks/d-cranial/cards?revision=stale").status_code == 409
        )
        assert (
            client.get(
                "/api/v1/flashcards/subjects", headers={"If-None-Match": subjects.headers["etag"]}
            ).status_code
            == 304
        )

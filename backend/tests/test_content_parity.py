"""Parity refuses routine or mismatched databases before opening a connection."""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy import make_url

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.parity import verify_parity
from meducation_api.db.transfer import CapturedPair
from meducation_api.settings import Settings


@pytest.mark.parametrize(
    "database,reader,source",
    [
        ("meducation", "meducation", "postgres"),
        ("meducation_verify_copy", "other", "postgres"),
    ],
)
def test_parity_target_guard_does_not_connect(database, reader, source):
    engine = MagicMock()
    engine.url = make_url(
        f"postgresql+psycopg://meducation_operator:fixture-password@127.0.0.1:5433/{database}?sslmode=disable"
    )
    settings = Settings(
        _env_file=None,
        content_source=source,
        database_environment="local",
        database_url=f"postgresql+psycopg://meducation_reader:fixture-reader-password@127.0.0.1:5433/{reader}?sslmode=disable",
    )
    pair = CapturedPair("{}", "{}", "a" * 64, "b" * 64, 0)
    with pytest.raises(ContentDatabaseError):
        verify_parity(engine, settings, pair, uuid4())
    engine.connect.assert_not_called()


def test_parity_contract_oracle_preserves_interleaved_membership_and_authored_fields():
    import json
    from pathlib import Path

    from meducation_api.db.operations import paired_artifacts
    from meducation_api.db.parity import expected_responses

    root = Path(__file__).resolve().parents[2]
    quiz = (root / "tests/fixtures/question-bank.json").read_text()
    flashcards = json.loads((root / "tests/fixtures/flashcard-bank-contract.json").read_text())[
        "bank"
    ]
    qt, ft = paired_artifacts(quiz, json.dumps(flashcards))
    pair = CapturedPair(qt, ft, "a" * 64, "b" * 64, 0)
    routes = expected_responses(pair)

    assert len(routes) == 14  # Two shared subjects, three quizzes and two decks.
    assert [s["quizIds"] for s in routes["/api/v1/subjects"]["subjects"]] == [["q1", "q3"], ["q2"]]
    assert [q["questionIds"] for q in routes["/api/v1/subjects/s1/quizzes"]["quizzes"]] == [
        ["i1", "i3"],
        ["i4"],
    ]
    questions = routes["/api/v1/quizzes/q1/questions"]["questions"]
    assert questions == json.loads(qt)["questions"][:2]
    assert questions[0]["answer"] == "A" and questions[0]["verifiedAnswer"] == "B"
    assert [c["id"] for c in questions[0]["choices"]] == ["A", "B"]
    assert "metadata" not in questions[1]
    subjects = routes["/api/v1/flashcards/subjects"]["subjects"]
    assert [(s["deckIds"], s["emptyDeckIds"]) for s in subjects] == [
        (["d-cranial", "d-empty"], ["d-empty"]),
        ([], []),
    ]
    assert routes["/api/v1/flashcards/subjects/s2/catalog"]["decks"] == []
    assert routes["/api/v1/flashcards/decks/d-empty/cards"]["cards"] == []
    assert routes["/api/v1/flashcards/decks/d-cranial/cards"]["cards"] == flashcards["cards"]
    assert "description" not in routes["/api/v1/flashcards/subjects/s1/catalog"]["decks"][0]
    assert (
        routes["/api/v1/subjects"]["revision"] != routes["/api/v1/flashcards/subjects"]["revision"]
    )

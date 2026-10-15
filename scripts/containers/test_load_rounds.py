"""The acceptance harness must reject fast but incorrect learner responses."""

import copy
import json
from pathlib import Path

import load_rounds
import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    "fault", ["revision", "membership", "body", "unexpected-conflict", "timeout"]
)
def test_launch_harness_rejects_bad_or_failed_responses(monkeypatch, fault):
    q = json.loads((ROOT / "e2e/fixtures/bank.json").read_text())
    f = json.loads((ROOT / "e2e/fixtures/flashcard-bank.json").read_text())
    f["subjects"] = q["subjects"]

    def reply(origin, path, **options):
        if path.startswith("/fixture/reset/"):
            return 200, {}, None
        if fault == "timeout":
            raise TimeoutError("Synthetic deadline")
        if fault == "unexpected-conflict":
            return 409, {"detail": {"code": "content_revision_changed"}}, None
        flash = "/flashcards/" in path
        bank = f if flash else q
        if path.endswith("/subjects"):
            subject = {
                **bank["subjects"][0],
                ("deckIds" if flash else "quizIds"): [
                    bank["decks" if flash else "quizzes"][0]["id"]
                ],
            }
            payload = {"subjects": [subject]}
        elif path.endswith(("/catalog", "/quizzes")):
            key, body, count, ids = (
                ("decks", "cards", "cardCount", "cardIds")
                if flash
                else ("quizzes", "questions", "questionCount", "questionIds")
            )
            member = {
                **bank[key][0],
                count: len(bank[body]),
                ids: [row["id"] for row in bank[body]],
            }
            if fault == "membership":
                member[ids].reverse()
            payload = {key: [member]}
        else:
            key = "cards" if flash else "questions"
            payload = {key: copy.deepcopy(bank[key])}
            if fault == "body":
                payload[key][0]["front" if flash else "stem"] = "Wrong published body"
        payload["revision"] = (
            "wrong"
            if fault == "revision" and not path.endswith("/subjects")
            else "fixed"
        )
        return 200, payload, '"' + payload["revision"] + '"'

    monkeypatch.setattr(load_rounds, "request", reply)
    with pytest.raises((AssertionError, TimeoutError)):
        load_rounds.run_round("unused", "reject-" + fault, {"quiz": q, "flashcard": f})

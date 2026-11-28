"""Real PG17: agent staging writes the draft through DraftService and never publishes."""

import pytest
from support import scalar, seed

from meducation_api.admin.service import MISSING, DraftError, DraftService
from meducation_api.admin.staging import (
    deck_outline,
    outline,
    split_quiz,
    stage_flashcards,
    stage_quizzes,
)
from meducation_api.content.draft import KINDS
from meducation_api.content_policy import ContentPolicyError

pytestmark = pytest.mark.postgres


def item(stem, **extra):
    return {
        "stem": stem,
        "choices": ["One", "Two"],
        "answer": "B",
        "rationale": "Because.",
        "pearls": [""],
        **extra,
    }


def stage(service, subject, batch):
    report = {}
    stage_quizzes(service, subject, batch, report)
    return report


@pytest.fixture
def staged(db):
    seed(db)
    service = DraftService(db.editor, "agent:test", lambda fresh: None)
    name = service.snapshot()["subjects"][0]["name"]
    return service, name


def test_staging_creates_topic_quiz_and_questions_in_order_as_the_actor(db, staged):
    service, subject = staged
    before = service.snapshot()
    batch = {
        "topics": [
            {
                "name": "New topic",
                "description": "About it",
                "quizzes": [
                    {"name": "Quiz A", "items": [item("First"), item("Second")]},
                    {
                        "name": " quiz a ",
                        "items": [item("Third", metadata={"subtopic": "Sub", "tags": []})],
                    },
                ],
            }
        ]
    }
    report = stage(service, f" {subject.upper()} ", batch)
    after = service.snapshot()
    quiz = report["createdQuizzes"][0]
    assert [t["name"] for t in report["createdTopics"]] == ["New topic"]
    assert report["questionsAdded"][0]["count"] == 3 and len(report["createdQuizzes"]) == 1
    assert [q["stem"] for q in after["questions"] if q["quizId"] == quiz["id"]] == [
        "First",
        "Second",
        "Third",
    ]
    first = after["questions"][-3]
    assert first["choices"] == [{"id": "A", "text": "One"}, {"id": "B", "text": "Two"}]
    assert "pearls" not in first and after["questions"][-1]["metadata"] == {"subtopic": "Sub"}
    assert after["questions"][: len(before["questions"])] == before["questions"]
    assert report["changeIds"] == list(
        range(before["latestChangeId"] + 1, after["latestChangeId"] + 1)
    )
    assert scalar(db.operator, "SELECT count(DISTINCT actor) FROM content.draft_changes") == 1
    assert scalar(db.operator, "SELECT min(actor) FROM content.draft_changes") == "agent:test"
    assert after["changed"] is True and after["activeReleaseId"] == before["activeReleaseId"]


def test_staging_merges_into_existing_topic_and_quiz_by_name(staged):
    service, subject = staged
    before = service.snapshot()
    topic, quiz = before["topics"][0], before["quizzes"][0]
    report = stage(
        service,
        subject,
        {
            "topics": [
                {
                    "name": topic["name"].upper(),
                    "quizzes": [{"name": quiz["name"], "items": [item("Added")]}],
                }
            ]
        },
    )
    after = service.snapshot()
    assert report["createdTopics"] == [] and report["createdQuizzes"] == []
    assert {m["id"] for m in report["merged"]} == {topic["id"], quiz["id"]}
    assert after["topics"] == before["topics"] and after["quizzes"] == before["quizzes"]
    assert (
        after["questions"][-1]["stem"] == "Added" and after["questions"][-1]["quizId"] == quiz["id"]
    )


def test_invalid_item_reports_error_and_adds_no_questions(staged):
    service, subject = staged
    before = service.snapshot()["questions"]
    report = {}
    batch = {
        "topics": [{"name": "T", "quizzes": [{"name": "Q", "items": [item("Bad", answer="Z")]}]}]
    }
    with pytest.raises(ContentPolicyError):
        stage_quizzes(service, subject, batch, report)
    assert service.snapshot()["questions"] == before
    with pytest.raises(DraftError, match="not an editable field"):
        stage(service, subject, {"topics": [{"name": "T", "oops": 1, "quizzes": []}]})


def test_question_edits_patch_fields_and_refuse_stale_or_foreign(db, staged):
    service, subject = staged
    stage(
        service,
        subject,
        {
            "topics": [
                {
                    "name": "T",
                    "quizzes": [
                        {
                            "name": "Q",
                            "items": [
                                item("S1", rationaleMeta={"sources": "Old"}),
                                item("S2", rationaleMeta={"sources": "Old"}),
                            ],
                        }
                    ],
                }
            ]
        },
    )
    first, second = service.snapshot()["questions"][-2:]
    edits = [
        {
            "id": first["id"],
            "version": first["version"],
            "stem": "S1 corrected",
            "choices": {"B": "Two reworded"},
            "answer": "A",
            "rationaleMeta": {"sources": "New"},
        },
        {"id": second["id"], "version": second["version"], "rationaleMeta": {"sources": " "}},
    ]
    report = stage(service, subject, {"edits": edits})
    after = service.snapshot()
    assert report["edited"] == [first["id"], second["id"]] and len(report["changeIds"]) == 2
    assert after["questions"][-2:] == [
        {
            **first,
            "version": first["version"] + 1,
            "stem": "S1 corrected",
            "choices": [{"id": "A", "text": "One"}, {"id": "B", "text": "Two reworded"}],
            "answer": "A",
            "rationaleMeta": {"sources": "New"},
        },
        {
            k: v
            for k, v in {**second, "version": second["version"] + 1}.items()
            if k != "rationaleMeta"
        },
    ]
    other = service.create(
        KINDS["subjects"], None, MISSING, {"name": "Other subject", "accent": "#123456"}
    )
    before = service.snapshot()
    fresh = {**edits[0], "version": first["version"] + 1}
    for name, batch, match in (
        (subject, {"edits": [fresh, edits[1]]}, r"\$\.edits\[1\]\.version is stale"),
        (subject, {"edits": [fresh, fresh]}, "more than once"),
        (subject, {"edits": [{**fresh, "choices": ["X"]}]}, "must map choice IDs"),
        (subject, {"edits": [{**fresh, "choices": {"B": " "}}]}, "non-empty string"),
        (subject, {"edits": [{**fresh, "choices": {"C": "X"}}]}, "not a choice of the question"),
        (subject, {"edits": [{**fresh, "oops": 1}]}, "not an editable field"),
        (subject, {"edits": [{"id": first["id"], "version": 2}]}, "must change one of"),
        (other["record"]["name"], {"edits": [fresh]}, "not a question of this subject"),
    ):
        with pytest.raises(DraftError, match=match):
            stage(service, name, batch)
    assert service.snapshot() == before


def test_outline_lists_topics_counts_subtopics_and_stems(staged):
    service, subject = staged
    stage(
        service,
        subject,
        {
            "topics": [
                {
                    "name": "Outlined",
                    "quizzes": [
                        {
                            "name": "Q",
                            "items": [
                                item("S1", metadata={"subtopic": "b", "difficulty": "hard"}),
                                item("S2", metadata={"subtopic": "a", "difficulty": "hard"}),
                            ],
                        }
                    ],
                }
            ]
        },
    )
    result = outline(service, subject)
    topic = result["topics"][-1]
    assert result["subject"]["name"] == subject
    assert topic["name"] == "Outlined" and topic["subtopics"] == ["a", "b"]
    assert topic["quizzes"][0]["questionCount"] == 2 and topic["quizzes"][0]["stems"] == [
        "S1",
        "S2",
    ]
    assert topic["quizzes"][0]["difficulty"] == {"hard": 2}
    with pytest.raises(DraftError, match="No subject"):
        outline(service, "Missing")


def test_split_moves_subtopic_questions_with_their_ids_and_renames_the_quiz(staged):
    service, subject = staged
    items = [item(f"S{i}", metadata={"subtopic": s}) for i, s in enumerate("abab")]
    stage(
        service,
        subject,
        {"topics": [{"name": "Split", "quizzes": [{"name": "Old", "items": items}]}]},
    )
    before = service.snapshot()
    report = {}
    split_quiz(service, subject, "old", ["B"], {"name": "New"}, {"name": "Renamed"}, report)
    after = service.snapshot()
    new = report["createdQuiz"]["id"]
    old = next(q for q in before["quizzes"] if q["name"] == "Old")["id"]
    stems = {i: [q["stem"] for q in after["questions"] if q["quizId"] == i] for i in (old, new)}
    assert stems == {old: ["S0", "S2"], new: ["S1", "S3"]}
    assert {q["id"] for q in after["questions"]} == {q["id"] for q in before["questions"]}
    names = [q["name"] for q in after["quizzes"] if q["topicId"] == after["quizzes"][-1]["topicId"]]
    assert names == ["Renamed", "New"]
    with pytest.raises(DraftError, match="not found"):
        split_quiz(service, subject, "Renamed", ["zzz"], {"name": "Other"}, {}, {})


def cards(service, deck_id):
    return [c for c in service.snapshot()["cards"] if c["deckId"] == deck_id]


def stage_cards(service, subject, batch):
    report = {}
    stage_flashcards(service, subject, batch, report)
    return report


def test_staging_flashcards_creates_decks_and_merges_by_name(staged):
    service, subject = staged
    before = service.snapshot()
    topic, deck = before["topics"][0], before["decks"][0]
    card = {"front": "F", "back": "B", "sources": " "}
    report = stage_cards(
        service,
        subject,
        {
            "topics": [
                {
                    "name": topic["name"].upper(),
                    "decks": [
                        {"name": deck["name"], "cards": [card]},
                        {"name": "New deck", "description": "D", "cards": [card, card]},
                        {"name": " new deck ", "cards": [{**card, "front": "Last"}]},
                    ],
                },
                {"name": "New topic", "decks": [{"name": "Other", "cards": [card]}]},
            ]
        },
    )
    after = service.snapshot()
    assert [t["name"] for t in report["createdTopics"]] == ["New topic"]
    assert [d["name"] for d in report["createdDecks"]] == ["New deck", "Other"]
    assert [a["count"] for a in report["cardsAdded"]] == [1, 3, 1]
    assert after["topics"][: len(before["topics"])] == before["topics"]
    assert after["decks"][0] == deck
    added = cards(service, report["createdDecks"][0]["id"])
    assert [c["front"] for c in added] == ["F", "F", "Last"] and "sources" not in added[0]
    assert len(cards(service, deck["id"])) == 2
    assert after["changed"] is True and after["activeReleaseId"] == before["activeReleaseId"]


def test_flashcard_edits_patch_given_fields_and_deletes_remove(staged):
    service, subject = staged
    deck = service.snapshot()["decks"][0]
    stage_cards(
        service,
        subject,
        {
            "topics": [
                {
                    "name": "T",
                    "decks": [
                        {
                            "name": "D",
                            "cards": [
                                {"front": f"F{i}", "back": f"B{i}", "sources": "S"}
                                for i in range(3)
                            ],
                        }
                    ],
                }
            ]
        },
    )
    deck = next(d for d in service.snapshot()["decks"] if d["name"] == "D")
    first, second, third = cards(service, deck["id"])
    report = stage_cards(
        service,
        subject,
        {
            "edits": [
                {"id": first["id"], "version": first["version"], "back": "New", "sources": ""}
            ],
            "deletes": [{"id": second["id"], "version": second["version"]}],
        },
    )
    left = cards(service, deck["id"])
    assert report["edited"] == [first["id"]] and report["deleted"] == [second["id"]]
    assert left == [
        {
            "id": first["id"],
            "deckId": deck["id"],
            "version": first["version"] + 1,
            "front": "F0",
            "back": "New",
        },
        third,
    ]
    assert len(report["changeIds"]) == 2


def test_flashcard_batch_with_stale_or_foreign_cards_writes_nothing(staged):
    service, subject = staged
    stage_cards(
        service,
        subject,
        {
            "topics": [
                {"name": "T", "decks": [{"name": "D", "cards": [{"front": "F", "back": "B"}]}]}
            ]
        },
    )
    card = service.snapshot()["cards"][-1]
    before = service.snapshot()
    edit = {"id": card["id"], "version": card["version"], "front": "X"}
    new = {
        "topics": [
            {"name": "Never", "decks": [{"name": "D", "cards": [{"front": "F", "back": "B"}]}]}
        ]
    }
    for batch, path in (
        ({**new, "edits": [edit, {**edit, "version": 99}]}, r"\$\.edits\[1\]\.id"),
        ({**new, "edits": [{**edit, "version": 99}]}, r"\$\.edits\[0\]\.version"),
        ({**new, "deletes": [{"id": "fmissing", "version": 1}]}, r"\$\.deletes\[0\]\.id"),
        ({"edits": [edit], "deletes": [{"id": card["id"], "version": 1}]}, r"\$\.deletes\[0\]\.id"),
    ):
        with pytest.raises(DraftError, match=path):
            stage_flashcards(service, subject, batch, {})
    with pytest.raises(DraftError, match="not an editable field"):
        stage_cards(service, subject, {"edits": [{**edit, "oops": 1}]})
    assert service.snapshot() == before


def test_flashcard_card_of_another_subject_is_refused(db):
    seed(db)
    service = DraftService(db.editor, "agent:test", lambda fresh: None)
    snapshot = service.snapshot()
    other = service.create(
        KINDS["subjects"], None, MISSING, {"name": "Other subject", "accent": "#123456"}
    )
    card = snapshot["cards"][0]
    batch = {"deletes": [{"id": card["id"], "version": card["version"]}]}
    with pytest.raises(DraftError, match="not a card of this subject"):
        stage_cards(service, other["record"]["name"], batch)
    assert service.snapshot()["cards"] == snapshot["cards"]


def test_deck_outline_lists_decks_cards_versions_and_subtopic_counts(staged):
    service, subject = staged
    stage(
        service,
        subject,
        {
            "topics": [
                {
                    "name": "Outlined",
                    "quizzes": [
                        {
                            "name": "Q",
                            "items": [
                                item("S1", metadata={"subtopic": "b"}),
                                item("S2", metadata={"subtopic": "b"}),
                                item("S3", metadata={"subtopic": "a"}),
                            ],
                        }
                    ],
                }
            ]
        },
    )
    stage_cards(
        service,
        subject,
        {
            "topics": [
                {
                    "name": "Outlined",
                    "decks": [
                        {
                            "name": "Deck",
                            "description": "D",
                            "cards": [
                                {"front": "F", "back": "B", "sources": "S"},
                                {"front": "G", "back": "H"},
                            ],
                        }
                    ],
                }
            ]
        },
    )
    topic = deck_outline(service, subject)["topics"][-1]
    deck = topic["decks"][0]
    assert topic["questionCount"] == 3 and topic["subtopics"] == {"a": 1, "b": 2}
    assert deck["name"] == "Deck" and deck["description"] == "D"
    assert deck["cards"] == [
        {"id": deck["cards"][0]["id"], "version": 1, "front": "F", "back": "B", "sources": "S"},
        {"id": deck["cards"][1]["id"], "version": 1, "front": "G", "back": "H"},
    ]
    with pytest.raises(DraftError, match="No subject"):
        deck_outline(service, "Missing")

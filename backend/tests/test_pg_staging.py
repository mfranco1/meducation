"""Real PG17: agent staging writes the draft through DraftService and never publishes."""

import pytest
from support import scalar, seed

from meducation_api.admin.service import DraftError, DraftService
from meducation_api.admin.staging import outline, split_quiz, stage_quizzes
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
                                item("S1", metadata={"subtopic": "b"}),
                                item("S2", metadata={"subtopic": "a"}),
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

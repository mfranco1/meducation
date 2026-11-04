"""Agent staging into the editor draft through DraftService. Nothing here publishes."""

from typing import Any

from meducation_api.admin.service import MISSING, DraftError, DraftService
from meducation_api.content.draft import KINDS

CHUNK = 1000
ITEM_KEYS = {"stem", "choices", "answer", "rationale", "rationaleMeta", "pearls", "metadata"}


def _key(name: str) -> str:
    return name.strip().lower()


def _find(rows: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    return next((row for row in rows if _key(row["name"]) == _key(name)), None)


def _subject(snapshot: dict[str, Any], name: str) -> dict[str, Any]:
    subject = _find(snapshot["subjects"], name)
    if subject is None:
        raise DraftError(404, "subject_not_found", f"No subject is named {name!r}.")
    return subject


def outline(service: DraftService, subject_name: str) -> dict[str, Any]:
    """Topics, quizzes, subtopics and stems of one subject, in draft order."""
    snapshot = service.snapshot()
    subject = _subject(snapshot, subject_name)
    topics = []
    for topic in snapshot["topics"]:
        if topic["subjectId"] != subject["id"]:
            continue
        quizzes: list[dict[str, Any]] = []
        subtopics: set[str] = set()
        for quiz in snapshot["quizzes"]:
            if quiz["topicId"] != topic["id"]:
                continue
            questions = [q for q in snapshot["questions"] if q["quizId"] == quiz["id"]]
            subtopics.update(
                q["metadata"]["subtopic"]
                for q in questions
                if q.get("metadata", {}).get("subtopic")
            )
            quizzes.append(
                {
                    "id": quiz["id"],
                    "name": quiz["name"],
                    **({"description": quiz["description"]} if "description" in quiz else {}),
                    "questionCount": len(questions),
                    "stems": [q["stem"] for q in questions],
                }
            )
        topics.append(
            {
                "id": topic["id"],
                "name": topic["name"],
                **({"description": topic["description"]} if "description" in topic else {}),
                "subtopics": sorted(subtopics),
                "quizzes": quizzes,
            }
        )
    return {"subject": {"id": subject["id"], "name": subject["name"]}, "topics": topics}


def _blank(value: Any) -> bool:
    return (
        value is None
        or value == ""
        or value == []
        or value == {}
        or (isinstance(value, str) and not value.strip())
    )


def _without_blanks(value: Any) -> Any:
    if isinstance(value, list):
        value = [entry for entry in value if not _blank(entry)]
    elif isinstance(value, dict):
        value = {
            k: v for k, v in ((k, _without_blanks(v)) for k, v in value.items()) if not _blank(v)
        }
    return None if _blank(value) else value


def _reject(path: str, message: str) -> DraftError:
    return DraftError(400, "invalid_batch", f"{path} {message}")


def _object(value: Any, path: str, keys: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise _reject(path, "must be an object.")
    for key in value:
        if key not in keys:
            raise _reject(f"{path}.{key}", "is not an editable field.")
    return value


def _named(value: Any, path: str, keys: set[str]) -> dict[str, Any]:
    entry = _object(value, path, {"name", "description", *keys})
    if not isinstance(entry.get("name"), str) or not entry["name"].strip():
        raise _reject(f"{path}.name", "must be a non-empty string.")
    if not isinstance(entry.get("description", ""), str):
        raise _reject(f"{path}.description", "must be a string.")
    return entry


def _list(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list) or not value:
        raise _reject(path, "must be a non-empty array.")
    return value


def _question(item: Any, path: str) -> dict[str, Any]:
    item = _object(item, path, ITEM_KEYS)
    choices = item.get("choices")
    if not isinstance(choices, list) or not all(isinstance(c, str) for c in choices):
        raise _reject(f"{path}.choices", "must be an array of strings.")
    if len(choices) > 26:
        raise _reject(f"{path}.choices", "can hold at most 26 choices.")
    optional = {
        k: v
        for k in ("rationaleMeta", "pearls", "metadata")
        if (v := _without_blanks(item.get(k))) is not None
    }
    return {
        **{k: item[k] for k in ("stem", "answer", "rationale") if k in item},
        "choices": [{"id": chr(65 + i), "text": text} for i, text in enumerate(choices)],
        **optional,
    }


def _plan(batch: Any) -> list[dict[str, Any]]:
    """Validates the batch shape and folds same-named topics and quizzes together."""
    topics: dict[str, dict[str, Any]] = {}
    for t, raw_topic in enumerate(_list(_object(batch, "$", {"topics"}).get("topics"), "$.topics")):
        path = f"$.topics[{t}]"
        topic = _named(raw_topic, path, {"quizzes"})
        folded = topics.setdefault(_key(topic["name"]), {"topic": topic, "quizzes": {}})
        for q, raw_quiz in enumerate(_list(topic.get("quizzes"), f"{path}.quizzes")):
            quiz_path = f"{path}.quizzes[{q}]"
            quiz = _named(raw_quiz, quiz_path, {"items"})
            entry = folded["quizzes"].setdefault(
                _key(quiz["name"]), {"quiz": quiz, "questions": []}
            )
            entry["questions"] += [
                _question(item, f"{quiz_path}.items[{i}]")
                for i, item in enumerate(_list(quiz.get("items"), f"{quiz_path}.items"))
            ]
    return list(topics.values())


def _fields(entry: dict[str, Any]) -> dict[str, Any]:
    return {k: entry[k] for k in ("name", "description") if not _blank(entry.get(k))}


def stage_quizzes(
    service: DraftService, subject_name: str, batch: Any, report: dict[str, Any]
) -> None:
    """Adds the batch under the subject. `report` fills in as records are saved, so a
    DraftError partway leaves it describing what was already written."""
    plan = _plan(batch)
    snapshot = service.snapshot()
    subject = _subject(snapshot, subject_name)
    report.update(createdTopics=[], createdQuizzes=[], merged=[], questionsAdded=[], changeIds=[])
    changes: list[int] = report["changeIds"]

    def create(kind: str, parent_id: str, entry: dict[str, Any], created: str) -> str:
        done = service.create(KINDS[kind], parent_id, MISSING, _fields(entry))
        changes.append(done["changeId"])
        report[created].append({"id": done["record"]["id"], "name": done["record"]["name"]})
        return str(done["record"]["id"])

    existing_topics = [t for t in snapshot["topics"] if t["subjectId"] == subject["id"]]
    for topic in plan:
        match = _find(existing_topics, topic["topic"]["name"])
        if match:
            topic_id = match["id"]
            report["merged"].append({"id": topic_id, "name": match["name"]})
        else:
            topic_id = create("topics", subject["id"], topic["topic"], "createdTopics")
        existing_quizzes = [q for q in snapshot["quizzes"] if q["topicId"] == topic_id]
        for entry in topic["quizzes"].values():
            match = _find(existing_quizzes, entry["quiz"]["name"])
            if match:
                quiz_id, name = match["id"], match["name"]
                report["merged"].append({"id": quiz_id, "name": name})
            else:
                quiz_id = create("quizzes", topic_id, entry["quiz"], "createdQuizzes")
                name = entry["quiz"]["name"]
            added = {"quizId": quiz_id, "name": name, "count": 0}
            report["questionsAdded"].append(added)
            questions = entry["questions"]
            for start in range(0, len(questions), CHUNK):
                done = service.bulk(
                    KINDS["questions"], quiz_id, MISSING, questions[start : start + CHUNK]
                )
                changes.extend(done["changeIds"])
                added["count"] += len(done["records"])

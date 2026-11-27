"""Agent staging into the editor draft through DraftService. Nothing here publishes."""

from collections import Counter
from typing import Any

from meducation_api.admin.service import MISSING, DraftError, DraftService
from meducation_api.content.draft import KINDS

CHUNK = 1000
ITEM_KEYS = {"stem", "choices", "answer", "rationale", "rationaleMeta", "pearls", "metadata"}
EDIT_KEYS = ("stem", "answer", "rationale", "pearls", "rationaleMeta")


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
                    "difficulty": dict(
                        Counter(
                            q["metadata"]["difficulty"]
                            for q in questions
                            if q.get("metadata", {}).get("difficulty")
                        )
                    ),
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


def _plan(batch: Any) -> tuple[list[dict[str, Any]], list[Any]]:
    """Validates the batch shape and folds same-named topics and quizzes together."""
    batch = _object(batch, "$", {"topics", "edits"})
    if not batch:
        raise _reject("$", "must hold topics or edits.")
    topics: dict[str, dict[str, Any]] = {}
    for t, raw_topic in enumerate(_list(batch["topics"], "$.topics") if "topics" in batch else []):
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
    edits = _list(batch["edits"], "$.edits") if "edits" in batch else []
    for i, edit in enumerate(edits):
        path = f"$.edits[{i}]"
        _versioned(edit, path, set(EDIT_KEYS))
        if not set(EDIT_KEYS) & edit.keys():
            raise _reject(path, f"must change one of {', '.join(EDIT_KEYS)}.")
    return list(topics.values()), edits


def _versioned(entry: Any, path: str, keys: set[str]) -> None:
    entry = _object(entry, path, {"id", "version", *keys})
    if not isinstance(entry.get("id"), str) or not entry["id"]:
        raise _reject(f"{path}.id", "must be a record ID.")
    if type(entry.get("version")) is not int:
        raise _reject(f"{path}.version", "must be a whole number.")


def _check_current(
    entries: list[Any], path: str, records: dict[str, dict[str, Any]], noun: str, seen: set[str]
) -> None:
    """Refuses an ID outside the subject, a repeated ID or a stale version."""
    for i, entry in enumerate(entries):
        if entry["id"] not in records:
            raise _reject(f"{path}[{i}].id", f"is not a {noun} of this subject.")
        if entry["id"] in seen:
            raise _reject(f"{path}[{i}].id", "appears more than once.")
        seen.add(entry["id"])
        current = records[entry["id"]]["version"]
        if entry["version"] != current:
            raise _reject(f"{path}[{i}].version", f"is stale. The {noun} is at version {current}.")


def _fields(entry: dict[str, Any]) -> dict[str, Any]:
    return {k: entry[k] for k in ("name", "description") if not _blank(entry.get(k))}


def _create(
    service: DraftService,
    kind: str,
    parent_id: str,
    entry: dict[str, Any],
    report: dict[str, Any],
    created: str,
) -> str:
    done = service.create(KINDS[kind], parent_id, MISSING, _fields(entry))
    report["changeIds"].append(done["changeId"])
    report[created].append({"id": done["record"]["id"], "name": done["record"]["name"]})
    return str(done["record"]["id"])


def _add(
    service: DraftService,
    kind: str,
    parent_id: str,
    items: list[dict[str, Any]],
    added: dict[str, Any],
    report: dict[str, Any],
) -> None:
    for start in range(0, len(items), CHUNK):
        done = service.bulk(KINDS[kind], parent_id, MISSING, items[start : start + CHUNK])
        report["changeIds"].extend(done["changeIds"])
        added["count"] += len(done["records"])


def stage_quizzes(
    service: DraftService, subject_name: str, batch: Any, report: dict[str, Any]
) -> None:
    """Patches existing questions of the subject (EDIT_KEYS; a blank `rationaleMeta` removes
    it), then adds the batch's topics under it. Every edit is checked against one snapshot
    before anything is written. `report` fills in as records are saved, so a DraftError
    partway leaves it describing what was already written."""
    plan, edits = _plan(batch)
    snapshot = service.snapshot()
    subject = _subject(snapshot, subject_name)
    topic_ids = {t["id"] for t in snapshot["topics"] if t["subjectId"] == subject["id"]}
    quiz_ids = {q["id"] for q in snapshot["quizzes"] if q["topicId"] in topic_ids}
    questions = {q["id"]: q for q in snapshot["questions"] if q["quizId"] in quiz_ids}
    _check_current(edits, "$.edits", questions, "question", set())
    report.update(
        createdTopics=[], createdQuizzes=[], merged=[], questionsAdded=[], edited=[], changeIds=[]
    )
    for edit in edits:
        fields = {k: edit[k] for k in EDIT_KEYS if k in edit}
        if "rationaleMeta" in fields:
            fields["rationaleMeta"] = _without_blanks(fields["rationaleMeta"])
        done = service.update(KINDS["questions"], edit["id"], edit["version"], fields)
        report["edited"].append(edit["id"])
        if done["changeId"] is not None:
            report["changeIds"].append(done["changeId"])

    existing_topics = [t for t in snapshot["topics"] if t["subjectId"] == subject["id"]]
    for topic in plan:
        match = _find(existing_topics, topic["topic"]["name"])
        if match:
            topic_id = match["id"]
            report["merged"].append({"id": topic_id, "name": match["name"]})
        else:
            topic_id = _create(
                service, "topics", subject["id"], topic["topic"], report, "createdTopics"
            )
        existing_quizzes = [q for q in snapshot["quizzes"] if q["topicId"] == topic_id]
        for entry in topic["quizzes"].values():
            match = _find(existing_quizzes, entry["quiz"]["name"])
            if match:
                quiz_id, name = match["id"], match["name"]
                report["merged"].append({"id": quiz_id, "name": name})
            else:
                quiz_id = _create(
                    service, "quizzes", topic_id, entry["quiz"], report, "createdQuizzes"
                )
                name = entry["quiz"]["name"]
            added = {"quizId": quiz_id, "name": name, "count": 0}
            report["questionsAdded"].append(added)
            _add(service, "questions", quiz_id, entry["questions"], added, report)


def deck_outline(service: DraftService, subject_name: str) -> dict[str, Any]:
    """Topics, quiz subtopic counts, decks and cards of one subject, in draft order."""
    snapshot = service.snapshot()
    subject = _subject(snapshot, subject_name)
    topics = []
    for topic in snapshot["topics"]:
        if topic["subjectId"] != subject["id"]:
            continue
        quiz_ids = {q["id"] for q in snapshot["quizzes"] if q["topicId"] == topic["id"]}
        questions = [q for q in snapshot["questions"] if q["quizId"] in quiz_ids]
        decks = []
        for deck in snapshot["decks"]:
            if deck["topicId"] != topic["id"]:
                continue
            cards = [
                {
                    "id": c["id"],
                    "version": c["version"],
                    "front": c["front"],
                    "back": c["back"],
                    **({"sources": c["sources"]} if "sources" in c else {}),
                }
                for c in snapshot["cards"]
                if c["deckId"] == deck["id"]
            ]
            decks.append(
                {
                    "id": deck["id"],
                    "name": deck["name"],
                    **({"description": deck["description"]} if "description" in deck else {}),
                    "cards": cards,
                }
            )
        topics.append(
            {
                "id": topic["id"],
                "name": topic["name"],
                **({"description": topic["description"]} if "description" in topic else {}),
                "questionCount": len(questions),
                "subtopics": dict(
                    Counter(
                        q["metadata"]["subtopic"]
                        for q in questions
                        if q.get("metadata", {}).get("subtopic")
                    )
                ),
                "decks": decks,
            }
        )
    return {"subject": {"id": subject["id"], "name": subject["name"]}, "topics": topics}


def _text(entry: dict[str, Any], key: str, path: str) -> None:
    if not isinstance(entry[key], str) or not entry[key].strip():
        raise _reject(f"{path}.{key}", "must be a non-empty string.")


def _card_fields(entry: dict[str, Any], path: str, keys: tuple[str, ...]) -> dict[str, Any]:
    """Checks the given face and sources values. A blank `sources` becomes None."""
    for key in ("front", "back"):
        if key in keys and key in entry:
            _text(entry, key, path)
    if "sources" in entry and not isinstance(entry["sources"], str):
        raise _reject(f"{path}.sources", "must be a string.")
    fields = {k: entry[k] for k in keys if k in entry}
    if "sources" in fields and _blank(fields["sources"]):
        fields["sources"] = None
    return fields


def _flashcard_plan(batch: Any) -> tuple[list[dict[str, Any]], list[Any], list[Any]]:
    """Validates the batch shape and folds same-named topics and decks together."""
    batch = _object(batch, "$", {"topics", "edits", "deletes"})
    if not batch:
        raise _reject("$", "must hold topics, edits or deletes.")
    topics: dict[str, dict[str, Any]] = {}
    raw_topics = _list(batch["topics"], "$.topics") if "topics" in batch else []
    for t, raw_topic in enumerate(raw_topics):
        path = f"$.topics[{t}]"
        topic = _named(raw_topic, path, {"decks"})
        folded = topics.setdefault(_key(topic["name"]), {"topic": topic, "decks": {}})
        for d, raw_deck in enumerate(_list(topic.get("decks"), f"{path}.decks")):
            deck_path = f"{path}.decks[{d}]"
            deck = _named(raw_deck, deck_path, {"cards"})
            entry = folded["decks"].setdefault(_key(deck["name"]), {"deck": deck, "cards": []})
            for c, raw_card in enumerate(_list(deck.get("cards"), f"{deck_path}.cards")):
                card_path = f"{deck_path}.cards[{c}]"
                card = _object(raw_card, card_path, {"front", "back", "sources"})
                for key in ("front", "back"):
                    if key not in card:
                        raise _reject(f"{card_path}.{key}", "must be a non-empty string.")
                fields = _card_fields(card, card_path, ("front", "back", "sources"))
                entry["cards"].append({k: v for k, v in fields.items() if v is not None})
    edits = _list(batch["edits"], "$.edits") if "edits" in batch else []
    for i, edit in enumerate(edits):
        path = f"$.edits[{i}]"
        _versioned(edit, path, {"front", "back", "sources"})
        if not {"front", "back", "sources"} & edit.keys():
            raise _reject(path, "must change front, back or sources.")
    deletes = _list(batch["deletes"], "$.deletes") if "deletes" in batch else []
    for i, delete in enumerate(deletes):
        _versioned(delete, f"$.deletes[{i}]", set())
    return list(topics.values()), edits, deletes


def stage_flashcards(
    service: DraftService, subject_name: str, batch: Any, report: dict[str, Any]
) -> None:
    """Edits and deletes cards of the subject, then adds new topics, decks and cards. Every
    edit and delete is checked against one snapshot before anything is written. `report`
    fills in as records are saved."""
    plan, edits, deletes = _flashcard_plan(batch)
    snapshot = service.snapshot()
    subject = _subject(snapshot, subject_name)
    topic_ids = {t["id"] for t in snapshot["topics"] if t["subjectId"] == subject["id"]}
    deck_topics = {d["id"]: d["topicId"] for d in snapshot["decks"]}
    cards = {c["id"]: c for c in snapshot["cards"] if deck_topics.get(c["deckId"]) in topic_ids}
    seen: set[str] = set()
    _check_current(edits, "$.edits", cards, "card", seen)
    _check_current(deletes, "$.deletes", cards, "card", seen)
    report.update(
        createdTopics=[],
        createdDecks=[],
        merged=[],
        cardsAdded=[],
        edited=[],
        deleted=[],
        changeIds=[],
    )
    for i, edit in enumerate(edits):
        fields = _card_fields(edit, f"$.edits[{i}]", ("front", "back", "sources"))
        done = service.update(KINDS["cards"], edit["id"], edit["version"], fields)
        report["edited"].append(edit["id"])
        if done["changeId"] is not None:
            report["changeIds"].append(done["changeId"])
    for entry in deletes:
        done = service.delete(KINDS["cards"], entry["id"], entry["version"], False)
        report["deleted"].append(entry["id"])
        report["changeIds"].extend(done["changeIds"])

    existing_topics = [t for t in snapshot["topics"] if t["subjectId"] == subject["id"]]
    for topic in plan:
        match = _find(existing_topics, topic["topic"]["name"])
        if match:
            topic_id = match["id"]
            report["merged"].append({"id": topic_id, "name": match["name"]})
        else:
            topic_id = _create(
                service, "topics", subject["id"], topic["topic"], report, "createdTopics"
            )
        existing_decks = [d for d in snapshot["decks"] if d["topicId"] == topic_id]
        for entry in topic["decks"].values():
            match = _find(existing_decks, entry["deck"]["name"])
            if match:
                deck_id, name = match["id"], match["name"]
                report["merged"].append({"id": deck_id, "name": name})
            else:
                deck_id = _create(service, "decks", topic_id, entry["deck"], report, "createdDecks")
                name = entry["deck"]["name"]
            added = {"deckId": deck_id, "name": name, "count": 0}
            report["cardsAdded"].append(added)
            _add(service, "cards", deck_id, entry["cards"], added, report)


def split_quiz(
    service: DraftService,
    subject_name: str,
    quiz_name: str,
    subtopics: list[str],
    new: dict[str, Any],
    rename: dict[str, Any],
    report: dict[str, Any],
) -> None:
    """Moves the questions of `subtopics` out of the named quiz into a new quiz placed after
    it, keeping their IDs and order, then optionally renames the old quiz. `report` fills in
    as records are saved."""
    snapshot = service.snapshot()
    subject = _subject(snapshot, subject_name)
    topic_ids = {t["id"] for t in snapshot["topics"] if t["subjectId"] == subject["id"]}
    matches = [
        q
        for q in snapshot["quizzes"]
        if q["topicId"] in topic_ids and _key(q["name"]) == _key(quiz_name)
    ]
    if len(matches) != 1:
        raise DraftError(404, "quiz_not_found", f"{len(matches)} quizzes are named {quiz_name!r}.")
    quiz = matches[0]
    if _blank(new.get("name")):
        raise _reject("name", "must be a non-empty string.")
    if _find([q for q in snapshot["quizzes"] if q["topicId"] == quiz["topicId"]], new["name"]):
        raise _reject("name", f"{new['name']!r} already exists in the topic.")
    wanted = {_key(s) for s in subtopics}
    questions = [q for q in snapshot["questions"] if q["quizId"] == quiz["id"]]
    found = {_key(q.get("metadata", {}).get("subtopic", "")) for q in questions}
    if missing := sorted(wanted - found):
        raise _reject("subtopic", f"{missing} not found in {quiz['name']!r}.")
    moving = [q for q in questions if _key(q.get("metadata", {}).get("subtopic", "")) in wanted]
    report.update(createdQuiz=None, moved=[], renamed=None, changeIds=[])
    done = service.create(KINDS["quizzes"], quiz["topicId"], quiz["id"], _fields(new))
    report["changeIds"].append(done["changeId"])
    target = done["record"]["id"]
    report["createdQuiz"] = {"id": target, "name": done["record"]["name"]}
    after = None
    for question in moving:
        done = service.move(KINDS["questions"], question["id"], question["version"], target, after)
        report["changeIds"].append(done["changeId"])
        report["moved"].append(after := question["id"])
    if fields := _fields(rename):
        done = service.update(KINDS["quizzes"], quiz["id"], quiz["version"], fields)
        report["changeIds"].append(done["changeId"])
        report["renamed"] = {"id": quiz["id"], "name": done["record"]["name"]}

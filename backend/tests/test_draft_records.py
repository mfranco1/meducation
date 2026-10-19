"""Real PG17: draft rebuilds, migration 0009 and the per-record draft HTTP API."""

import gzip
import json
from uuid import uuid4

import pytest
import test_postgres_content
from alembic import command
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from test_postgres_content import (
    ACTOR,
    REASON,
    ROOT,
    auth_app,
    auth_login,
    banks,
    content_state,
    reader_settings,
    scalar,
    seed,
)

from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.draft import build_documents, revisions
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.migrate import migration_config, upgrade
from meducation_api.db.recovery import advance_ids

pytestmark = pytest.mark.postgres


db = test_postgres_content.db  # shared disposable-database fixture


def fixture_pairs():
    e2e = ROOT / "e2e/fixtures"
    shared = ROOT / "tests/fixtures"
    full = json.loads((shared / "draft-roundtrip-pair.json").read_text())
    q, f = banks()
    return {
        "e2e": (
            json.loads((e2e / "bank.json").read_text()),
            json.loads((e2e / "flashcard-bank.json").read_text()),
        ),
        "question-bank": (
            json.loads((shared / "question-bank.json").read_text()),
            json.loads((shared / "empty-flashcard-bank.json").read_text()),
        ),
        "appended-and-empty-fields": (q, f),
        "every-optional-field": (full["quizzes"], full["flashcards"]),
    }


def to_revision(db, revision):
    with db.admin.begin() as connection:
        connection.exec_driver_sql("DROP SCHEMA admin_auth CASCADE")
        connection.exec_driver_sql("DROP SCHEMA content CASCADE")
    bootstrap(db.admin, RolePasswords(_env_file=None))
    with db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        config = migration_config()
        config.attributes["connection"] = connection
        command.upgrade(config, revision)


@pytest.mark.parametrize("name", list(fixture_pairs()))
def test_draft_rebuilds_byte_identical_artifacts_and_revisions(db, name):
    q, f = fixture_pairs()[name]
    release = seed(db, q=q, f=f)
    with db.operator.connect() as connection:
        expected = connection.execute(
            text(
                "SELECT quiz_artifact,flashcard_artifact,quiz_revision,flashcard_revision "
                "FROM content.releases WHERE release_id=:r"
            ),
            {"r": release.release_id},
        ).one()
    with db.editor.connect() as connection:
        built = build_documents(connection)
    assert built == (expected[0], expected[1])
    assert revisions(*built) == {"quizRevision": expected[2], "flashcardRevision": expected[3]}


LEGACY_QUIZ = {
    "schemaVersion": 4,
    "subjects": [
        {"id": "s1", "name": "Anatomy", "accent": "#123456"},
        {"id": "s2", "name": "Empty", "accent": "#654321"},
    ],
    "quizzes": [
        {"id": "q1", "subjectId": "s1", "name": "Practice Test 1"},
        {"name": "Practice Test 2", "id": "q2", "subjectId": "s1"},
    ],
    "questions": [
        {
            "id": f"i{n}",
            "quizId": f"q{n}",
            "stem": "Stem",
            "choices": [{"id": "A", "text": "One"}, {"id": "B", "text": "Two"}],
            "answer": "A",
            "rationale": "Because.",
        }
        for n in (1, 2)
    ],
}
LEGACY_FLASHCARDS = {
    "schemaVersion": 2,
    "decks": [{"id": "d-1", "subjectId": "s1", "name": "Cranial nerves"}],
    "cards": [{"id": "f-1", "deckId": "d-1", "front": "CN I", "back": "Olfactory"}],
}


def test_migration_0009_groups_existing_content_into_topics(db):
    """A 0008 draft gains default topics; the next publish serves topics to learners."""
    to_revision(db, "0008_retire_legacy")
    from meducation_api.content_policy import artifact_text
    from meducation_api.db.operations import activate_release

    # The current Python store validates only the current schema; call the 0008 function.
    with db.operator.begin() as connection:
        stored = connection.execute(
            text("SELECT content.store_release(:op,:q,:f,CAST(:h AS jsonb),:a,:r)"),
            {
                "op": uuid4(),
                "q": artifact_text(LEGACY_QUIZ),
                "f": artifact_text(LEGACY_FLASHCARDS),
                "h": json.dumps({"quiz": "0" * 64, "flashcard": "0" * 64}),
                "a": ACTOR,
                "r": REASON,
            },
        ).scalar_one()
        legacy_id = stored["release_id"]
        connection.execute(
            text("SELECT content.activate_release(:op,CAST(:id AS uuid),0,:a,:r)"),
            {"op": uuid4(), "id": legacy_id, "a": ACTOR, "r": REASON},
        )
    with db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        for n, subject in enumerate(LEGACY_QUIZ["subjects"]):
            connection.execute(
                text("INSERT INTO content.draft_subjects(id,position,name,accent) VALUES(:id,:n,:name,:accent)"),
                {**subject, "n": n},
            )
        connection.execute(
            text(
                "INSERT INTO content.draft_quizzes(id,position,field_order,subject_id,name) VALUES"
                "('q1',0,NULL,'s1','Practice Test 1'),"
                "('q2',1,ARRAY['name','id','subjectId'],'s1','Practice Test 2')"
            )
        )
        for n, question in enumerate(LEGACY_QUIZ["questions"]):
            connection.execute(
                text(
                    "INSERT INTO content.draft_questions(id,position,quiz_id,stem,choices,answer,rationale) "
                    "VALUES(:id,:n,:quizId,:stem,CAST(:choices AS json),:answer,:rationale)"
                ),
                {**question, "n": n, "choices": json.dumps(question["choices"])},
            )
        connection.exec_driver_sql(
            "INSERT INTO content.draft_decks(id,position,subject_id,name) VALUES('d-1',0,'s1','Cranial nerves');"
            "INSERT INTO content.draft_flashcards(id,position,deck_id,front,back) VALUES('f-1',0,'d-1','CN I','Olfactory');"
            "INSERT INTO content.draft_changes(actor,kind,entity_id,action,before,after) VALUES('editor','quizzes','q1','update',"
            "'{\"id\":\"q1\",\"subjectId\":\"s1\",\"name\":\"Old\",\"version\":1,\"position\":\"0\"}',"
            "'{\"id\":\"q1\",\"subjectId\":\"s1\",\"name\":\"Practice Test 1\",\"version\":1,\"position\":\"0\"}')"
        )
        connection.execute(
            text("UPDATE content.draft_state SET base_release_id=:r,published_change_id=1"),
            {"r": legacy_id},
        )

    upgrade(db.migrator)

    with db.backup.connect() as connection:
        topics = connection.execute(
            text("SELECT id,subject_id,name FROM content.draft_topics ORDER BY position")
        ).all()
        quizzes = connection.execute(
            text("SELECT id,topic_id,version,field_order FROM content.draft_quizzes ORDER BY position")
        ).all()
        decks = connection.execute(text("SELECT topic_id,version FROM content.draft_decks")).all()
    assert [tuple(t) for t in topics] == [("t1", "s1", "Practice Tests"), ("t2", "s1", "Flashcards")]
    assert [tuple(q) for q in quizzes] == [
        ("q1", "t1", 2, None),
        ("q2", "t1", 2, ["name", "id", "topicId"]),
    ]
    assert [tuple(d) for d in decks] == [("t2", 2)]
    with db.editor.begin() as connection:
        assert connection.exec_driver_sql("SELECT nextval('content.draft_topic_ids')").scalar_one() == 3
    with pytest.raises(ContentDatabaseError), db.operator.begin() as connection:
        activate_release(
            connection,
            operation_id=uuid4(),
            release_id=legacy_id,
            expected_sequence=1,
            actor=ACTOR,
            reason=REASON,
        )

    # The learner API cannot start on a pre-topic release, so edit with the fixture reader.
    client, runtime, h = auth_app(db)
    with client:
        auth_login(client, runtime, h)
        snapshot = draft(client)
        assert snapshot["changed"] is True
        assert [r["name"] for r in snapshot["topics"]] == ["Practice Tests", "Flashcards"]
        obsolete = call(client, "POST", "/draft/changes/1/revert", {"expectedVersion": 2})
        assert obsolete.status_code == 409
        assert obsolete.json()["error"]["code"] == "change_obsolete"
        assert ok(client.get("/api/admin/releases"))["releases"] == []
        assert ok(call(client, "POST", "/draft/publish"))["published"] is True
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app

    with TestClient(create_app(reader_settings(db))) as learner:
        catalog = learner.get("/api/v1/subjects/s1/quizzes").json()
        assert [t["name"] for t in catalog["topics"]] == ["Practice Tests", "Flashcards"]
        assert {q["topicId"] for q in catalog["quizzes"]} == {"t1"}
        decks = learner.get("/api/v1/flashcards/subjects/s1/catalog").json()["decks"]
        assert [d["topicId"] for d in decks] == ["t2"]


PRE_0011_QUIZ = {
    "schemaVersion": 5,
    "subjects": [{"id": "s1", "name": "Anatomy", "accent": "#123456"}],
    "topics": [{"id": "t1", "subjectId": "s1", "name": "Nerves"}],
    "quizzes": [{"id": "q1", "topicId": "t1", "name": "Quiz"}],
    "questions": [
        {
            "id": "i1",
            "quizId": "q1",
            "stem": "Stem",
            "choices": [{"id": "A", "text": "One"}, {"id": "B", "text": "Two"}],
            "answer": "A",
            "rationale": "Because.",
        }
    ],
}


def test_migration_0011_simplifies_draft_answers_and_retires_old_releases(db):
    to_revision(db, "0010_descriptions")
    from meducation_api.content_policy import artifact_text
    from meducation_api.db.operations import activate_release

    with db.operator.begin() as connection:
        release_id = connection.execute(
            text("SELECT content.store_release(:op,:q,:f,CAST(:h AS jsonb),:a,:r)"),
            {
                "op": uuid4(),
                "q": artifact_text(PRE_0011_QUIZ),
                "f": artifact_text({"schemaVersion": 3, "decks": [], "cards": []}),
                "h": json.dumps({"quiz": "0" * 64, "flashcard": "0" * 64}),
                "a": ACTOR,
                "r": REASON,
            },
        ).scalar_one()["release_id"]
    choices = json.dumps(PRE_0011_QUIZ["questions"][0]["choices"])
    rows = (
        # id, answer, verified_answer, rationale_meta, field_order
        ("i1", None, "B", {"sources": "S", "provenance": "source_migrated"}, ["id", "verifiedAnswer"]),
        ("i2", "A", None, {"answerReviewNote": "Disputed"}, None),
        ("i3", "A", None, {"provenance": "source_migrated"}, None),
    )
    with db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.exec_driver_sql(
            "INSERT INTO content.draft_subjects(id,position,name,accent) VALUES('s1',0,'Anatomy','#123456');"
            "INSERT INTO content.draft_topics(id,position,subject_id,name) VALUES('t1',0,'s1','Nerves');"
            "INSERT INTO content.draft_quizzes(id,position,topic_id,name) VALUES('q1',0,'t1','Quiz')"
        )
        for n, (rid, answer, verified, meta, order) in enumerate(rows):
            connection.execute(
                text(
                    "INSERT INTO content.draft_questions(id,position,field_order,quiz_id,stem,choices,"
                    "answer,verified_answer,rationale,rationale_meta) VALUES(:id,:n,:order,'q1','Stem',"
                    "CAST(:choices AS json),:answer,:verified,'Because.',CAST(:meta AS json))"
                ),
                {
                    "id": rid, "n": n, "order": order, "choices": choices, "answer": answer,
                    "verified": verified, "meta": json.dumps(meta),
                },
            )

    upgrade(db.migrator)

    with db.backup.connect() as connection:
        found = connection.execute(
            text("SELECT id,answer,rationale_meta,field_order,version FROM content.draft_questions ORDER BY position")
        ).all()
    assert [tuple(row) for row in found] == [
        ("i1", "B", {"sources": "S"}, ["id"], 2),
        ("i3", "A", None, None, 2),
    ]
    with pytest.raises(ContentDatabaseError), db.operator.begin() as connection:
        activate_release(
            connection,
            operation_id=uuid4(),
            release_id=release_id,
            expected_sequence=0,
            actor=ACTOR,
            reason=REASON,
        )


# HTTP helpers -------------------------------------------------------------------------


def call(client, method, path, body=None):
    csrf = client.get("/api/admin/session").json()["csrfToken"]
    return client.request(
        method,
        "/api/admin" + path,
        json={} if body is None else body,
        headers={"Origin": str(client.base_url).rstrip("/"), "X-CSRF-Token": csrf},
    )


def ok(response, status=200):
    assert response.status_code == status, response.text
    return response.json()


def draft(client):
    return ok(client.get("/api/admin/draft"))


def ids(snapshot, kind):
    return [record["id"] for record in snapshot[kind]]


QUESTION = {
    "stem": "New **stem** β",
    "choices": [{"id": "A", "text": "One"}, {"id": "B", "text": "Two"}],
    "answer": "B",
    "rationale": "Because.",
}


@pytest.fixture
def editor(db):
    seed(db)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        yield client, runtime, h


def test_get_draft_returns_records_versions_gzip_and_changed_flag(db, editor):
    client, _, _ = editor
    raw = client.get("/api/admin/draft", headers={"Accept-Encoding": "gzip"})
    assert raw.headers["content-encoding"] == "gzip" and raw.headers["cache-control"] == "no-store"
    snapshot = raw.json()
    q, f = banks()
    assert [{k: v for k, v in r.items() if k != "version"} for r in snapshot["questions"]] == q[
        "questions"
    ]
    assert [{k: v for k, v in r.items() if k != "version"} for r in snapshot["cards"]] == f["cards"]
    assert list(snapshot["questions"][0]) == [*q["questions"][0], "version"]  # authored key order
    assert all(
        r["version"] == 1
        for kind in ("subjects", "topics", "quizzes", "decks")
        for r in snapshot[kind]
    )
    assert snapshot["changed"] is False and snapshot["latestChangeId"] == 0
    assert snapshot["activeReleaseId"] == snapshot["baseReleaseId"]
    plain = client.get("/api/admin/draft", headers={"Accept-Encoding": "identity"})
    assert "content-encoding" not in plain.headers
    assert gzip.decompress(gzip.compress(plain.content)) == plain.content


def test_crud_for_every_kind_records_changes_and_bumps_versions(db, editor):
    client, _, _ = editor
    subject = ok(
        call(
            client,
            "POST",
            "/draft/subjects",
            {"fields": {"name": "Physiology", "accent": "#00ff00"}},
        ),
        201,
    )
    sid = subject["record"]["id"]
    assert sid == "s2" and subject["record"]["version"] == 1
    topic = ok(
        call(client, "POST", "/draft/topics", {"parentId": sid, "fields": {"name": "Cardiology"}}),
        201,
    )["record"]
    assert topic == {"id": "t2", "subjectId": sid, "name": "Cardiology", "version": 1}
    quiz = ok(
        call(
            client, "POST", "/draft/quizzes", {"parentId": topic["id"], "fields": {"name": "Cardio"}}
        ),
        201,
    )["record"]
    question = ok(
        call(client, "POST", "/draft/questions", {"parentId": quiz["id"], "fields": QUESTION}), 201
    )["record"]
    assert question == {"id": question["id"], "quizId": quiz["id"], **QUESTION, "version": 1}
    deck = ok(
        call(
            client,
            "POST",
            "/draft/decks",
            {"parentId": topic["id"], "fields": {"name": "Deck", "description": "D"}},
        ),
        201,
    )["record"]
    assert deck["id"].startswith("d-")
    card = ok(
        call(
            client,
            "POST",
            "/draft/cards",
            {"parentId": deck["id"], "fields": {"front": "F", "back": "B"}},
        ),
        201,
    )["record"]
    assert card["id"].startswith("f-")
    snapshot = draft(client)
    assert snapshot["changed"] is True
    assert ids(snapshot, "subjects") == ["s1", sid] and ids(snapshot, "cards")[-1] == card["id"]

    updated = ok(
        call(
            client,
            "PUT",
            "/draft/questions/" + question["id"],
            {
                "expectedVersion": 1,
                "fields": {"answer": "A", "stem": "Edited", "pearls": ["P"]},
            },
        )
    )
    record = updated["record"]
    assert record["version"] == 2 and record["stem"] == "Edited" and record["answer"] == "A"
    assert list(record) == [
        "id",
        "quizId",
        "stem",
        "choices",
        "answer",
        "rationale",
        "pearls",
        "version",
    ]
    removed = ok(
        call(
            client,
            "PUT",
            "/draft/questions/" + question["id"],
            {"expectedVersion": 2, "fields": {"pearls": None}},
        )
    )
    assert "pearls" not in removed["record"] and removed["record"]["version"] == 3
    same = ok(
        call(
            client,
            "PUT",
            "/draft/questions/" + question["id"],
            {"expectedVersion": 3, "fields": {"stem": "Edited"}},
        )
    )
    assert same["changeId"] is None and same["record"]["version"] == 3
    for kind, rid, fields in (
        ("subjects", sid, {"name": "Renamed"}),
        ("topics", topic["id"], {"name": "Renamed"}),
        ("quizzes", quiz["id"], {"name": "Renamed"}),
        ("decks", deck["id"], {"description": None}),
        ("cards", card["id"], {"sources": "Src"}),
    ):
        result = ok(
            call(client, "PUT", f"/draft/{kind}/{rid}", {"expectedVersion": 1, "fields": fields})
        )
        assert result["record"]["version"] == 2
    assert "description" not in draft(client)["decks"][-1]

    for kind, rid, version in (
        ("cards", card["id"], 2),
        ("decks", deck["id"], 2),
        ("questions", question["id"], 3),
        ("quizzes", quiz["id"], 2),
        ("topics", topic["id"], 2),
        ("subjects", sid, 2),
    ):
        result = ok(call(client, "DELETE", f"/draft/{kind}/{rid}", {"expectedVersion": version}))
        assert result["deleted"] == [{"kind": kind, "id": rid}]
    changes = ok(client.get("/api/admin/draft/changes"))["changes"]
    assert [c["action"] for c in changes] == ["create"] * 6 + ["update"] * 7 + ["delete"] * 6
    assert changes[6]["before"]["version"] == 1 and changes[6]["after"]["stem"] == "Edited"
    assert "position" in changes[0]["after"] and changes[0]["before"] is None
    assert ok(client.get("/api/admin/draft/changes?since=15"))["changes"][0]["changeId"] == 16
    assert draft(client)["changed"] is False


def test_placement_and_move_keep_sibling_order(db, editor):
    client, _, _ = editor
    first = ok(
        call(
            client,
            "POST",
            "/draft/questions",
            {"parentId": "q1", "afterId": None, "fields": QUESTION},
        ),
        201,
    )["record"]["id"]
    last = ok(
        call(client, "POST", "/draft/questions", {"parentId": "q1", "fields": QUESTION}), 201
    )["record"]["id"]
    middle = ok(
        call(
            client,
            "POST",
            "/draft/questions",
            {"parentId": "q1", "afterId": "i1", "fields": QUESTION},
        ),
        201,
    )["record"]["id"]
    assert ids(draft(client), "questions") == [first, "i1", middle, last]
    quiz = ok(
        call(
            client,
            "POST",
            "/draft/quizzes",
            {"parentId": "t1", "afterId": None, "fields": {"name": "Earlier"}},
        ),
        201,
    )["record"]["id"]
    assert ids(draft(client), "quizzes") == [quiz, "q1"]
    lone = ok(
        call(client, "POST", "/draft/questions", {"parentId": quiz, "fields": QUESTION}), 201
    )["record"]["id"]
    assert ids(draft(client), "questions")[-1] == lone  # no siblings: after the global maximum
    moved = ok(
        call(
            client,
            "POST",
            f"/draft/questions/{middle}/move",
            {"expectedVersion": 1, "parentId": quiz, "afterId": None},
        )
    )
    assert moved["record"]["quizId"] == quiz and moved["record"]["version"] == 2
    snapshot = draft(client)
    assert ids(snapshot, "questions") == [first, "i1", last, middle, lone]
    ok(call(client, "POST", f"/draft/questions/{first}/move", {"expectedVersion": 1}))
    assert ids(draft(client), "questions")[:3] == ["i1", last, first]
    bad = call(
        client, "POST", f"/draft/questions/{last}/move", {"expectedVersion": 1, "afterId": lone}
    )
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_placement"
    missing = call(client, "POST", "/draft/questions", {"parentId": "q404", "fields": QUESTION})
    assert missing.status_code == 422 and missing.json()["error"]["code"] == "parent_not_found"
    ok(call(client, "POST", "/draft/subjects/s1/move", {"expectedVersion": 1, "afterId": None}))


def test_stale_version_returns_409_with_current_record(db, editor):
    client, _, _ = editor
    ok(
        call(
            client, "PUT", "/draft/subjects/s1", {"expectedVersion": 1, "fields": {"name": "Fresh"}}
        )
    )
    before = content_state(db)
    for method, path, body in (
        ("PUT", "/draft/subjects/s1", {"expectedVersion": 1, "fields": {"name": "Stale"}}),
        ("DELETE", "/draft/subjects/s1", {"expectedVersion": 1, "cascade": True}),
        ("POST", "/draft/subjects/s1/move", {"expectedVersion": 1}),
    ):
        response = call(client, method, path, body)
        assert response.status_code == 409
        error = response.json()["error"]
        assert (
            error["code"] == "version_conflict"
            and error["current"]["name"] == "Fresh"
            and error["current"]["version"] == 2
        )
    assert content_state(db) == before
    assert (
        call(
            client, "PUT", "/draft/subjects/s404", {"expectedVersion": 1, "fields": {}}
        ).status_code
        == 404
    )


def test_cascade_rules(db, editor):
    client, _, _ = editor
    refused = call(client, "DELETE", "/draft/subjects/s1", {"expectedVersion": 1})
    assert refused.status_code == 409
    assert refused.json()["error"]["children"] == {
        "questions": 1,
        "quizzes": 1,
        "cards": 1,
        "decks": 1,
        "topics": 1,
    }
    assert call(client, "DELETE", "/draft/quizzes/q1", {"expectedVersion": 1}).json()["error"][
        "children"
    ] == {"questions": 1}
    result = ok(
        call(client, "DELETE", "/draft/subjects/s1", {"expectedVersion": 1, "cascade": True})
    )
    assert {(d["kind"], d["id"]) for d in result["deleted"]} == {
        ("questions", "i1"),
        ("quizzes", "q1"),
        ("cards", "flegacy-X"),
        ("decks", "dlegacy-X"),
        ("topics", "t1"),
        ("subjects", "s1"),
    }
    assert (
        result["deleted"][-1] == {"kind": "subjects", "id": "s1"} and len(result["changeIds"]) == 6
    )
    snapshot = draft(client)
    assert all(
        snapshot[k] == [] for k in ("subjects", "topics", "quizzes", "questions", "decks", "cards")
    )
    assert (
        scalar(db.backup, "SELECT count(*) FROM content.draft_changes WHERE action='delete'") == 6
    )


def test_bulk_create_places_children_in_one_transaction(db, editor):
    client, _, _ = editor
    items = [{**QUESTION, "stem": f"Bulk {n}"} for n in range(3)]
    created = ok(
        call(
            client, "POST", "/draft/quizzes/q1/questions/bulk", {"afterId": None, "records": items}
        ),
        201,
    )
    new = [r["id"] for r in created["records"]]
    assert [r["stem"] for r in created["records"]] == ["Bulk 0", "Bulk 1", "Bulk 2"] and len(
        created["changeIds"]
    ) == 3
    assert ids(draft(client), "questions") == [*new, "i1"]
    cards = ok(
        call(
            client,
            "POST",
            "/draft/decks/dlegacy-X/cards/bulk",
            {"records": [{"front": "a", "back": "b"}] * 2},
        ),
        201,
    )
    assert ids(draft(client), "cards")[1:] == [r["id"] for r in cards["records"]]
    before = content_state(db)
    invalid = call(
        client,
        "POST",
        "/draft/quizzes/q1/questions/bulk",
        {"records": [QUESTION, {**QUESTION, "answer": "Z"}]},
    )
    assert invalid.status_code == 422
    assert (
        call(
            client, "POST", "/draft/quizzes/q1/questions/bulk", {"records": [QUESTION] * 1001}
        ).status_code
        == 400
    )
    assert (
        call(
            client, "POST", "/draft/subjects/s1/quizzes/bulk", {"records": [{"name": "x"}]}
        ).status_code
        == 404
    )
    assert (
        call(
            client, "POST", "/draft/quizzes/q404/questions/bulk", {"records": [QUESTION]}
        ).status_code
        == 404
    )
    assert content_state(db) == before


def test_revert_create_update_move_and_delete(db, editor):
    client, _, _ = editor
    created = ok(
        call(client, "POST", "/draft/questions", {"parentId": "q1", "fields": QUESTION}), 201
    )
    qid = created["record"]["id"]
    edited = ok(
        call(
            client,
            "PUT",
            "/draft/questions/i1",
            {"expectedVersion": 1, "fields": {"stem": "Changed", "pearls": None}},
        )
    )
    moved = ok(call(client, "POST", "/draft/questions/i1/move", {"expectedVersion": 2}))
    original = draft(client)
    reverted = ok(
        call(client, "POST", f"/draft/changes/{moved['changeId']}/revert", {"expectedVersion": 3})
    )
    assert reverted["record"]["version"] == 4
    assert ids(draft(client), "questions") == ["i1", qid]
    stale = call(
        client, "POST", f"/draft/changes/{edited['changeId']}/revert", {"expectedVersion": 3}
    )
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "version_conflict"
    restored = ok(
        call(client, "POST", f"/draft/changes/{edited['changeId']}/revert", {"expectedVersion": 4})
    )
    q, _ = banks()
    assert {k: v for k, v in restored["record"].items() if k != "version"} == q["questions"][0]
    assert list(restored["record"])[:-1] == list(q["questions"][0])
    undone = ok(
        call(client, "POST", f"/draft/changes/{created['changeId']}/revert", {"expectedVersion": 1})
    )
    assert undone["record"] is None and qid not in ids(draft(client), "questions")
    deleted = ok(call(client, "DELETE", "/draft/cards/flegacy-X", {"expectedVersion": 1}))
    back = ok(call(client, "POST", f"/draft/changes/{deleted['changeIds'][0]}/revert", {}))
    assert back["record"]["id"] == "flegacy-X" and back["record"]["version"] == 2
    again = call(client, "POST", f"/draft/changes/{deleted['changeIds'][0]}/revert", {})
    assert again.status_code == 409 and again.json()["error"]["code"] == "record_exists"
    assert draft(client)["changed"] is False
    assert original["changed"] is True
    actions = [c["action"] for c in ok(client.get("/api/admin/draft/changes"))["changes"]]
    assert actions == ["create", "update", "move", "move", "update", "delete", "delete", "create"]


def test_discard_resets_draft_to_active_release(db, editor):
    client, _runtime, h = editor
    ok(
        call(
            client,
            "PUT",
            "/draft/subjects/s1",
            {"expectedVersion": 1, "fields": {"name": "Unpublished"}},
        )
    )
    ok(
        call(client, "POST", "/draft/subjects", {"fields": {"name": "Extra", "accent": "#111111"}}),
        201,
    )
    h.now += 901
    assert call(client, "POST", "/draft/discard").json()["error"]["code"] == "fresh_auth_required"
    h.now -= 901
    snapshot = ok(call(client, "POST", "/draft/discard"))
    assert (
        ids(snapshot, "subjects") == ["s1"]
        and snapshot["subjects"][0]["name"] == banks()[0]["subjects"][0]["name"]
    )
    assert snapshot["subjects"][0]["version"] == 3  # never repeats a version an editor held
    assert (
        snapshot["changed"] is False
        and snapshot["publishedChangeId"] == snapshot["latestChangeId"] == 2
    )


def test_publish_activates_new_release_served_to_learners_and_unchanged_is_noop(db):
    seed(db)
    client, runtime, h = auth_app(db, postgres=True)
    with client:
        auth_login(client, runtime, h)
        before = client.get("/api/v1/quizzes/q1/questions").json()
        noop = ok(call(client, "POST", "/draft/publish"))
        assert noop["published"] is False
        ok(
            call(
                client,
                "PUT",
                "/draft/questions/i1",
                {
                    "expectedVersion": 1,
                    "fields": {
                        "stem": "Published stem",
                        "pearls": None,
                    },
                },
            )
        )
        card = ok(
            call(
                client,
                "POST",
                "/draft/cards",
                {"parentId": "dlegacy-X", "fields": {"front": "New front", "back": "New back"}},
            ),
            201,
        )
        assert client.get("/api/v1/quizzes/q1/questions").json() == before  # saving never publishes
        h.now += 901
        assert call(client, "POST", "/draft/publish").status_code == 403
        h.now -= 901
        published = ok(call(client, "POST", "/draft/publish"))
        assert published["published"] is True and published["publicationSequence"] == 2
        assert published["publishedChangeId"] == card["changeId"]
        assert (
            client.get("/api/v1/quizzes/q1/questions").json()["questions"][0]["stem"]
            == "Published stem"
        )
        cards = client.get("/api/v1/flashcards/decks/dlegacy-X/cards").json()["cards"]
        assert cards[-1]["id"] == card["record"]["id"]
        snapshot = draft(client)
        assert (
            snapshot["changed"] is False
            and snapshot["activeReleaseId"] == published["releaseId"] == snapshot["baseReleaseId"]
        )
        with db.backup.connect() as c:
            artifacts = c.execute(
                text(
                    "SELECT quiz_artifact,flashcard_artifact FROM content.releases WHERE release_id=:r"
                ),
                {"r": published["releaseId"]},
            ).one()
        with db.editor.connect() as c:
            assert build_documents(c) == tuple(artifacts)
        assert ok(call(client, "POST", "/draft/publish"))["published"] is False
        releases = ok(client.get("/api/admin/releases"))["releases"]
        assert releases[0]["releaseId"] == published["releaseId"] and releases[0]["active"]
        previous = releases[1]["releaseId"]
        activated = ok(
            call(
                client, "POST", f"/releases/{previous}/activate", {"expectedPublicationSequence": 2}
            )
        )
        assert activated["publicationSequence"] == 3
        assert client.get("/api/v1/quizzes/q1/questions").json() == before
        assert draft(client)["changed"] is True  # activation keeps the draft
        stale = call(
            client, "POST", f"/releases/{previous}/activate", {"expectedPublicationSequence": 2}
        )
        assert stale.status_code == 409


def test_cli_publish_draft_publishes_without_the_api(db):
    import os
    import subprocess
    import sys

    seed(db)
    with db.editor.begin() as connection:
        connection.execute(text("UPDATE content.draft_questions SET stem='CLI stem' WHERE id='i1'"))
    env = {k: v for k, v in os.environ.items() if not k.startswith("MEDUCATION_")}
    env.update(
        {
            "PYTHONPATH": str(ROOT / "backend/src"),
            "MEDUCATION_DATABASE_ENVIRONMENT": "local",
            "MEDUCATION_ADMIN_EDITOR_DATABASE_URL": db.editor.url.render_as_string(
                hide_password=False
            ),
        }
    )

    def publish():
        done = subprocess.run(
            [sys.executable, "-m", "meducation_api.db.cli", "publish-draft", "--actor", "maintainer:test"],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        assert done.returncode == 0, done.stderr
        return json.loads(done.stdout)

    published = publish()
    assert published["published"] is True and published["publicationSequence"] == 2
    with db.reader.connect() as connection:
        stem = connection.execute(
            text(
                "SELECT q.stem FROM content.published_questions q JOIN content.active_publication p "
                "USING(release_id) WHERE q.id='i1'"
            )
        ).scalar_one()
    assert stem == "CLI stem"
    assert scalar(db.operator, "SELECT base_release_id::text FROM content.draft_state") == published["releaseId"]
    assert publish()["published"] is False


def test_publish_runs_full_validation(db, editor):
    client, _, _ = editor
    ok(
        call(
            client, "POST", "/draft/quizzes", {"parentId": "t1", "fields": {"name": "Empty quiz"}}
        ),
        201,
    )
    before = content_state(db)
    rejected = call(client, "POST", "/draft/publish")
    assert rejected.status_code == 422 and rejected.json()["error"]["code"] == "invalid_content"
    assert content_state(db) == before


@pytest.mark.parametrize(
    ("path", "body", "code"),
    [
        (
            "/draft/questions",
            {"parentId": "q1", "fields": {**QUESTION, "stem": "<script>alert(1)</script>"}},
            "invalid_markup",
        ),
        (
            "/draft/questions",
            {"parentId": "q1", "fields": {**QUESTION, "answer": "C"}},
            "stored_contract",
        ),
        (
            "/draft/questions",
            {"parentId": "q1", "fields": {**QUESTION, "verifiedAnswer": "A"}},
            "unknown_field",
        ),
        (
            "/draft/questions",
            {"parentId": "q1", "fields": {**QUESTION, "quizId": "q2"}},
            "unknown_field",
        ),
        ("/draft/subjects", {"fields": {"name": " ", "accent": "#123456"}}, "stored_contract"),
        (
            "/draft/cards",
            {"parentId": "dlegacy-X", "fields": {"front": "x", "back": None}},
            "stored_contract",
        ),
    ],
)
def test_validation_rejection_leaves_no_change(db, editor, path, body, code):
    client, _, _ = editor
    before = content_state(db)
    response = call(client, "POST", path, body)
    assert response.status_code == 422, response.text
    assert code in {issue["code"] for issue in response.json()["error"]["issues"]}
    assert content_state(db) == before
    update = call(
        client,
        "PUT",
        "/draft/questions/i1",
        {"expectedVersion": 1, "fields": {"stem": "<img src=x onerror=alert(1)>"}},
    )
    assert update.status_code == 422
    assert update.json()["error"]["issues"][0]["path"].startswith("$.record")
    assert content_state(db) == before


def test_writes_require_csrf_and_origin(db, editor):
    client, runtime, _ = editor
    before = content_state(db)
    for method, path in (
        ("POST", "/draft/subjects"),
        ("PUT", "/draft/subjects/s1"),
        ("DELETE", "/draft/subjects/s1"),
        ("POST", "/draft/subjects/s1/move"),
        ("POST", "/draft/changes/1/revert"),
        ("POST", "/draft/discard"),
        ("POST", "/draft/publish"),
        ("POST", "/draft/quizzes/q1/questions/bulk"),
    ):
        no_csrf = client.request(
            method, "/api/admin" + path, json={}, headers={"Origin": runtime.config.origin}
        )
        assert no_csrf.status_code == 403 and no_csrf.json()["error"]["code"] == "csrf_invalid"
        csrf = client.get("/api/admin/session").json()["csrfToken"]
        no_origin = client.request(
            method, "/api/admin" + path, json={}, headers={"X-CSRF-Token": csrf}
        )
        assert no_origin.status_code == 403
    assert content_state(db) == before


def test_ids_are_never_reused_after_delete_or_restore(db, editor):
    client, _, _ = editor
    first = ok(
        call(client, "POST", "/draft/subjects", {"fields": {"name": "A", "accent": "#123456"}}), 201
    )["record"]
    ok(call(client, "DELETE", "/draft/subjects/" + first["id"], {"expectedVersion": 1}))
    second = ok(
        call(client, "POST", "/draft/subjects", {"fields": {"name": "B", "accent": "#123456"}}), 201
    )["record"]
    assert int(second["id"][1:]) > int(first["id"][1:])
    with db.migrator.begin() as connection:
        next_ids = advance_ids(connection, 100)
    assert next_ids["s"] == int(second["id"][1:]) + 101
    third = ok(
        call(client, "POST", "/draft/subjects", {"fields": {"name": "C", "accent": "#123456"}}), 201
    )["record"]
    assert third["id"] == "s" + str(next_ids["s"])
    for engine in (db.editor, db.reader, db.operator):
        with pytest.raises(SQLAlchemyError), engine.begin() as connection:
            advance_ids(connection, 1)


def test_reader_role_has_no_draft_access(db):
    seed(db)
    for table in ("draft_subjects", "draft_questions", "draft_changes", "draft_state"):
        with pytest.raises(SQLAlchemyError), db.reader.connect() as connection:
            connection.execute(text(f"SELECT * FROM content.{table}"))
    with pytest.raises(SQLAlchemyError), db.editor.begin() as connection:
        connection.execute(text("DELETE FROM content.draft_changes"))

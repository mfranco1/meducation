"""Real PG17: migration 0007 round trip and the per-record draft HTTP API."""

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
    publish,
    scalar,
    seed,
    store,
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


def at_revision(db, revision):
    with db.admin.begin() as connection:
        connection.exec_driver_sql("DROP SCHEMA admin_auth CASCADE")
        connection.exec_driver_sql("DROP SCHEMA content CASCADE")
    bootstrap(db.admin, RolePasswords(_env_file=None))
    with db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        config = migration_config()
        config.attributes["connection"] = connection
        command.upgrade(config, revision)


def legacy_draft(db, q_text, f_text, sequence):
    with db.operator.begin() as connection:
        connection.execute(
            text("SELECT content.save_draft(:op,:q,:f,0,:s,:actor,:reason,'{}')"),
            {
                "op": uuid4(),
                "q": q_text,
                "f": f_text,
                "s": sequence,
                "actor": ACTOR,
                "reason": REASON,
            },
        )


@pytest.mark.parametrize("name", list(fixture_pairs()))
def test_migration_0007_rebuilds_byte_identical_artifacts_and_revisions(db, name):
    q, f = fixture_pairs()[name]
    at_revision(db, "0006_allocation_fence")
    release = store(db, q=q, f=f)
    publication = publish(db, release)
    with db.operator.connect() as connection:
        artifacts = connection.execute(
            text(
                "SELECT quiz_artifact,flashcard_artifact,quiz_revision,flashcard_revision FROM content.releases WHERE release_id=:r"
            ),
            {"r": release.release_id},
        ).one()
    legacy_draft(db, artifacts[0], artifacts[1], publication.publication_sequence)
    upgrade(db.migrator)
    with db.editor.connect() as connection:
        built = build_documents(connection)
    assert built == (artifacts[0], artifacts[1])
    assert revisions(*built) == {"quizRevision": artifacts[2], "flashcardRevision": artifacts[3]}
    assert (
        scalar(db.backup, "SELECT base_release_id FROM content.draft_state") == release.release_id
    )
    assert scalar(db.backup, "SELECT count(*) FROM content.draft_changes") == 0
    # New numeric IDs start after every ID ever registered.
    top = scalar(
        db.backup, "SELECT max(substring(id FROM 2)::int) FROM content.entity_ids WHERE kind='i'"
    )
    with db.editor.begin() as connection:
        assert (
            connection.exec_driver_sql("SELECT nextval('content.draft_question_ids')").scalar_one()
            == top + 1
        )


def test_migration_0007_refuses_unpublished_draft_changes(db):
    at_revision(db, "0006_allocation_fence")
    release = store(db)
    publication = publish(db, release)
    q, f = banks()
    q["questions"][0]["stem"] = "Unpublished edit"
    from meducation_api.db.operations import paired_artifacts

    legacy_draft(
        db, *paired_artifacts(json.dumps(q), json.dumps(f)), publication.publication_sequence
    )
    with pytest.raises(ContentDatabaseError, match="unpublished"):
        upgrade(db.migrator)
    assert (
        scalar(db.reader, "SELECT version_num FROM content.schema_version")
        == "0006_allocation_fence"
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
        r["version"] == 1 for kind in ("subjects", "quizzes", "decks") for r in snapshot[kind]
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
    quiz = ok(
        call(client, "POST", "/draft/quizzes", {"parentId": sid, "fields": {"name": "Cardio"}}), 201
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
            {"parentId": sid, "fields": {"name": "Deck", "description": "D"}},
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
                "fields": {"verifiedAnswer": "A", "answerNote": "Checked", "stem": "Edited"},
            },
        )
    )
    record = updated["record"]
    assert record["version"] == 2 and record["stem"] == "Edited" and record["answer"] == "B"
    assert list(record) == [
        "id",
        "quizId",
        "stem",
        "choices",
        "answer",
        "verifiedAnswer",
        "answerNote",
        "rationale",
        "version",
    ]
    removed = ok(
        call(
            client,
            "PUT",
            "/draft/questions/" + question["id"],
            {"expectedVersion": 2, "fields": {"answerNote": None}},
        )
    )
    assert "answerNote" not in removed["record"] and removed["record"]["version"] == 3
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
        ("quizzes", quiz["id"], {"name": "Renamed"}),
        ("decks", deck["id"], {"description": None}),
        ("cards", card["id"], {"sources": "Src", "reviewNote": "R"}),
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
        ("subjects", sid, 2),
    ):
        result = ok(call(client, "DELETE", f"/draft/{kind}/{rid}", {"expectedVersion": version}))
        assert result["deleted"] == [{"kind": kind, "id": rid}]
    changes = ok(client.get("/api/admin/draft/changes"))["changes"]
    assert [c["action"] for c in changes] == ["create"] * 5 + ["update"] * 6 + ["delete"] * 5
    assert changes[5]["before"]["version"] == 1 and changes[5]["after"]["stem"] == "Edited"
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
            {"parentId": "s1", "afterId": None, "fields": {"name": "Earlier"}},
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
        ("subjects", "s1"),
    }
    assert (
        result["deleted"][-1] == {"kind": "subjects", "id": "s1"} and len(result["changeIds"]) == 5
    )
    snapshot = draft(client)
    assert all(snapshot[k] == [] for k in ("subjects", "quizzes", "questions", "decks", "cards"))
    assert (
        scalar(db.backup, "SELECT count(*) FROM content.draft_changes WHERE action='delete'") == 5
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
                        "choiceExplanations": None,
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


def test_publish_runs_full_validation(db, editor):
    client, _, _ = editor
    ok(
        call(
            client, "POST", "/draft/quizzes", {"parentId": "s1", "fields": {"name": "Empty quiz"}}
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
            {"parentId": "q1", "fields": {**QUESTION, "choiceExplanations": {"Z": "x"}}},
            "stored_contract",
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

"""Real PG17: learner routes, release caching and reader failures."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from support import (
    banks,
    publish,
    reader_settings,
    store,
)

pytestmark = pytest.mark.postgres


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/subjects",
        "/api/v1/subjects/s1/quizzes",
        "/api/v1/quizzes/q1",
        "/api/v1/quizzes/q1/questions",
        "/api/v1/flashcards/subjects",
        "/api/v1/flashcards/subjects/s1/catalog",
        "/api/v1/flashcards/decks/dlegacy-X/cards",
    ],
)
def test_postgres_learner_routes_match_protocol_and_release_connections(db, tmp_path, path):
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app

    q, f = banks()
    f["decks"].append({"id": "dempty", "topicId": "t1", "name": "Empty"})
    for key in ("subjects", "topics", "quizzes"):
        q[key][0]["description"] = "Short text"
    release = store(db, q=q, f=f)
    publish(db, release)
    from fixture_content import fixture_app
    reference_app = fixture_app(q, f)
    pg_app = create_app(reader_settings(db))
    with TestClient(reference_app) as expected, TestClient(pg_app) as actual:
        source = pg_app.state.source
        reference = expected.get(path)
        result = actual.get(path)
        assert result.status_code == reference.status_code == 200
        assert result.json() == reference.json()
        assert ("Short text" in result.text) == (not path.endswith(("questions", "cards")))
        assert result.headers["etag"] == reference.headers["etag"]
        assert result.headers["cache-control"] == "no-cache"
        assert source.runtime.engine.pool.checkedout() == 0
        assert actual.get(path, headers={"If-None-Match": result.headers["etag"]}).status_code == 304
        assert actual.get(path + "?revision=wrong").status_code == 409
        assert source.runtime.engine.pool.checkedout() == 0
        assert actual.get("/api/v1/flashcards/decks/dempty/cards").json()["cards"] == []
    assert source.runtime.engine.pool.checkedout() == source.runtime.engine.pool.checkedin() == 0
    assert pg_app.state.source is None


def test_publication_during_api_body_build_keeps_one_release(db, monkeypatch):
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app
    from meducation_api.repositories.postgres import PostgresQuestionBankRepository

    old = store(db)
    first = publish(db, old)
    q, f = banks()
    q["subjects"][0]["name"] = "Changed subject"
    q["questions"][0]["stem"] = "New stem"
    new = store(db, q=q, f=f)
    original = PostgresQuestionBankRepository.get_quiz
    switched = False

    def interleave(self, quiz_id):
        nonlocal switched
        found = original(self, quiz_id)
        if not switched:
            publish(db, new, expected=first.publication_sequence)
            switched = True
        return found

    monkeypatch.setattr(PostgresQuestionBankRepository, "get_quiz", interleave)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        body = client.get("/api/v1/quizzes/q1/questions").json()
        assert body["revision"] == old.quiz_revision
        assert body["questions"][0]["stem"] != "New stem"
        assert (
            client.get("/api/v1/quizzes/q1/questions").json()["questions"][0]["stem"] == "New stem"
        )
        assert client.get("/api/v1/subjects").json()["subjects"][0]["name"] == "Changed subject"
        assert (
            client.get("/api/v1/flashcards/subjects").json()["revision"] == new.flashcard_revision
        )
        assert new.flashcard_revision != old.flashcard_revision
        assert app.state.source.runtime.engine.pool.checkedout() == 0


def test_release_cache_bounded_eviction_and_reactivation_preserve_inflight_view(db):
    from meducation_api.repositories.postgres import PostgresContentSource

    old = store(db)
    pub = publish(db, old)
    with PostgresContentSource(reader_settings(db)) as source, source.view() as pinned:
        for name in ("Second", "Third", "Fourth"):
            q, f = banks()
            q["subjects"][0]["name"] = name
            f["cards"][0]["front"] = name
            release = store(db, q=q, f=f)
            pub = publish(db, release, expected=pub.publication_sequence)
            with source.view() as fresh:
                assert fresh.release_id == release.release_id
                assert fresh.flashcards.list_cards("dlegacy-X")[0].front == name
                changed = fresh.questions.list_subjects()
                changed[0].name = "mutated returned copy"
                assert fresh.questions.list_subjects()[0].name == name
            assert len(source._catalogs) <= 2
        assert pinned.release_id == old.release_id
        assert pinned.questions.revision == old.quiz_revision
        assert pinned.flashcards.list_cards("dlegacy-X")[0].front != "Fourth"
        rollback = publish(db, old, expected=pub.publication_sequence)
        with source.view() as refreshed:
            assert refreshed.release_id == old.release_id
            assert refreshed.publication_sequence == rollback.publication_sequence
            assert refreshed.questions.revision == old.quiz_revision
            assert refreshed.flashcards.revision == old.flashcard_revision
            assert refreshed.questions.list_subjects()[0].name != "Fourth"


@pytest.mark.parametrize(
    "fault", ["catalog", "body", "connect", "terminated", "aborted-transaction", "lock-timeout"]
)
def test_reader_failure_returns_safe_503_then_recovers(db, monkeypatch, fault):
    from contextlib import ExitStack

    from fastapi.testclient import TestClient
    from sqlalchemy import event
    from sqlalchemy.exc import OperationalError

    from meducation_api.main import create_app
    from meducation_api.repositories.postgres import PostgresQuestionBankRepository

    release = store(db)
    publish(db, release)
    path = "/api/v1/quizzes/q1/questions"
    app = create_app(reader_settings(db))
    with TestClient(app) as client, ExitStack() as faults:
        engine = app.state.source.runtime.engine
        if fault != "catalog":
            assert client.get(path).status_code == 200
        if fault == "connect":
            engine.dispose()

            def fail_connect(*args):
                raise OperationalError("private SQL", {}, Exception("private credential"))

            event.listen(engine, "do_connect", fail_connect)
            faults.callback(event.remove, engine, "do_connect", fail_connect)
        elif fault in ("catalog", "body"):
            table = "published_subjects" if fault == "catalog" else "published_questions"

            def fail_statement(connection, cursor, statement, params, context, many):
                if "SELECT * FROM content." + table in statement:
                    raise SQLAlchemyError("private SQL")

            event.listen(engine, "before_cursor_execute", fail_statement)
            faults.callback(event.remove, engine, "before_cursor_execute", fail_statement)
        elif fault == "lock-timeout":
            held = faults.enter_context(db.admin.begin())
            held.exec_driver_sql("LOCK TABLE content.questions IN ACCESS EXCLUSIVE MODE")
        else:
            original = PostgresQuestionBankRepository.list_questions
            fired = False

            def fail_once(self, quiz_id):
                nonlocal fired
                if not fired:
                    fired = True
                    if fault == "terminated":
                        pid = self.connection.exec_driver_sql("SELECT pg_backend_pid()").scalar_one()
                        with db.admin.begin() as connection:
                            connection.execute(text("SELECT pg_terminate_backend(:pid)"), {"pid": pid})
                    else:
                        self.connection.exec_driver_sql("SELECT 1/0")
                return original(self, quiz_id)

            monkeypatch.setattr(PostgresQuestionBankRepository, "list_questions", fail_once)
        result = client.get(path)
        assert result.status_code == 503
        assert result.json() == {"detail": {"code": "content_unavailable"}}
        assert "private" not in result.text
        assert engine.pool.checkedout() == 0
        faults.close()
        assert client.get(path).status_code == 200
        assert engine.pool.checkedout() == 0

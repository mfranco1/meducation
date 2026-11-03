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
        for headers in (
            {"If-None-Match": result.headers["etag"]},
            {"If-Match": '"wrong"'},
            {"If-Match": result.headers["etag"]},
        ):
            got, wanted = actual.get(path, headers=headers), expected.get(path, headers=headers)
            assert got.status_code == wanted.status_code
            assert got.content == wanted.content or got.json() == wanted.json()
            assert source.runtime.engine.pool.checkedout() == 0
        assert actual.get(path + "?revision=wrong").status_code == 409
        assert source.runtime.engine.pool.checkedout() == 0
        assert (
            actual.get(
                path, headers={"If-Match": "wrong", "If-None-Match": result.headers["etag"]}
            ).status_code
            == 409
        )
        for missing in (
            "/api/v1/subjects/unknown/quizzes",
            "/api/v1/quizzes/unknown",
            "/api/v1/quizzes/unknown/questions",
            "/api/v1/flashcards/subjects/unknown/catalog",
            "/api/v1/flashcards/decks/unknown/cards",
        ):
            got = actual.get(missing + "?revision=wrong")
            assert got.status_code == 404
            assert got.json() == expected.get(missing + "?revision=wrong").json()
            assert source.runtime.engine.pool.checkedout() == 0
        assert actual.get("/api/v1/flashcards/decks/dempty/cards").json()["cards"] == []
    assert source.runtime.engine.pool.checkedout() == source.runtime.engine.pool.checkedin() == 0
    assert pg_app.state.source is None


def test_postgres_repository_protocols_and_unknown_parents(db, tmp_path):
    from fixture_content import FixtureFlashcardRepository, FixtureQuestionRepository

    from meducation_api.repositories.postgres import PostgresContentSource

    q, f = banks()
    release = store(db)
    publish(db, release)
    reference = FixtureQuestionRepository(q)
    flashcards = FixtureFlashcardRepository(f, reference)
    with PostgresContentSource(reader_settings(db)) as source, source.view() as view:
        bank = view.questions
        cards = view.flashcards
        assert bank.revision == reference.revision and cards.revision == flashcards.revision
        assert bank.list_subjects() == reference.list_subjects()
        for subject in ("s1", "unknown"):
            assert bank.has_subject(subject) == reference.has_subject(subject)
            assert bank.subject_quiz_summary(subject) == reference.subject_quiz_summary(subject)
            assert bank.list_quizzes(subject) == reference.list_quizzes(subject)
            assert cards.has_subject(subject) == flashcards.has_subject(subject)
            assert cards.list_catalog(subject) == flashcards.list_catalog(subject)
        for quiz in ("q1", "unknown"):
            assert bank.get_quiz(quiz) == reference.get_quiz(quiz)
            assert bank.list_question_ids(quiz) == reference.list_question_ids(quiz)
            assert bank.list_questions(quiz) == reference.list_questions(quiz)
        assert cards.list_subjects() == flashcards.list_subjects()
        for deck in ("dlegacy-X", "unknown"):
            assert cards.has_deck(deck) == flashcards.has_deck(deck)
            assert cards.list_cards(deck) == flashcards.list_cards(deck)


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


def test_database_outage_returns_unavailable_even_on_cached_conditional_requests(db):
    from fastapi.testclient import TestClient
    from sqlalchemy import event

    from meducation_api.main import create_app

    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        response = client.get("/api/v1/subjects")
        etag = response.headers["etag"]
        engine = app.state.source.runtime.engine
        observed = []

        def fail_query(connection, cursor, statement, parameters, context, many):
            observed.append(statement)
            raise SQLAlchemyError("secret SQL and credential fixture")

        event.listen(engine, "before_cursor_execute", fail_query)
        try:
            assert client.get("/health/live").status_code == 200
            assert client.get("/health/ready").status_code == 200
            assert observed == []
            for path in (
                "/api/v1/subjects",
                "/api/v1/flashcards/subjects",
                "/api/v1/quizzes/q1/questions",
            ):
                result = client.get(path, headers={"If-None-Match": etag})
                assert result.status_code == 503
                assert result.json() == {"detail": {"code": "content_unavailable"}}
                assert "secret" not in result.text and engine.pool.checkedout() == 0
        finally:
            event.remove(engine, "before_cursor_execute", fail_query)
        assert client.get("/api/v1/subjects", headers={"If-None-Match": etag}).status_code == 304


@pytest.mark.parametrize("failure", ["catalog", "body", "connect"])
def test_reader_failure_cleanup_before_and_after_view_yield(db, failure):
    from fastapi.testclient import TestClient
    from sqlalchemy import event
    from sqlalchemy.exc import OperationalError

    from meducation_api.main import create_app

    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        engine = app.state.source.runtime.engine
        if failure != "catalog":
            assert client.get("/api/v1/quizzes/q1/questions").status_code == 200
        if failure == "connect":
            engine.dispose()

            def fail_connect(*args):
                raise OperationalError(
                    "private connection SQL", {}, Exception("private credential")
                )

            listener, event_name = fail_connect, "do_connect"
        else:

            def fail_statement(connection, cursor, statement, params, context, many):
                target = "published_subjects" if failure == "catalog" else "published_questions"
                if "SELECT * FROM content." + target in statement:
                    raise SQLAlchemyError("private body/catalog SQL")

            listener, event_name = fail_statement, "before_cursor_execute"
        event.listen(engine, event_name, listener)
        try:
            result = client.get("/api/v1/quizzes/q1/questions")
            assert result.status_code == 503 and result.json() == {
                "detail": {"code": "content_unavailable"}
            }
            assert "private" not in result.text and engine.pool.checkedout() == 0
        finally:
            event.remove(engine, event_name, listener)
        assert client.get("/api/v1/quizzes/q1/questions").status_code == 200
        assert engine.pool.checkedout() == 0


@pytest.mark.parametrize("fault", ["terminated", "aborted-transaction"])
def test_real_reader_socket_and_transaction_failure_return_503_then_recover(db, monkeypatch, fault):
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app
    from meducation_api.repositories.postgres import PostgresQuestionBankRepository

    release = store(db)
    publish(db, release)
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
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        result = client.get("/api/v1/quizzes/q1/questions")
        assert result.status_code == 503 and result.json() == {
            "detail": {"code": "content_unavailable"}
        }
        assert app.state.source.runtime.engine.pool.checkedout() == 0
        assert client.get("/api/v1/quizzes/q1/questions").status_code == 200
        assert app.state.source.runtime.engine.pool.checkedout() == 0

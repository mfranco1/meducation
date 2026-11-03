"""Real PG17: pool repair, outages, diagnostics and SQL-free health checks."""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import text
from support import (
    ROOT,
    auth_app,
    auth_login,
    banks,
    editor_post,
    publish,
    reader_settings,
    seed,
    store,
)

from meducation_api.db.engine import create_database_engine

pytestmark = pytest.mark.postgres


@pytest.mark.parametrize('role', ['reader', 'session', 'editor'])
def test_stale_idle_pool_connection_is_repaired_before_work(db, role):
    from sqlalchemy import event
    engine = create_database_engine(getattr(db, role).url)
    opened = []
    event.listen(engine, 'connect', lambda *_: opened.append(True))
    try:
        with engine.connect() as connection:
            old = connection.exec_driver_sql('SELECT pg_backend_pid()').scalar_one()
        with db.admin.begin() as connection:
            assert connection.execute(text('SELECT pg_terminate_backend(:pid)'), {'pid': old}).scalar_one()
        with engine.connect() as connection:
            assert connection.exec_driver_sql('SELECT 1').scalar_one() == 1
        assert len(opened) == 2
        assert engine.pool.checkedout() == 0
    finally:
        engine.dispose()


def test_reader_lock_timeout_returns_safe_error_and_leaves_pool_clean(db, caplog):
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app
    from meducation_api.repositories.postgres import PostgresQuestionBankRepository
    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        assert client.get('/api/v1/quizzes/q1/questions').status_code == 200
        engine = app.state.source.runtime.engine
        with app.state.source.view() as view:
            assert isinstance(view.questions, PostgresQuestionBankRepository)
            c = view.questions.connection
            assert c.exec_driver_sql('SHOW statement_timeout').scalar_one() == '10s'
            assert c.exec_driver_sql('SHOW lock_timeout').scalar_one() == '3s'
        with db.admin.begin() as held:
            held.exec_driver_sql('LOCK TABLE content.questions IN ACCESS EXCLUSIVE MODE')
            result = client.get('/api/v1/quizzes/q1/questions')
            assert result.status_code == 503
            assert result.json() == {'detail': {'code': 'content_unavailable'}}
            assert operation_events(caplog)[-1]['failure_category'] == 'sql_timeout'
            assert engine.pool.checkedout() == 0
        assert client.get('/api/v1/quizzes/q1/questions').status_code == 200
        assert 'reader' in operation_events(caplog)[-1]['recovered_dependencies']
        assert engine.pool.checkedout() == 0


def test_database_stop_start_keeps_health_query_free_and_recovers_reader(db):
    import subprocess
    import sys

    from fastapi.testclient import TestClient
    from sqlalchemy import event

    from meducation_api.main import create_app
    container = os.environ.get('MEDUCATION_TEST_RESTART_CONTAINER')
    if not container:
        pytest.skip('Run the isolated launcher with --restartable --keyword resilience')
    def control(action):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/containers/control-resilience-fixture.py'),
                                 '--container', container, '--port', str(db.admin.url.port),
                                 '--action', action], capture_output=True, text=True, timeout=60, check=False)
        assert result.returncode == 0, 'Owned fixture control failed'
    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        first = client.get('/api/v1/quizzes/q1/questions')
        assert first.status_code == 200
        engine = app.state.source.runtime.engine
        checkouts = []
        event.listen(engine, 'checkout', lambda *_: checkouts.append(True))
        try:
            control('stop')
            assert client.get('/health/live').status_code == 200
            assert client.get('/health/ready').status_code == 200
            assert checkouts == []
            unavailable = client.get('/api/v1/quizzes/q1/questions')
            assert unavailable.status_code == 503
            assert unavailable.json() == {'detail': {'code': 'content_unavailable'}}
            assert engine.pool.checkedout() == 0
        finally:
            control('start')
        recovered = client.get('/api/v1/quizzes/q1/questions')
        assert recovered.status_code == 200
        assert recovered.json() == first.json()
        assert recovered.headers['etag'] == first.headers['etag']
        assert engine.pool.checkedout() == 0


def test_independent_sources_observe_other_bank_publication_and_a_b_a(db):
    from meducation_api.repositories.postgres import PostgresContentSource

    old = store(db)
    first = publish(db, old)
    q, f = banks()
    f['cards'][0]['front'] = 'L5 only flashcards changed'
    changed = store(db, q=q, f=f)
    assert changed.quiz_revision == old.quiz_revision
    assert changed.flashcard_revision != old.flashcard_revision
    with (PostgresContentSource(reader_settings(db)) as one,
          PostgresContentSource(reader_settings(db)) as two):
        for source in (one, two):
            with source.view() as view:
                assert view.release_id == old.release_id
        second = publish(db, changed, expected=first.publication_sequence)
        for source in (one, two):
            with source.view() as view:
                assert view.release_id == changed.release_id
                assert view.publication_sequence == second.publication_sequence
                assert view.questions.revision == old.quiz_revision
                assert view.flashcards.list_cards('dlegacy-X')[0].front == 'L5 only flashcards changed'
        third = publish(db, old, expected=second.publication_sequence)
        for source in (one, two):
            with source.view() as view:
                assert view.release_id == old.release_id
                assert view.publication_sequence == third.publication_sequence
                assert view.flashcards.revision == old.flashcard_revision
            assert source.runtime.engine.pool.checkedout() == 0


@pytest.mark.parametrize('bank', ['quiz', 'flashcard'])
def test_launch_http_sql_counts_include_pre_ping_and_sql_free_health(db, monkeypatch, bank):
    from fastapi.testclient import TestClient
    from sqlalchemy import event

    from meducation_api.main import create_app

    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        engine = app.state.source.runtime.engine
        counts = {'sql': 0, 'pointer': 0, 'ping': 0}

        def statement(_connection, _cursor, sql, *_args):
            counts['sql'] += 1
            counts['pointer'] += int('FROM content.active_publication' in sql)

        ping = engine.dialect.do_ping

        def counted_ping(connection):
            counts['ping'] += 1
            return ping(connection)

        event.listen(engine, 'before_cursor_execute', statement)
        monkeypatch.setattr(engine.dialect, 'do_ping', counted_ping)
        app.state.source._catalogs.clear()
        if bank == 'quiz':
            subjects = '/api/v1/subjects'
            membership = '/api/v1/subjects/s1/quizzes'
            body = '/api/v1/quizzes/q1/questions'
            revision = release.quiz_revision
        else:
            subjects = '/api/v1/flashcards/subjects'
            membership = '/api/v1/flashcards/subjects/s1/catalog'
            body = '/api/v1/flashcards/decks/dlegacy-X/cards'
            revision = release.flashcard_revision
        # Startup catalog, selected membership, launch check, uncached body.
        for path in (subjects, membership + '?revision=' + revision, subjects,
                     body + '?revision=' + revision):
            assert client.get(path).status_code == 200
        assert counts == {'sql': 19 if bank == 'quiz' else 20, 'pointer': 4, 'ping': 4}
        counts.update(sql=0, pointer=0, ping=0)
        # A fully cached browser launch sends only the fresh subjects check.
        assert client.get(subjects).status_code == 200
        assert counts == {'sql': 3, 'pointer': 1, 'ping': 1}
        counts.update(sql=0, pointer=0, ping=0)
        assert client.get('/health/live').status_code == 200
        assert client.get('/health/ready').status_code == 200
        assert counts == {'sql': 0, 'pointer': 0, 'ping': 0}
        assert engine.pool.checkedout() == 0


def pooled_session_engine(runtime, db):
    # auth_app normally uses an unpooled test role. Exercise the real worker pool.
    engine = create_database_engine(db.session.url)
    runtime.store.engine = engine
    return engine


def operation_events(caplog):
    return [json.loads(r.getMessage()) for r in caplog.records if r.name == 'meducation.operations']


def test_diagnostics_guard_readonly_concurrency_and_pool_cleanup(db):
    from sqlalchemy import event

    seed(db)
    client, runtime, h = auth_app(db, postgres=True)
    session_engine = pooled_session_engine(runtime, db)
    try:
        with client:
            assert client.post('/api/admin/diagnostics', json={}, headers={'Origin': runtime.config.origin}).status_code == 401
            auth_login(client, runtime, h)
            csrf = client.get('/api/admin/session').json()['csrfToken']
            for headers in ({'Origin': 'http://elsewhere.invalid', 'X-CSRF-Token': csrf}, {'Origin': runtime.config.origin, 'X-CSRF-Token': 'wrong'}):
                denied = client.post('/api/admin/diagnostics', json={}, headers=headers)
                assert denied.status_code == 403
                assert denied.headers['cache-control'] == 'no-store'
                assert 'dependencies' not in denied.json()
            assert editor_post(client, '/diagnostics', {'extra': 'secret authored body'}).status_code == 400
            engines = [session_engine, client.app.state.source.runtime.engine, client.app.state.editor_engine]
            sql, session_checkouts = [], []
            for engine in engines:
                event.listen(engine, 'before_cursor_execute', lambda _c, _cur, statement, *_: sql.append(statement))
            event.listen(session_engine, 'checkout', lambda *_: session_checkouts.append(True))
            barrier = Barrier(2)
            def synchronize(*_):
                barrier.wait(timeout=10)
            event.listen(engines[2], 'checkout', synchronize)
            def run(_):
                return client.post('/api/admin/diagnostics', json={}, headers={'Origin': runtime.config.origin, 'X-CSRF-Token': csrf})
            try:
                with ThreadPoolExecutor(max_workers=2) as executor:
                    responses = list(executor.map(run, range(2)))
            finally:
                event.remove(engines[2], 'checkout', synchronize)
            assert all(r.status_code == 200 for r in responses)
            assert responses[0].json() == {'dependencies': {'reader': {'connectivity': 'ok', 'schema': 'ok', 'publication': 'ok'}, 'session': 'ok', 'editor': 'ok'}}
            assert len(session_checkouts) == 2  # no activity write or nested checkout
            assert all(statement.lstrip().split()[0].upper() in {'SET', 'SELECT', 'SHOW'} for statement in sql)
            assert all(engine.pool.checkedout() == 0 for engine in engines)
            assert all(engine.pool.size() == 2 for engine in engines)
    finally:
        session_engine.dispose()


@pytest.mark.parametrize('role', ['reader', 'session', 'editor'])
@pytest.mark.parametrize('fault', ['pool_timeout', 'connection_failure'])
def test_diagnostic_dependency_failure_events_redaction_and_recovery(db, caplog, role, fault):
    from sqlalchemy import event
    from sqlalchemy.exc import OperationalError

    seed(db)
    client, runtime, h = auth_app(db, postgres=True)
    session_engine = pooled_session_engine(runtime, db)
    canary = 'L5-private-password-cookie-code-authored-text'
    try:
        with client:
            auth_login(client, runtime, h)
            csrf = client.get('/api/admin/session').json()['csrfToken']
            engine = {'reader': client.app.state.source.runtime.engine, 'session': session_engine, 'editor': client.app.state.editor_engine}[role]
            def fail(*_):
                raise OperationalError(canary, {'token': canary}, RuntimeError(canary), connection_invalidated=True)
            held = []
            try:
                if fault == 'pool_timeout':
                    engine.pool._timeout = 0.05
                    held = [engine.connect(), engine.connect()]
                else:
                    event.listen(engine, 'checkout', fail)
                response = client.post('/api/admin/diagnostics?code='+canary, json={}, headers={'Origin': runtime.config.origin, 'X-CSRF-Token': csrf, 'X-Request-ID': canary})
                assert response.status_code == 503
                if role == 'session':
                    assert response.json()['error']['code'] == 'session_unavailable'
                    assert 'dependencies' not in response.json()
                else:
                    outcome = response.json()['dependencies'][role]
                    assert outcome == 'unavailable' if role == 'editor' else outcome['connectivity'] == 'unavailable'
                event_record = operation_events(caplog)[-1]
                assert event_record['request_id'] == response.headers['x-request-id']
                assert event_record['dependencies'][role] == fault
                assert event_record['failure_category'] == fault
                assert canary not in json.dumps(operation_events(caplog)) + response.text
                if role in ('reader', 'editor'):
                    path = '/api/v1/subjects' if role == 'reader' else '/api/admin/draft'
                    ordinary = client.get(path)
                    assert ordinary.status_code == 503
                    assert operation_events(caplog)[-1]['dependencies'][role] == fault
                    assert canary not in json.dumps(operation_events(caplog)) + ordinary.text
            finally:
                for connection in held:
                    connection.close()
                if fault == 'connection_failure':
                    event.remove(engine, 'checkout', fail)
            assert client.post('/api/admin/diagnostics', json={}, headers={'Origin': runtime.config.origin, 'X-CSRF-Token': csrf}).status_code == 200
            assert role in operation_events(caplog)[-1]['recovered_dependencies']
            assert engine.pool.checkedout() == 0
    finally:
        session_engine.dispose()


def test_diagnostics_reject_schema_and_missing_publication_without_mutating(db, monkeypatch):
    from meducation_api.admin import diagnostics

    release = store(db)
    # Boot initialized with a release; then change fixture state only.
    publish(db, release)
    client, runtime, h = auth_app(db, postgres=True)
    with client:
        auth_login(client, runtime, h)
        with monkeypatch.context() as patch:
            patch.setattr(diagnostics, 'migration_head', lambda: 'unsupported-test-head')
            result = editor_post(client, '/diagnostics', {})
            assert result.status_code == 503
            assert result.json()['dependencies']['reader'] == {'connectivity': 'ok', 'schema': 'unsupported', 'publication': 'not_checked'}
        with db.admin.begin() as c:
            c.exec_driver_sql('UPDATE content.active_publication SET release_id=NULL, publication_sequence=0')
        result = editor_post(client, '/diagnostics', {})
        assert result.status_code == 503
        assert result.json()['dependencies']['reader']['publication'] == 'missing'
        for path in ('/health/live', '/health/ready'):
            assert client.get(path).status_code == 200


def test_diagnostics_actual_db_outage_keeps_auth_closed_health_sql_free_and_recovers(db, caplog):
    import subprocess
    import sys

    from sqlalchemy import event

    container = os.environ.get('MEDUCATION_TEST_RESTART_CONTAINER')
    if not container:
        pytest.skip('Dedicated --restartable --keyword resilience gate')
    seed(db)
    client, runtime, h = auth_app(db, postgres=True)
    session_engine = pooled_session_engine(runtime, db)
    def control(action):
        result = subprocess.run([sys.executable, str(ROOT/'scripts/containers/control-resilience-fixture.py'), '--container', container, '--port', str(db.admin.url.port), '--action', action], capture_output=True, timeout=60, check=False)
        assert result.returncode == 0, 'Owned fixture control failed'
    try:
        with client:
            auth_login(client, runtime, h)
            csrf = client.get('/api/admin/session').json()['csrfToken']
            headers = {'Origin': runtime.config.origin, 'X-CSRF-Token': csrf}
            assert client.post('/api/admin/diagnostics', json={}, headers=headers).status_code == 200
            engines = [session_engine, client.app.state.source.runtime.engine, client.app.state.editor_engine]
            work = []
            for engine in engines:
                event.listen(engine, 'checkout', lambda *_: work.append(True))
            try:
                control('stop')
                assert client.get('/health/live').status_code == 200
                assert client.get('/health/ready').status_code == 200
                assert not work
                failed = client.post('/api/admin/diagnostics', json={}, headers=headers)
                assert failed.status_code == 503
                assert failed.json()['error']['code'] == 'session_unavailable'
                assert operation_events(caplog)[-1]['dependencies']['session'] == 'connection_failure'
                assert all(engine.pool.checkedout() == 0 for engine in engines)
            finally:
                control('start')
            assert client.post('/api/admin/diagnostics', json={}, headers=headers).status_code == 200
            assert 'session' in operation_events(caplog)[-1]['recovered_dependencies']
            assert all(engine.pool.checkedout() == 0 for engine in engines)
    finally:
        session_engine.dispose()


def test_retained_restore_requires_source_writer_retirement(db, monkeypatch):
    import importlib.util

    monkeypatch.syspath_prepend(str(ROOT / "scripts/local-authoring"))
    spec = importlib.util.spec_from_file_location(
        "retained_restore_guard", ROOT / "scripts/local-authoring/verify-backup.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    require_retired = module.require_retired_writers
    writers = ("meducation_operator", "meducation_editor", "meducation_session",
               "meducation_migrator", "meducation_owner")
    with db.admin.connect() as connection:
        database = connection.dialect.identifier_preparer.quote(connection.engine.url.database)
        original = {role: connection.execute(
            text("SELECT has_database_privilege(:role,current_database(),'CONNECT')"),
            {"role": role}).scalar_one() for role in writers}
    def grant(role, enable):
        with db.admin.begin() as connection:
            connection.exec_driver_sql(
                ("GRANT CONNECT ON DATABASE " + database + " TO " if enable
                 else "REVOKE CONNECT ON DATABASE " + database + " FROM ") + role)
    with pytest.raises(RuntimeError, match="Retire source writer"):
        require_retired(db.admin)
    try:
        # Revoking CONNECT alone does not retire an already open source writer.
        with db.operator.connect():
            for role in writers:
                grant(role, False)
            with pytest.raises(RuntimeError, match="Retire source writer"):
                require_retired(db.admin)
        require_retired(db.admin)
        # Every writer role, including inherited owner access, must stay retired.
        for role in writers:
            grant(role, True)
            with pytest.raises(RuntimeError, match="Retire source writer"):
                require_retired(db.admin)
            grant(role, False)
        # The source can still be backed up and read; neither role can author.
        with db.backup.connect(), db.reader.connect():
            require_retired(db.admin)
    finally:
        for role, enabled in original.items():
            grant(role, enabled)

    # One source may admit only one writable verification clone at a time.
    with module.source_rehearsal_lock(db.admin), pytest.raises(
        RuntimeError, match="Another retained-backup rehearsal"
    ), module.source_rehearsal_lock(db.admin):
        pass
    with module.source_rehearsal_lock(db.admin):
        pass  # The admission lock is released after normal completion.
    with pytest.raises(RuntimeError, match="fixture interruption"), module.source_rehearsal_lock(db.admin):
        raise RuntimeError("fixture interruption")
    with module.source_rehearsal_lock(db.admin):
        pass  # Interruption also releases admission.

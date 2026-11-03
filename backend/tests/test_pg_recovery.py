"""Real PG17: restore recovery, ACL reapplication and export checks."""

import json

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from support import (
    ROOT,
    auth_app,
    auth_login,
    content_state,
    editor_post,
    owner_execute,
    scalar,
    seed,
)

pytestmark = pytest.mark.postgres


def test_recovery_invalidates_restored_sessions_and_pending_callbacks_without_content_loss(db):
    from meducation_api.db.recovery import invalidate_restored_sessions

    seed(db)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        pending = runtime.store.begin_login('recovery-browser')
        before = content_state(db)
        with db.migrator.begin() as connection:
            result = invalidate_restored_sessions(connection)
        assert result == {'revokedSessions': 1, 'clearedLoginTransactions': 1}
        assert client.get('/api/admin/draft').status_code == 401
        from meducation_api.auth.oidc import AuthError
        with pytest.raises(AuthError):
            runtime.store.consume(pending['state'], 'recovery-browser')
        assert content_state(db) == before
        with db.migrator.begin() as connection:
            assert invalidate_restored_sessions(connection) == {
                'revokedSessions': 0, 'clearedLoginTransactions': 0,
            }
        for engine in (db.editor, db.session, db.operator, db.reader):
            with pytest.raises(SQLAlchemyError), engine.begin() as connection:
                invalidate_restored_sessions(connection)


def test_recovery_reapplied_acl_preserves_editor_and_session_role_boundaries(db):
    from meducation_api.db.recovery import restore_content_permissions

    seed(db)
    owner_execute(db, 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA content FROM meducation_editor')
    owner_execute(db, 'REVOKE ALL ON ALL TABLES IN SCHEMA content FROM meducation_editor')
    owner_execute(db, 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA content FROM meducation_editor')
    owner_execute(db, 'REVOKE ALL ON ALL TABLES IN SCHEMA admin_auth FROM meducation_session')
    with db.migrator.begin() as connection:
        restore_content_permissions(connection)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        assert client.get('/api/admin/draft').status_code == 200
    for engine in (db.editor, db.reader, db.operator):
        with pytest.raises(SQLAlchemyError), engine.connect() as connection:
            connection.execute(text('SELECT * FROM admin_auth.sessions'))
    for engine in (db.editor, db.session, db.backup, db.reader):
        with pytest.raises(SQLAlchemyError), engine.begin() as connection:
            connection.execute(text("UPDATE content.draft_changes SET actor='bypass'"))
    assert scalar(db.backup, 'SELECT count(*) FROM admin_auth.sessions') == 1


@pytest.mark.parametrize('target', ['draft', 'release'])
def test_recovery_tools_check_real_deterministic_http_exports(db, tmp_path, target):
    import io
    import zipfile

    from meducation_api.content.transfer import inspect_export

    original = seed(db)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        snapshot = client.get('/api/admin/draft').json()
        value = {'target': target}
        if target == 'release':
            value['releaseId'] = str(original.release_id)
        response = editor_post(client, '/exports', value)
        assert response.status_code == 200
        assert response.content == editor_post(client, '/exports', value).content
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            archive.extractall(tmp_path)
        report = inspect_export(tmp_path, repository=ROOT, audit=True)
        assert report['context']['target'] == target
        assert report['context']['unpublished'] is (target == 'draft')
        assert report['explanations']['questions'] == len(snapshot['questions'])
        serialized = json.dumps(report)
        assert runtime.config.epoch not in serialized
        assert runtime.config.client_secret.get_secret_value() not in serialized

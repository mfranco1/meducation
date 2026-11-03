"""Shared test helpers: repository paths, fixture banks and real-PG17 helpers (the `db` fixture is in conftest.py)."""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from sqlalchemy import Engine, text

from meducation_api.content.draft import reset_draft
from meducation_api.content.releases import activate_release, paired_artifacts, store_release
from meducation_api.db.recovery import advance_ids

ROOT = Path(__file__).resolve().parents[2]
ACTOR = "local-test-operator"
REASON = "Disposable content integration fixture"


@dataclass
class Database:
    admin: Engine
    migrator: Engine
    operator: Engine
    reader: Engine
    backup: Engine
    session: Engine
    editor: Engine


def base_pair():
    """The contract base quiz bank with an empty flashcard bank."""
    q = json.loads((ROOT / "tests/fixtures/bank-contract-cases.json").read_text())["base"]
    return q, {"schemaVersion": 4, "decks": [], "cards": []}


def banks():
    q, _ = base_pair()
    f = {
        "schemaVersion": 4,
        "decks": [
            {
                "id": "dlegacy-X",
                "topicId": q["topics"][0]["id"],
                "name": "Deck β",
                "description": "",
            }
        ],
        "cards": [
            {
                "id": "flegacy-X",
                "deckId": "dlegacy-X",
                "front": "**Front** $x^2$\n",
                "back": "Back β",
                "sources": "",
            }
        ],
    }
    q["questions"][0].update(
        {
            "metadata": {"topic": "β", "tags": []},
            "pearls": [],
        }
    )
    return q, f


def artifacts(q=None, f=None):
    base_q, base_f = banks()
    return paired_artifacts(
        json.dumps(base_q if q is None else q, ensure_ascii=False),
        json.dumps(base_f if f is None else f, ensure_ascii=False),
    )


def store(db, op=None, q=None, f=None):
    qt, ft = artifacts(q, f)
    with db.operator.begin() as connection:
        return store_release(
            connection,
            operation_id=op or uuid4(),
            quiz_text=qt,
            flashcard_text=ft,
            source_hashes={
                "quiz": hashlib.sha256(qt.encode()).hexdigest(),
                "flashcard": hashlib.sha256(ft.encode()).hexdigest(),
            },
            actor=ACTOR,
            reason=REASON,
        )


def publish(db, release, expected=0, op=None):
    with db.operator.begin() as connection:
        return activate_release(
            connection,
            operation_id=op or uuid4(),
            release_id=release.release_id,
            expected_sequence=expected,
            actor=ACTOR,
            reason=REASON,
        )


def seed(db, q=None, f=None):
    """Store and activate a release, load it into the draft and move the ID sequences past it."""
    release = store(db, q=q, f=f)
    sequence = scalar(db.reader, "SELECT publication_sequence FROM content.active_publication")
    publish(db, release, expected=sequence)
    with db.editor.begin() as connection:
        reset_draft(connection, release.release_id)
    with db.migrator.begin() as connection:
        advance_ids(connection, 0)
    return release


STATE_TABLES = (
    "active_publication", "releases", "operations", "audit_events", "publication_events",
    "draft_subjects", "draft_topics", "draft_quizzes", "draft_questions",
    "draft_decks", "draft_flashcards", "draft_changes", "draft_state",
)


def content_state(db):
    return {
        table: scalar(
            db.backup,
            f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM content.{table} t",
        )
        for table in STATE_TABLES
    }


def scalar(engine, statement, parameters=None):
    with engine.connect() as connection:
        return connection.execute(text(statement), parameters or {}).scalar_one()


def owner_execute(db, statement, parameters=None):
    with db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.execute(text(statement), parameters or {})


def reader_settings(db):
    from meducation_api.settings import Settings

    return Settings(
        _env_file=None,
        content_source="postgres",
        database_environment="local",
        database_url=db.reader.url.render_as_string(hide_password=False),
    )


def auth_app(db, harness=None, *, postgres=False, **changes):
    from types import SimpleNamespace

    from fastapi.testclient import TestClient
    from test_auth import Harness, config

    from meducation_api.auth.store import SessionStore
    from meducation_api.main import create_app
    from meducation_api.settings import Settings

    cfg = config(
        session_database_url=db.session.url.render_as_string(hide_password=False),
        editor_database_url=db.editor.url.render_as_string(hide_password=False),
        **changes,
    )
    h = harness or Harness(cfg)
    runtime = SimpleNamespace(
        config=cfg,
        store=SessionStore(db.session, cfg, clock=lambda: h.now),
        oidc=h.client,
        close=lambda: None,
    )
    settings = Settings(
        _env_file=None,
        database_environment="local",
        content_source="postgres",
        database_url=db.reader.url.render_as_string(hide_password=False),
    )
    from fixture_content import FixtureContentSource
    app = create_app(settings, auth_settings=cfg, auth_factory=lambda _: runtime, source_factory=None if postgres else lambda _: FixtureContentSource(json.loads((ROOT / "tests/fixtures/e2e-bank.json").read_text()), json.loads((ROOT / "tests/fixtures/e2e-flashcard-bank.json").read_text())))
    return TestClient(app, base_url=cfg.origin, follow_redirects=False), runtime, h


def auth_login(client, runtime, h, *, stepup=False):
    from urllib.parse import parse_qs, urlsplit

    csrf = client.get("/api/admin/session").json()["csrfToken"]
    path = "/api/admin/auth/reauthenticate" if stepup else "/api/admin/auth/login"
    response = client.post(
        path, json={}, headers={"Origin": runtime.config.origin, "X-CSRF-Token": csrf}
    )
    assert response.status_code == 200, response.text
    fields = parse_qs(urlsplit(response.json()["authorizationUrl"]).query)
    h.nonce = fields["nonce"][0]
    h.code = "disposable-single-use-code"
    row = scalar(
        runtime.store.engine,
        "SELECT ciphertext FROM admin_auth.logins WHERE NOT consumed ORDER BY expires DESC LIMIT 1",
    )
    h.verifier = json.loads(runtime.store.cipher.decrypt(row.encode()))["verifier"]
    return client.get(
        "/api/admin/auth/callback", params={"state": fields["state"][0], "code": h.code}
    ), fields


def editor_post(client,path,value):
    csrf=client.get('/api/admin/session').json()['csrfToken']
    return client.post('/api/admin'+path,json=value,headers={'Origin':str(client.base_url).rstrip('/'),'X-CSRF-Token':csrf})


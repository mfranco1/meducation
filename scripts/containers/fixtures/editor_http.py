"""Disposable browser fixture only. Never packaged or enabled by the real application."""

import base64
import hashlib
import json
import logging
import os
import secrets
import time
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs
from uuid import uuid4

import httpx2
import uvicorn
from cryptography.fernet import Fernet
from fastapi import Request
from fastapi.responses import RedirectResponse
from joserfc import jwt
from joserfc.jwk import RSAKey
from meducation_api.auth.config import AuthSettings
from meducation_api.auth.oidc import OIDCClient
from meducation_api.auth.store import SessionStore
from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.migrate import upgrade
from meducation_api.db.operations import activate_release, save_draft, store_release
from meducation_api.main import create_app
from meducation_api.settings import Settings
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

origin_path = Path("/fixture/origin.txt")
for _ in range(300):
    if origin_path.exists() and origin_path.read_text().strip():
        break
    time.sleep(0.1)
origin = origin_path.read_text().strip()
url = make_url(os.environ["FIXTURE_DATABASE_URL"])
engines = {}
for role in ["bootstrap", "migrator", "operator", "reader", "session", "editor"]:
    credential = (
        url
        if role == "bootstrap"
        else url.set(
            username="meducation_" + role,
            password=os.environ["MEDUCATION_POSTGRES_" + role.upper() + "_PASSWORD"],
        )
    )
    engines[role] = create_engine(credential, hide_parameters=True)
bootstrap(engines["bootstrap"], RolePasswords(_env_file=None))
upgrade(engines["migrator"])
pair = json.loads(Path("/fixture/pair.json").read_text())["base"]
q, f = [
    json.dumps(pair[k], ensure_ascii=False, indent=2) + "\n"
    for k in ("quizzes", "flashcards")
]
with engines["operator"].begin() as c:
    release = store_release(
        c,
        operation_id=uuid4(),
        quiz_text=q,
        flashcard_text=f,
        source_hashes={
            "quiz": hashlib.sha256(q.encode()).hexdigest(),
            "flashcard": hashlib.sha256(f.encode()).hexdigest(),
        },
        actor="fixture",
        reason="Disposable browser initialization",
    )
    activate_release(
        c,
        operation_id=uuid4(),
        release_id=release.release_id,
        expected_sequence=0,
        actor="fixture",
        reason="Disposable browser publication",
    )
    save_draft(
        c,
        operation_id=uuid4(),
        quiz_text=q,
        flashcard_text=f,
        expected_revision=0,
        base_sequence=1,
        actor="fixture",
        reason="Disposable browser draft",
    )
settings = AuthSettings(
    _env_file=None,
    enabled=True,
    environment="local",
    origin=origin,
    issuer=origin + "/fixture",
    authorization_endpoint=origin + "/fixture/authorize",
    token_endpoint=origin + "/fixture/token",
    jwks_uri=origin + "/fixture/jwks",
    client_id="fixture-client",
    client_secret=secrets.token_urlsafe(24),
    editor_subject="fixture-editor",
    epoch=secrets.token_urlsafe(24),
    encryption_key=Fernet.generate_key().decode(),
    session_database_url=engines["session"].url.render_as_string(hide_password=False),
    editor_database_url=engines["editor"].url.render_as_string(hide_password=False),
)
key = RSAKey.generate_key(2048)
public_key = {
    **key.as_dict(private=False),
    "kid": "fixture",
    "use": "sig",
    "alg": "RS256",
}
codes = {}


def identity(request):
    path = request.url.path
    if path.endswith("openid-configuration"):
        return httpx2.Response(
            200,
            json={
                "issuer": settings.issuer,
                "authorization_endpoint": settings.authorization_endpoint,
                "token_endpoint": settings.token_endpoint,
                "jwks_uri": settings.jwks_uri,
                "code_challenge_methods_supported": ["S256"],
                "id_token_signing_alg_values_supported": ["RS256"],
                "token_endpoint_auth_methods_supported": ["client_secret_basic"],
                "response_types_supported": ["code"],
            },
        )
    if path.endswith("/jwks"):
        return httpx2.Response(200, json={"keys": [public_key]})
    data = parse_qs(request.content.decode())
    record = codes.pop(data.get("code", [""])[0], None)
    verifier = data.get("code_verifier", [""])[0]
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    if not record or challenge != record["challenge"]:
        return httpx2.Response(400, json={"error": "invalid_grant"})
    now = time.time()
    claims = {
        "iss": settings.issuer,
        "sub": settings.editor_subject,
        "aud": settings.client_id,
        "iat": now,
        "exp": now + 300,
        "auth_time": now,
        "nonce": record["nonce"],
        "amr": ["pwd", "mfa"],
        "synthetic_factor_time": now,
        "sid": "fixture",
    }
    return httpx2.Response(
        200,
        json={
            "id_token": jwt.encode({"alg": "RS256", "kid": "fixture"}, claims, key),
            "token_type": "Bearer",
        },
    )


store = SessionStore(engines["session"], settings)
runtime = SimpleNamespace(
    config=settings,
    store=store,
    oidc=OIDCClient(settings, transport=httpx2.MockTransport(identity)),
    close=lambda: None,
)
app = create_app(
    Settings(
        _env_file=None,
        content_source="postgres",
        database_environment="local",
        database_url=engines["reader"].url.render_as_string(hide_password=False),
    ),
    auth_settings=settings,
    auth_factory=lambda _: runtime,
)


@app.get("/fixture/authorize")
def authorize(request: Request):
    params = request.query_params
    code = secrets.token_urlsafe(24)
    codes[code] = {"nonce": params["nonce"], "challenge": params["code_challenge"]}
    return RedirectResponse(
        origin + "/api/admin/auth/callback?state=" + params["state"] + "&code=" + code,
        status_code=303,
    )


@app.post("/fixture/expire")
def expire():
    with engines["session"].begin() as c:
        c.execute(text("UPDATE admin_auth.sessions SET expires=0"))
    return {"fixture": "expired"}


@app.post("/fixture/old-factor")
def old_factor():
    with engines["session"].begin() as c:
        c.execute(
            text("UPDATE admin_auth.sessions SET auth_time=:old"),
            {"old": time.time() - 901},
        )
    return {"fixture": "old-factor"}


@app.get("/fixture/operational-failure/{value}")
def operational_failure(value: str):
    # Test-only exception canary. This fixture is never shipped in the API wheel.
    logging.getLogger("uvicorn.error").error(value)
    logging.getLogger("sqlalchemy.pool.impl.QueuePool").error(value)
    raise RuntimeError(value)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, access_log=True, proxy_headers=False)

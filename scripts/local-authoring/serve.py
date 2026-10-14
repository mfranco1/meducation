"""Opt-in loopback development identity for local authoring; never packaged/deployed."""

import base64
import hashlib
import json
import secrets
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlencode

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend/src"))
import httpx2
import uvicorn
from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from joserfc import jwt
from joserfc.jwk import RSAKey
from meducation_api.auth.config import AuthSettings
from meducation_api.auth.oidc import OIDCClient
from meducation_api.auth.store import SessionStore
from meducation_api.db.engine import create_database_engine, database_url
from meducation_api.main import create_app
from meducation_api.settings import Settings


def build_app():
    state = json.loads((ROOT / "var/local-authority/state.json").read_text())
    if state.get("phase") != "initialized":
        raise RuntimeError(
            "Complete and verify the local cutover before starting writers"
        )
    config_path = ROOT / "var/local-authority/runtime.env"
    config = AuthSettings(_env_file=config_path)
    settings = Settings(_env_file=config_path)
    if (
        not config.enabled
        or config.environment != "local"
        or config.origin != "http://127.0.0.1:5173"
        or settings.content_source != "postgres"
    ):
        raise RuntimeError(
            "Requires the explicit local authority development configuration"
        )
    assert config.session_database_url is not None
    engine = create_database_engine(
        database_url(config.session_database_url, role="meducation_session", local=True)
    )
    key = RSAKey.generate_key(2048)
    public = {
        **key.as_dict(private=False),
        "kid": "local-development",
        "use": "sig",
        "alg": "RS256",
    }
    tickets, codes = {}, {}

    def identity(request):
        if request.url.path.endswith("openid-configuration"):
            return httpx2.Response(
                200,
                json={
                    "issuer": config.issuer,
                    "authorization_endpoint": config.authorization_endpoint,
                    "token_endpoint": config.token_endpoint,
                    "jwks_uri": config.jwks_uri,
                    "code_challenge_methods_supported": ["S256"],
                    "id_token_signing_alg_values_supported": ["RS256"],
                    "token_endpoint_auth_methods_supported": ["client_secret_basic"],
                    "response_types_supported": ["code"],
                },
            )
        if request.url.path.endswith("/jwks"):
            return httpx2.Response(200, json={"keys": [public]})
        expected = (
            "Basic "
            + base64.b64encode(
                (
                    config.client_id + ":" + config.client_secret.get_secret_value()
                ).encode()
            ).decode()
        )
        if not secrets.compare_digest(
            request.headers.get("authorization", ""), expected
        ):
            return httpx2.Response(401, json={"error": "invalid_client"})
        data = parse_qs(request.content.decode())
        record = codes.pop(data.get("code", [""])[0], None)
        challenge = (
            base64.urlsafe_b64encode(
                hashlib.sha256(data.get("code_verifier", [""])[0].encode()).digest()
            )
            .decode()
            .rstrip("=")
        )
        if (
            not record
            or record["expires"] < time.time()
            or challenge != record["code_challenge"]
            or data.get("redirect_uri") != [config.callback]
        ):
            return httpx2.Response(400, json={"error": "invalid_grant"})
        now = time.time()
        claims = {
            "iss": config.issuer,
            "sub": config.editor_subject,
            "aud": config.client_id,
            "iat": now,
            "exp": now + 300,
            "auth_time": now,
            "nonce": record["nonce"],
            "amr": ["mfa"],
            "synthetic_factor_time": now,
            "sid": "local-development",
        }
        return httpx2.Response(
            200,
            json={
                "id_token": jwt.encode(
                    {"alg": "RS256", "kid": "local-development"}, claims, key
                ),
                "token_type": "Bearer",
            },
        )

    oidc = OIDCClient(config, transport=httpx2.MockTransport(identity))

    def close():
        oidc.close()
        engine.dispose()

    runtime = SimpleNamespace(
        config=config, store=SessionStore(engine, config), oidc=oidc, close=close
    )
    app = create_app(settings, auth_settings=config, auth_factory=lambda _: runtime)

    @app.get("/api/local-identity/authorize")
    def authorize(request: Request):
        params = dict(request.query_params)
        if (
            params.get("client_id") != config.client_id
            or params.get("redirect_uri") != config.callback
            or params.get("response_type") != "code"
            or params.get("code_challenge_method") != "S256"
            or not params.get("nonce")
            or not params.get("state")
        ):
            raise HTTPException(400, "Invalid local development flow")
        now = time.time()
        for pool in (tickets, codes):
            for value in list(pool):
                if pool[value]["expires"] < now:
                    del pool[value]
        if len(tickets) >= 16:
            raise HTTPException(429, "Local flow limit")
        token = secrets.token_urlsafe(32)
        tickets[token] = {**params, "expires": now + 300}
        return HTMLResponse(
            '<h1>Local development identity</h1><p>This confirmation simulates sign-in and fresh authentication. It provides no real MFA and is available only on this computer. Never expose this server publicly.</p><form method="post" action="/api/local-identity/confirm"><input type="hidden" name="ticket" value="'
            + token
            + '"><button>Continue as local editor (development only)</button></form>',
            headers={
                "Cache-Control": "no-store",
                "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
            },
        )

    @app.post("/api/local-identity/confirm")
    async def confirm(request: Request):
        if (
            request.headers.get("origin") != config.origin
            or int(request.headers.get("content-length", "0")) > 2048
        ):
            raise HTTPException(403, "Local confirmation origin required")
        body = await request.body()
        if len(body) > 2048:
            raise HTTPException(413, "Local confirmation too large")
        token = parse_qs(body.decode()).get("ticket", [""])[0]
        record = tickets.pop(token, None)
        if not record or record["expires"] < time.time():
            raise HTTPException(400, "Local confirmation expired")
        code = secrets.token_urlsafe(32)
        codes[code] = record
        return RedirectResponse(
            config.callback + "?" + urlencode({"state": record["state"], "code": code}),
            status_code=303,
        )

    return app


if __name__ == "__main__":
    print(
        "Local development identity only: no real MFA. API binds 127.0.0.1:8001.",
        flush=True,
    )
    uvicorn.run(build_app(), host="127.0.0.1", port=8001, workers=1, access_log=False)

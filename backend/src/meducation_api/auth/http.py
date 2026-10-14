"""Same-origin cookie flow and prefix-wide protection before private routing."""

import asyncio
import hashlib
import hmac
import json
import logging
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool

from meducation_api.auth.config import AuthSettings
from meducation_api.auth.oidc import AuthError, OIDCClient, StrictDecoder
from meducation_api.auth.store import SessionStore, opaque
from meducation_api.db.engine import create_database_engine, database_url

PRIVATE_HEADERS = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
}


class RedactAdminQuery(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple) and len(record.args) == 5:
            args = list(record.args)
            if isinstance(args[2], str) and args[2].startswith("/api/admin"):
                args[2] = args[2].split("?", 1)[0]
                record.args = tuple(args)
        return True


class AuthRuntime:
    def __init__(self, config: AuthSettings):
        self.config = config
        assert config.session_database_url is not None
        self.engine = create_database_engine(
            database_url(
                config.session_database_url,
                role="meducation_session",
                local=config.environment == "local",
            )
        )
        self.store = SessionStore(self.engine, config)
        self.oidc = OIDCClient(config)

    def close(self) -> None:
        self.oidc.close()
        self.engine.dispose()


def error_response(error: AuthError, config: AuthSettings, *, callback: bool = False) -> Response:
    # No exception/claim/provider/body details in the public error contract.
    response = JSONResponse(
        {
            "error": {
                "code": error.code,
                "message": "Admin access could not be completed.",
                "requestId": str(uuid4()),
            }
        },
        status_code=error.status,
        headers=PRIVATE_HEADERS,
    )
    if error.status == 401 and not callback:
        response.delete_cookie(config.cookie, secure=config.secure, httponly=True, samesite="lax")
    if callback:
        response.delete_cookie(
            config.cookie + "-flow", secure=config.secure, httponly=True, samesite="lax"
        )
    return response


def install_auth(
    app: FastAPI,
    config: AuthSettings,
    runtime_factory: Callable[[AuthSettings], AuthRuntime] = AuthRuntime,
) -> None:
    # Construction has no network/DB/migration side effect. Lifecycle owns resources.
    access_logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, RedactAdminQuery) for f in access_logger.filters):
        access_logger.addFilter(RedactAdminQuery())
    runtime = runtime_factory(config) if config.enabled else None
    app.state.auth = runtime
    flow_cookie = config.cookie + "-flow"
    exemptions = {"/api/admin/session", "/api/admin/auth/login", "/api/admin/auth/callback"}

    def flow_csrf(browser: str) -> str:
        return hmac.new(
            config.encryption_key.get_secret_value().encode(),
            b"anonymous-login-v1:" + browser.encode(),
            hashlib.sha256,
        ).hexdigest()

    def set_cookie(response: Response, name: str, value: str, age: int) -> None:
        response.set_cookie(
            name, value, max_age=age, secure=config.secure, httponly=True, samesite="lax", path="/"
        )

    @app.middleware("http")
    async def admin_boundary(request: Request, call_next: Any) -> Response:
        path = request.url.path
        if path != "/api/admin" and not path.startswith("/api/admin/"):
            return await call_next(request)
        if runtime is None:
            return error_response(AuthError(503, "admin_disabled"), config)
        guard = None
        principal = None
        try:
            if config.environment == "local" and (request.scope.get("server") or ("", 0))[
                0
            ] not in {"127.0.0.1", "localhost", "::1"}:
                raise AuthError(403, "local_binding_required")
            if request.headers.get("host") != urlsplit(config.origin).netloc:
                raise AuthError(403, "host_denied")
            # Private auth responses have no CORS surface; Origin never trusts forwarded headers.
            if request.method not in ("GET", "HEAD"):
                if request.headers.get("origin") != config.origin:
                    raise AuthError(403, "origin_denied")
                if request.headers.get("content-encoding", "identity").lower() != "identity":
                    raise AuthError(415, "encoding_unsupported")
                if (
                    request.headers.get("content-type", "").split(";")[0].strip().lower()
                    != "application/json"
                ):
                    raise AuthError(415, "json_required")
            if path not in exemptions:
                fresh = path in {
                    "/api/admin/publish",
                    "/api/admin/exports",
                    "/api/admin/draft/reset",
                } or path.endswith("/activate")
                guard = runtime.store.guard(
                    request.cookies.get(config.cookie),
                    csrf=request.headers.get("x-csrf-token"),
                    write=request.method not in ("GET", "HEAD"),
                    fresh=fresh,
                    interactive=path != "/api/admin/access"
                    and not path.startswith("/api/admin/operations/"),
                )
                principal = await run_in_threadpool(guard.__enter__)
                request.state.principal = principal
            response = await call_next(request)
            if guard is not None:
                await run_in_threadpool(guard.__exit__, None, None, None)
                guard = None
            for k, v in PRIVATE_HEADERS.items():
                response.headers[k] = v
            for key in list(response.headers):
                if key.startswith("access-control-"):
                    del response.headers[key]
            return response
        except AuthError as error:
            return error_response(error, config, callback=path == "/api/admin/auth/callback")
        finally:
            request.scope["query_string"] = (
                b""
                if path.startswith("/api/admin/auth/")
                else request.scope.get("query_string", b"")
            )
            if guard is not None:
                # Roll back activity/revocation when protected execution did not finish.
                await run_in_threadpool(
                    guard.__exit__, RuntimeError, RuntimeError("private request failed"), None
                )

    async def empty_body(request: Request) -> None:
        data = b""
        try:
            async with asyncio.timeout(10):
                async for chunk in request.stream():
                    data += chunk
                    if len(data) > 8192:
                        raise AuthError(413, "auth_body_limit")
            if json.loads(data, cls=StrictDecoder) != {}:
                raise AuthError(400, "auth_envelope_invalid")
        except AuthError:
            raise
        except TimeoutError:
            raise AuthError(408, "auth_body_timeout") from None
        except ValueError, UnicodeError, RecursionError:
            raise AuthError(400, "auth_envelope_invalid") from None

    @app.get("/api/admin/session", include_in_schema=False)
    def session(request: Request) -> Response:
        assert runtime is not None
        token = request.cookies.get(config.cookie)
        if token:
            try:
                with runtime.store.guard(token, interactive=False) as principal:
                    return JSONResponse(
                        {
                            "authenticated": True,
                            "csrfToken": principal.csrf,
                            "expiresAt": principal.expires,
                            "fresh": runtime.store.clock() - principal.identity.auth_time <= 900,
                        },
                        headers=PRIVATE_HEADERS,
                    )
            except AuthError as error:
                if error.status != 401:
                    raise
        browser = request.cookies.get(flow_cookie)
        if not browser or len(browser) != 43:
            browser = opaque()
        response = JSONResponse(
            {"authenticated": False, "csrfToken": flow_csrf(browser)}, headers=PRIVATE_HEADERS
        )
        set_cookie(response, flow_cookie, browser, 600)
        if token:
            response.delete_cookie(
                config.cookie, secure=config.secure, httponly=True, samesite="lax"
            )
        return response

    @app.post("/api/admin/auth/login", include_in_schema=False)
    async def login(request: Request) -> Response:
        assert runtime is not None
        await empty_body(request)
        browser = request.cookies.get(flow_cookie, "")
        csrf = request.headers.get("x-csrf-token", "")
        if len(browser) != 43 or not hmac.compare_digest(flow_csrf(browser).encode(), csrf.encode()):
            raise AuthError(403, "csrf_invalid")
        await run_in_threadpool(runtime.store.rate, browser)
        transaction = await run_in_threadpool(runtime.store.begin_login, browser)
        url = runtime.oidc.authorization(
            state=transaction["state"], nonce=transaction["nonce"], verifier=transaction["verifier"]
        )
        response = JSONResponse({"authorizationUrl": url}, headers=PRIVATE_HEADERS)
        set_cookie(response, flow_cookie, browser, 600)
        return response

    @app.post("/api/admin/auth/reauthenticate", include_in_schema=False)
    async def reauthenticate(request: Request) -> Response:
        assert runtime is not None
        await empty_body(request)
        browser = request.cookies.get(flow_cookie) or opaque()
        await run_in_threadpool(
            runtime.store.rate, browser, connection=request.state.principal.connection
        )
        transaction = await run_in_threadpool(
            runtime.store.begin_login, browser, session_hash=request.state.principal.token_hash
        )
        response = JSONResponse(
            {
                "authorizationUrl": runtime.oidc.authorization(
                    state=transaction["state"],
                    nonce=transaction["nonce"],
                    verifier=transaction["verifier"],
                )
            },
            headers=PRIVATE_HEADERS,
        )
        set_cookie(response, flow_cookie, browser, 600)
        return response

    @app.get("/api/admin/auth/callback", include_in_schema=False)
    def callback(request: Request) -> Response:
        assert runtime is not None
        if len(request.url.query) > 4096:
            raise AuthError(400, "login_invalid")
        fields = list(request.query_params.multi_items())
        if len({k for k, v in fields}) != len(fields) or any(
            k not in {"state", "code", "error", "error_description", "iss"} for k, v in fields
        ):
            raise AuthError(400, "login_invalid")
        state = request.query_params.get("state", "")
        code = request.query_params.get("code", "")
        browser = request.cookies.get(flow_cookie, "")
        if len(state) != 43 or len(browser) != 43 or len(code) > 2048:
            raise AuthError(401, "login_invalid")
        runtime.store.rate(browser)
        transaction = runtime.store.consume(state, browser)
        if (
            "error" in request.query_params
            or not code
            or request.query_params.get("iss", config.issuer) != config.issuer
        ):
            # Cancellation never upgrades/revokes a still-valid existing session.
            response = RedirectResponse(
                config.origin + "/admin.html", status_code=303, headers=PRIVATE_HEADERS
            )
            response.delete_cookie(flow_cookie, secure=config.secure, httponly=True, samesite="lax")
            return response
        identity = runtime.oidc.exchange(
            code, nonce=transaction["nonce"], verifier=transaction["verifier"]
        )
        token, _ = runtime.store.issue(identity, previous=transaction["session"])
        response = RedirectResponse(
            config.origin + "/admin.html", status_code=303, headers=PRIVATE_HEADERS
        )
        max_age = 28800
        with runtime.store.guard(token, interactive=False) as principal:
            max_age = max(0, int(principal.expires - runtime.store.clock()))
        set_cookie(response, config.cookie, token, max_age)
        response.delete_cookie(flow_cookie, secure=config.secure, httponly=True, samesite="lax")
        return response

    @app.post("/api/admin/auth/logout", include_in_schema=False)
    async def logout(request: Request) -> Response:
        assert runtime is not None
        await empty_body(request)
        await run_in_threadpool(runtime.store.revoke, request.state.principal)
        response = JSONResponse({"authenticated": False}, headers=PRIVATE_HEADERS)
        response.delete_cookie(config.cookie, secure=config.secure, httponly=True, samesite="lax")
        response.delete_cookie(flow_cookie, secure=config.secure, httponly=True, samesite="lax")
        return response

    @app.get("/api/admin/access", include_in_schema=False)
    def access(request: Request) -> dict[str, bool]:
        return {"authenticated": True}

    @app.exception_handler(AuthError)
    async def auth_failure(request: Request, error: AuthError) -> Response:
        # Invalid step-up retains an existing session. Callback errors only clear flow binding.
        return error_response(
            error, config, callback=request.url.path == "/api/admin/auth/callback"
        )

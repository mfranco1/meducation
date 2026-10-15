"""Allowlisted request events. Never serialize request data or exception text."""

import json
import logging
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from threading import Lock
from typing import Literal
from uuid import uuid4

from sqlalchemy.exc import DBAPIError, TimeoutError
from starlette.responses import JSONResponse
from starlette.routing import BaseRoute, Match
from starlette.types import ASGIApp, Message, Receive, Scope, Send

PRIVATE_RESPONSE_HEADERS = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
}


Dependency = Literal["reader", "session", "editor"]
Category = Literal["ok", "pool_timeout", "connection_failure", "sql_timeout", "database_failure"]


@dataclass
class RequestEvents:
    dependencies: dict[Dependency, Category] = field(default_factory=dict)


current_events: ContextVar[RequestEvents | None] = ContextVar("operational_request", default=None)


def database_category(error: Exception) -> Category:
    if isinstance(error, TimeoutError):
        return "pool_timeout"
    state = getattr(getattr(error, "orig", None), "sqlstate", None)
    if isinstance(error, DBAPIError) and (
        error.connection_invalidated or state is None or str(state).startswith("08")
    ):
        return "connection_failure"
    if state in ("57014", "55P03"):
        return "sql_timeout"
    return "database_failure"


def dependency_result(role: Dependency, category: Category = "ok") -> None:
    events = current_events.get()
    # Keep a failure if cleanup/another operation on this request succeeds.
    if events is not None and events.dependencies.get(role, "ok") == "ok":
        events.dependencies[role] = category


def database_failure(role: Dependency, error: Exception) -> None:
    dependency_result(role, database_category(error))


class SafeAccessFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple) and len(record.args) == 5:
            _, method, _, protocol, status = record.args
            record.msg = '%s - "%s %s HTTP/%s" %d'
            record.args = (
                "[client]",
                method
                if method in {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
                else "OTHER",
                "/[redacted]",
                protocol if protocol in {"1.0", "1.1", "2"} else "?",
                status if isinstance(status, int) else 0,
            )
        else:
            record.msg, record.args = "HTTP access", ()
        record.exc_info = None
        record.exc_text = None
        record.stack_info = None
        return True


class SafeServerErrorFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if (
            record.levelno >= logging.ERROR
            or record.exc_info
            or record.exc_text
            or record.stack_info
        ):
            record.msg, record.args = (
                '{"event":"server_error","failure_category":"internal_error"}',
                (),
            )
            record.exc_info = record.exc_text = record.stack_info = None
        return True


def configure_operational_logging() -> None:
    for name, cls in [
        ("uvicorn.access", SafeAccessFilter),
        ("uvicorn.error", SafeServerErrorFilter),
    ]:
        logger = logging.getLogger(name)
        if not any(isinstance(f, cls) for f in logger.filters):
            logger.addFilter(cls())
    # SQLAlchemy pool reset/disconnect logs can carry raw driver exception text.
    # Worker request events replace those diagnostics with safe categories.
    sql = logging.getLogger("sqlalchemy")
    if not any(isinstance(h, logging.NullHandler) for h in sql.handlers):
        sql.addHandler(logging.NullHandler())
    sql.propagate = False
    logger = logging.getLogger("meducation.operations")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)


class OperationalMiddleware:
    def __init__(self, app: ASGIApp, routes: list[BaseRoute]):
        self.app, self.routes = app, routes
        self.failed: set[Dependency] = set()
        self.lock = Lock()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id, started = uuid4().hex, time.monotonic()
        scope.setdefault("state", {})["request_id"] = request_id
        events = RequestEvents()
        token = current_events.set(events)
        route = next(
            (
                str(getattr(r, "path", "<unmatched>"))
                for r in self.routes
                if r.matches(scope)[0] == Match.FULL
            ),
            "<unmatched>",
        )
        status, began, failed = 500, False, False

        async def response(message: Message) -> None:
            nonlocal status, began
            if message["type"] == "http.response.start":
                status, began = message["status"], True
                message["headers"] = [
                    (k, v) for k, v in message.get("headers", []) if k.lower() != b"x-request-id"
                ] + [(b"x-request-id", request_id.encode())]
            await send(message)

        try:
            await self.app(scope, receive, response)
        except Exception:  # noqa: BLE001 -- final HTTP boundary must not leak exceptions
            failed = True
            if began:
                raise RuntimeError("Response delivery failed.") from None
            await JSONResponse(
                {"detail": {"code": "internal_error", "requestId": request_id}},
                status_code=500,
                headers=PRIVATE_RESPONSE_HEADERS,
            )(scope, receive, response)
        finally:
            current_events.reset(token)
            recovered = []
            with self.lock:
                for role, category in events.dependencies.items():
                    if category == "ok":
                        if role in self.failed:
                            recovered.append(role)
                        self.failed.discard(role)
                    else:
                        self.failed.add(role)
            errors = [v for v in events.dependencies.values() if v != "ok"]
            category_name = (
                errors[0]
                if errors
                else (
                    "internal_error"
                    if failed
                    else "unavailable"
                    if status >= 500
                    else "http_error"
                    if status >= 400
                    else "ok"
                )
            )
            method = (
                scope["method"]
                if scope["method"] in {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
                else "OTHER"
            )
            logging.getLogger("meducation.operations").info(
                json.dumps(
                    {
                        "event": "request_complete",
                        "request_id": request_id,
                        "route": route,
                        "method": method,
                        "status": status,
                        "duration_ms": round((time.monotonic() - started) * 1000, 3),
                        "failure_category": category_name,
                        "dependencies": events.dependencies,
                        "recovered_dependencies": sorted(recovered),
                    },
                    separators=(",", ":"),
                )
            )

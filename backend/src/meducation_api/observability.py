"""Allowlisted request events. Never serialize request data or exception text."""

import json
import logging
import sys
import time
import traceback
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
    sqlstate: str | None = None


current_events: ContextVar[RequestEvents | None] = ContextVar("operational_request", default=None)


def sqlstate(error: Exception) -> str | None:
    state = getattr(getattr(error, "orig", None), "sqlstate", None)
    return state if isinstance(state, str) and len(state) == 5 else None


def database_category(error: Exception) -> Category:
    if isinstance(error, TimeoutError):
        return "pool_timeout"
    state = sqlstate(error)
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
    events = current_events.get()
    if events is not None and events.sqlstate is None:
        events.sqlstate = sqlstate(error)
    dependency_result(role, database_category(error))


def _location(frame: traceback.FrameSummary) -> str:
    path = frame.filename.replace("\\", "/")
    if "site-packages/" in path:
        path = path.rsplit("site-packages/", 1)[1]
    elif "meducation_api/" in path:
        path = "meducation_api/" + path.rsplit("meducation_api/", 1)[1]
    else:
        path = path.rsplit("/", 1)[-1]
    return f"{path}:{frame.lineno} in {frame.name}"


def error_summary(error: BaseException) -> dict[str, object]:
    # Exception type and code locations only; the message can carry request data or SQL.
    return {
        "type": type(error).__name__,
        "frames": [_location(f) for f in traceback.extract_tb(error.__traceback__)[-5:]],
    }


def log_event(event: str, *, level: str = "info", **fields: object) -> None:
    logging.getLogger("meducation.operations").info(
        json.dumps({"event": event, "level": level, **fields}, separators=(",", ":"))
    )


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
    # Request events replace uvicorn's access log, which would repeat every request.
    logging.getLogger("uvicorn.access").disabled = True
    error_logger = logging.getLogger("uvicorn.error")
    if not any(isinstance(f, SafeServerErrorFilter) for f in error_logger.filters):
        error_logger.addFilter(SafeServerErrorFilter())
    # SQLAlchemy pool reset/disconnect logs can carry raw driver exception text.
    # Worker request events replace those diagnostics with safe categories.
    sql = logging.getLogger("sqlalchemy")
    if not any(isinstance(h, logging.NullHandler) for h in sql.handlers):
        sql.addHandler(logging.NullHandler())
    sql.propagate = False
    logger = logging.getLogger("meducation.operations")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
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
        status, began, failed = 500, False, None

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
        except Exception as exc:  # noqa: BLE001 -- final HTTP boundary must not leak exceptions
            failed = error_summary(exc)
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
            quiet_probe = route.startswith("/health/") and status < 400 and not errors
            if not quiet_probe:
                log_event(
                    "request_complete",
                    level="error" if status >= 500 or errors else "info",
                    request_id=request_id,
                    route=route,
                    method=method,
                    status=status,
                    duration_ms=round((time.monotonic() - started) * 1000, 3),
                    failure_category=category_name,
                    dependencies=events.dependencies,
                    recovered_dependencies=sorted(recovered),
                    **({"sqlstate": events.sqlstate} if events.sqlstate else {}),
                    **({"error": failed} if failed else {}),
                )

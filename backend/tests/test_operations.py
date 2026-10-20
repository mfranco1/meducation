"""Operational logging uses fixed templates/categories and generated correlation."""

import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from fixture_content import fixture_app
from sqlalchemy.exc import DBAPIError, TimeoutError

from meducation_api.main import create_app
from meducation_api.operations import SafeServerErrorFilter, database_category
from meducation_api.settings import Settings

ROOT = Path(__file__).resolve().parents[2]
CANARY = "L5-secret-code-token-password-authored-text"


def app():
    return fixture_app(
        json.loads((ROOT / "e2e/fixtures/bank.json").read_text()),
        json.loads((ROOT / "e2e/fixtures/flashcard-bank.json").read_text()),
    )


def events(caplog):
    return [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.name == "meducation.operations"
    ]


def test_request_logs_never_include_input_and_errors_are_correlated(caplog):
    application = app()

    @application.get("/fixture/fail/{value}")
    def fail(value: str):
        raise RuntimeError(CANARY)

    with TestClient(application) as client:
        response = client.get(
            "/fixture/fail/" + CANARY + "?code=" + CANARY,
            headers={
                "Cookie": "token=" + CANARY,
                "X-Request-ID": CANARY,
                "X-Forwarded-For": CANARY,
            },
        )
        assert response.status_code == 500
        assert CANARY not in response.text
        event = events(caplog)[-1]
        assert event["route"] == "/fixture/fail/{value}"
        assert event["failure_category"] == "internal_error"
        assert event["level"] == "error"
        assert event["error"]["type"] == "RuntimeError"
        assert any("in fail" in frame for frame in event["error"]["frames"])
        assert (
            event["request_id"]
            == response.headers["x-request-id"]
            == response.json()["detail"]["requestId"]
        )
        assert event["duration_ms"] >= 0
        assert CANARY not in json.dumps(events(caplog))
        denied = client.post("/api/admin/diagnostics", json={"secret": CANARY})
        assert denied.status_code == 503
        assert denied.json()["error"]["code"] == "admin_disabled"
        assert denied.json()["error"]["requestId"] == denied.headers["x-request-id"]
        missing = client.get("/" + CANARY)
        assert missing.status_code == 404
        assert events(caplog)[-1]["route"] == "<unmatched>"
        assert CANARY not in json.dumps(events(caplog))


def test_exception_filter_strips_untrusted_fields_and_traces():
    error = logging.LogRecord(
        "uvicorn.error",
        logging.ERROR,
        "",
        0,
        CANARY,
        (),
        (RuntimeError, RuntimeError(CANARY), None),
    )
    SafeServerErrorFilter().filter(error)
    assert CANARY not in error.getMessage()
    assert error.exc_info is error.exc_text is error.stack_info is None


def test_health_probes_log_only_failures(caplog):
    application = app()
    with TestClient(application) as client:
        assert client.get("/health/live").status_code == 200
        assert not [e for e in events(caplog) if e.get("route") == "/health/live"]
        application.state.source = None
        assert client.get("/health/ready").status_code == 503
        event = events(caplog)[-1]
        assert event["route"] == "/health/ready"
        assert event["level"] == "error"


def test_startup_failure_is_logged_without_exception_text(caplog):
    def broken(_: Settings):
        raise RuntimeError(CANARY)

    failing = create_app(Settings(_env_file=None), source_factory=broken)
    with pytest.raises(RuntimeError), TestClient(failing):
        pass
    event = events(caplog)[-1]
    assert event["event"] == "startup_failed"
    assert event["level"] == "error"
    assert event["error"]["type"] == "RuntimeError"
    assert CANARY not in json.dumps(events(caplog))


def test_database_failure_categories_do_not_use_exception_messages():
    assert database_category(TimeoutError(CANARY)) == "pool_timeout"
    assert (
        database_category(
            DBAPIError(
                "secret SQL", {"secret": CANARY}, RuntimeError(CANARY), connection_invalidated=True
            )
        )
        == "connection_failure"
    )
    assert database_category(RuntimeError(CANARY)) == "database_failure"


def test_preformatted_server_errors_and_public_private_cors_are_safe(caplog):
    application = app()
    logging.getLogger("uvicorn.error").error(CANARY)
    assert CANARY not in caplog.records[-1].getMessage()
    # A pool-internal log must not propagate raw driver exception text to root handlers.
    root = logging.getLogger()
    received: list[logging.LogRecord] = []
    handler = logging.Handler()
    handler.emit = received.append  # type: ignore[method-assign]
    root.addHandler(handler)
    try:
        logging.getLogger("sqlalchemy.pool.impl.QueuePool").error(CANARY)
    finally:
        root.removeHandler(handler)
    assert received == []
    with TestClient(application) as client:
        origin = "http://localhost:5173"
        public = client.get("/api/v1/subjects", headers={"Origin": origin})
        assert public.headers["access-control-allow-origin"] == origin
        denied = client.get("/api/admin/access", headers={"Origin": origin})
        assert denied.status_code == 503
        assert "access-control-allow-origin" not in denied.headers

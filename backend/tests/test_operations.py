"""Operational logging uses fixed templates/categories and generated correlation."""

import json
import logging
from pathlib import Path

from fastapi.testclient import TestClient
from fixture_content import fixture_app
from sqlalchemy.exc import DBAPIError, TimeoutError

from meducation_api.operations import SafeAccessFilter, SafeServerErrorFilter, database_category

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


def test_access_and_exception_filters_strip_untrusted_fields_and_traces():
    access = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        "",
        0,
        '%s - "%s %s HTTP/%s" %d',
        (CANARY, CANARY, "/" + CANARY + "?code=" + CANARY, CANARY, 500),
        None,
    )
    SafeAccessFilter().filter(access)
    assert CANARY not in access.getMessage()
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
    # A pool-internal log must not propagate raw driver exception text.
    before = len(caplog.records)
    logging.getLogger("sqlalchemy.pool.impl.QueuePool").error(CANARY)
    assert len(caplog.records) == before
    with TestClient(application) as client:
        origin = "http://localhost:5173"
        public = client.get("/api/v1/subjects", headers={"Origin": origin})
        assert public.headers["access-control-allow-origin"] == origin
        denied = client.get("/api/admin/access", headers={"Origin": origin})
        assert denied.status_code == 503
        assert "access-control-allow-origin" not in denied.headers

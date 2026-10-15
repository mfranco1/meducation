"""Paired source injection and response-scoped cleanup stay independent of Postgres."""

import json
from contextlib import contextmanager
from pathlib import Path
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient
from fixture_content import FixtureContentSource

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.main import create_app
from meducation_api.settings import Settings


@pytest.fixture
def source(tmp_path):
    root = Path(__file__).resolve().parents[2]
    q = json.loads((root / "tests/fixtures/bank-contract-cases.json").read_text())["base"]
    settings = Settings(_env_file=None)

    class TracedSource(FixtureContentSource):
        events: ClassVar[list[str]] = []

        @contextmanager
        def view(self):
            self.events.append("open")
            try:
                with super().view() as view:
                    yield view
            finally:
                self.events.append("closed")

    return settings, TracedSource(q)


def test_injected_paired_source_closes_for_success_conditional_and_errors(source):
    settings, paired = source
    app = create_app(settings, source_factory=lambda _: paired)
    with TestClient(app) as client:
        assert client.get("/health/ready").status_code == 200
        assert paired.events == []
        result = client.get("/api/v1/subjects")
        etag = result.headers["etag"]
        assert paired.events == ["open", "closed"]
        for path, headers, status in [
            ("/api/v1/subjects", {"If-None-Match": etag}, 304),
            ("/api/v1/subjects", {"If-Match": "wrong"}, 409),
            ("/api/v1/quizzes/unknown", {}, 404),
        ]:
            paired.events.clear()
            assert client.get(path, headers=headers).status_code == status
            assert paired.events == ["open", "closed"]
    assert paired._view is None and app.state.source is None


@pytest.mark.parametrize(
    "error", [ContentDatabaseError("secret internal diagnostic"), RuntimeError("payload failed")]
)
def test_source_cleanup_survives_body_construction_failure(source, monkeypatch, error):
    settings, paired = source
    app = create_app(settings, source_factory=lambda _: paired)
    with TestClient(app) as client:
        bank = paired._view.questions

        def fail(quiz_id):
            raise error

        monkeypatch.setattr(bank, "list_questions", fail)
        if isinstance(error, ContentDatabaseError):
            result = client.get("/api/v1/quizzes/q1/questions")
            assert result.status_code == 503 and "secret" not in result.text
        else:
            result = client.get("/api/v1/quizzes/q1/questions")
            assert result.status_code == 500
            assert result.json()["detail"]["code"] == "internal_error"
            assert "payload failed" not in result.text
        assert paired.events == ["open", "closed"]

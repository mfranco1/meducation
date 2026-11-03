"""Browser test startup rejects authority inputs before touching Docker or Postgres."""

import importlib.util
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest


@pytest.fixture
def runner(monkeypatch):
    """The fixture runner with Docker replaced by a mock that fails if called."""
    scripts = Path(__file__).resolve().parents[2] / "scripts/testing"
    monkeypatch.syspath_prepend(str(scripts))
    spec = importlib.util.spec_from_file_location(
        "browser_fixture_runner", scripts / "serve-postgres-fixture.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    docker = Mock(side_effect=AssertionError("Docker must not run"))
    monkeypatch.setattr(module, "docker", docker)
    monkeypatch.setattr(sys.modules["pg_container"], "docker", docker)
    return module


@pytest.mark.parametrize(
    "origin",
    [
        "https://example.com",
        "http://localhost:4173",
        "http://127.0.0.1:4173/path",
        "http://user:password@127.0.0.1:4173",
    ],
)
def test_browser_fixture_rejects_non_loopback_or_non_origin_urls_before_docker(
    runner, monkeypatch, origin
):
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "fixture",
            "--origin",
            origin,
            "--api-port",
            "8765",
            "--quiz-file",
            "tests/fixtures/e2e-bank.json",
            "--flashcard-file",
            "tests/fixtures/e2e-flashcard-bank.json",
        ],
    )
    with pytest.raises(SystemExit) as error:
        runner.main()
    assert error.value.code == 2
    runner.docker.assert_not_called()


@pytest.mark.parametrize(
    "source",
    [
        "src/content/questionBank.generated.json",
        "var/backups/postgres/private-export/questionBank.json",
    ],
)
def test_browser_fixture_rejects_authority_or_archive_inputs_before_docker(
    runner, monkeypatch, source
):
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "fixture",
            "--origin",
            "http://127.0.0.1:4173",
            "--api-port",
            "8765",
            "--quiz-file",
            source,
            "--flashcard-file",
            "tests/fixtures/e2e-flashcard-bank.json",
        ],
    )
    with pytest.raises(SystemExit) as error:
        runner.main()
    assert error.value.code == 2
    runner.docker.assert_not_called()


def test_browser_fixture_rejects_private_pair_export_before_docker(runner, monkeypatch):
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "fixture",
            "--origin",
            "http://127.0.0.1:4174",
            "--api-port",
            "8766",
            "--pair-file",
            "var/backups/postgres/private-export/pair.json",
        ],
    )
    with pytest.raises(SystemExit) as error:
        runner.main()
    assert error.value.code == 2
    runner.docker.assert_not_called()

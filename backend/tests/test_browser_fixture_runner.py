"""Browser test startup rejects authority inputs before touching Docker or Postgres."""

import importlib.util
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest


@pytest.fixture
def runner():
    path = Path(__file__).resolve().parents[2] / "scripts/testing/serve-postgres-fixture.py"
    spec = importlib.util.spec_from_file_location("browser_fixture_runner", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
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
    docker = Mock(side_effect=AssertionError("Docker must not run"))
    monkeypatch.setattr(runner, "docker", docker)
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
            "e2e/fixtures/bank.json",
            "--flashcard-file",
            "e2e/fixtures/flashcard-bank.json",
        ],
    )
    with pytest.raises(SystemExit) as error:
        runner.main()
    assert error.value.code == 2
    docker.assert_not_called()


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
    docker = Mock(side_effect=AssertionError("Docker must not run"))
    monkeypatch.setattr(runner, "docker", docker)
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
            "e2e/fixtures/flashcard-bank.json",
        ],
    )
    with pytest.raises(SystemExit) as error:
        runner.main()
    assert error.value.code == 2
    docker.assert_not_called()


def test_browser_fixture_rejects_private_pair_export_before_docker(runner, monkeypatch):
    docker = Mock(side_effect=AssertionError("Docker must not run"))
    monkeypatch.setattr(runner, "docker", docker)
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
    docker.assert_not_called()

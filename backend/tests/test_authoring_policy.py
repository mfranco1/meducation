"""Shared parity, HTTP admission, worker failure and pre-write policy regressions."""

import copy
import json
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from meducation_api.content_policy import (
    ContentPolicyError,
    PairedContentValidator,
    parse_json,
    policy_limits,
    read_json_body,
)
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.operations import save_draft

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = json.loads((ROOT / "tests/fixtures/paired-authoring-cases.json").read_bytes())


def candidate(changes=()):
    pair = copy.deepcopy(FIXTURES["base"])
    for change in changes:
        parent = pair
        for key in change["path"][:-1]:
            parent = parent[key]
        parent[change["path"][-1]] = change["value"]
    return pair


@pytest.mark.parametrize("fixture", FIXTURES["cases"], ids=lambda case: case["id"])
def test_shared_policy_acceptance_and_exact_artifacts(fixture):
    pair = candidate(fixture["changes"])
    before = copy.deepcopy(pair)
    validator = PairedContentValidator()
    if fixture["valid"]:
        valid = validator.validate(pair)
        assert json.loads(valid.quiz_artifact) == pair["quizzes"]
        assert json.loads(valid.flashcard_artifact) == pair["flashcards"]
        assert (
            valid.quiz_artifact == json.dumps(pair["quizzes"], ensure_ascii=False, indent=2) + "\n"
        )
        assert (
            valid.flashcard_artifact
            == json.dumps(pair["flashcards"], ensure_ascii=False, indent=2) + "\n"
        )
    else:
        with pytest.raises(ContentPolicyError) as caught:
            validator.validate(pair)
        assert caught.value.status == 422
        assert caught.value.issues
        assert all(issue.path.startswith("$.pair") for issue in caught.value.issues)
    assert pair == before


@pytest.mark.parametrize("fixture", FIXTURES["wireCases"], ids=lambda case: case["id"])
def test_shared_wire_rejections(fixture):
    with pytest.raises(ContentPolicyError) as caught:
        parse_json(fixture["text"].encode())
    assert caught.value.code == fixture["code"]


def test_shape_diagnostics_have_paths_without_private_content():
    pair = candidate()
    pair["quizzes"]["questions"][0]["choices"][0]["text"] = None
    with pytest.raises(ContentPolicyError) as caught:
        PairedContentValidator().validate(pair)
    assert caught.value.issues[0].path == "$.pair.quizzes.questions[0].choices[0]"
    assert "None" not in str(caught.value)


def test_invalid_pair_never_calls_database_or_mutates_input():
    pair = candidate()
    pair["quizzes"]["questions"][0]["stem"] = (
        '<img src="/content/a" alt="private" onerror="private">'
    )
    before = copy.deepcopy(pair)
    # No fake database behavior: None must never be dereferenced for invalid content.
    with pytest.raises(ContentDatabaseError, match="policy validation"):
        save_draft(
            None,
            operation_id=uuid4(),
            quiz_text=json.dumps(pair["quizzes"]),
            flashcard_text=json.dumps(pair["flashcards"]),
            expected_revision=0,
            base_sequence=0,
            actor="test-only",
            reason="Reviewed fixture",
        )
    assert pair == before


def test_worker_timeout_outage_and_slots_fail_closed(monkeypatch):
    import meducation_api.content_policy as policy

    validator = PairedContentValidator()
    pair = candidate()
    with monkeypatch.context() as patch:
        patch.setattr(policy.shutil, "which", lambda name: None)
        with pytest.raises(ContentPolicyError) as caught:
            validator.validate(pair)
        assert caught.value.status == 503
    with monkeypatch.context() as patch:

        def timeout(*args, **kwargs):
            raise subprocess.TimeoutExpired("policy", 120)

        patch.setattr(policy.subprocess, "run", timeout)
        with pytest.raises(ContentPolicyError) as caught:
            validator.validate(pair)
        assert caught.value.status == 503
    # A failed worker must release its slot; subsequent real validation succeeds.
    assert validator.validate(pair).policy_version == 1
    assert policy._SLOTS.acquire(blocking=False)
    assert policy._SLOTS.acquire(blocking=False)
    try:
        with pytest.raises(ContentPolicyError) as caught:
            validator.validate(pair)
        assert caught.value.code == "content_policy_busy"
    finally:
        policy._SLOTS.release()
        policy._SLOTS.release()


def test_diagnostics_bounded_and_no_source_echo():
    pair = candidate()
    pair["quizzes"]["questions"][0]["stem"] = "<script>PRIVATE_SENTINEL</script>" * 300
    with pytest.raises(ContentPolicyError) as caught:
        PairedContentValidator().validate(pair)
    response = caught.value.response()
    assert response["error"]["truncated"]
    assert len(caught.value.issues) == policy_limits()["maxIssues"]
    assert "PRIVATE_SENTINEL" not in json.dumps(response)


def test_approved_image_configuration_is_not_inherited_from_request_or_environment(monkeypatch):
    pair = candidate()
    pair["quizzes"]["questions"][0]["stem"] = "![Diagram](https://figures.example/diagram.png)"
    monkeypatch.setenv("CONTENT_IMAGE_ORIGINS", "https://figures.example")
    with pytest.raises(ContentPolicyError):
        PairedContentValidator().validate(pair)
    assert PairedContentValidator(image_origins="https://figures.example").validate(pair)


def http_app():
    # Test-only endpoint: production deliberately has no unauthenticated admin routes.
    app = FastAPI()

    @app.exception_handler(ContentPolicyError)
    async def rejected(request, error):
        return JSONResponse(error.response(), status_code=error.status)

    @app.post("/api/admin/test-policy")
    async def preview(request: Request):
        pair = await read_json_body(request)
        valid = PairedContentValidator().validate(pair)
        return {"policyVersion": valid.policy_version}

    return app


def test_http_stream_and_header_byte_admission_before_json(monkeypatch):
    import meducation_api.content_policy as policy

    real = policy_limits()
    with TestClient(http_app()) as client:
        assert client.post("/api/admin/test-policy", json=candidate()).status_code == 200
        response = client.post(
            "/api/admin/test-policy",
            content=b"{}",
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(real["requestBytes"] + 1),
            },
        )
        assert response.status_code == 413
        assert (
            client.post(
                "/api/admin/test-policy",
                content=b"{}",
                headers={"Content-Type": "application/json", "Content-Encoding": "gzip"},
            ).status_code
            == 415
        )
        # A small configured limit exercises crossing a stream boundary without 64 MiB allocation.
        monkeypatch.setattr(policy, "policy_limits", lambda: {**real, "requestBytes": 16})
        response = client.post(
            "/api/admin/test-policy",
            content=iter([b" " * 10, b" " * 10]),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "body_limit"


@pytest.mark.parametrize(
    "value,code",
    [
        ("x" * 65537, "string_limit"),
        ([0] * 32769, "array_limit"),
        ({str(i): i for i in range(65)}, "object_limit"),
    ],
)
def test_resource_limits(value, code):
    with pytest.raises(ContentPolicyError) as caught:
        parse_json(json.dumps(value).encode())
    assert caught.value.code == code


def test_validation_serializes_captured_pair_even_if_caller_mutates_during_worker(monkeypatch):
    import meducation_api.content_policy as policy

    pair = candidate()
    original = copy.deepcopy(pair)
    real_run = policy.subprocess.run

    def mutate_after_validation(*args, **kwargs):
        assert set(kwargs["env"]) == {"CONTENT_IMAGE_ORIGINS"}
        result = real_run(*args, **kwargs)
        pair["quizzes"]["questions"][0]["stem"] = "<script>changed while worker ran</script>"
        return result

    monkeypatch.setattr(policy.subprocess, "run", mutate_after_validation)
    valid = PairedContentValidator().validate(pair)
    assert json.loads(valid.quiz_artifact) == original["quizzes"]


def test_resource_errors_locate_known_fields_without_echoing_unknown_keys():
    pair = candidate()
    pair["quizzes"]["questions"][0]["stem"] = "x" * 65537
    with pytest.raises(ContentPolicyError) as caught:
        PairedContentValidator().validate(pair)
    assert caught.value.issues[0].path == "$.pair.quizzes.questions[0].stem"

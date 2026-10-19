"""Bounded, non-normalizing paired authoring validation before any write transaction."""

import asyncio
import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from threading import BoundedSemaphore
from typing import Any

from fastapi import Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from meducation_api.repositories.question_bank import Bank, FlashcardBank

_RESOURCES = Path(__file__).parent
_SLOTS = BoundedSemaphore(2)
_BODY_SLOTS = BoundedSemaphore(2)
_FORBIDDEN = {"__proto__", "prototype", "constructor"}
_SCHEMA_KEYS = {
    "schemaVersion",
    "subjects",
    "topics",
    "quizzes",
    "questions",
    "decks",
    "cards",
    "id",
    "name",
    "accent",
    "subjectId",
    "topicId",
    "quizId",
    "deckId",
    "stem",
    "rationale",
    "choices",
    "text",
    "answer",
    "rationaleMeta",
    "sources",
    "pearls",
    "metadata",
    "topic",
    "subtopic",
    "system",
    "difficulty",
    "questionType",
    "tags",
    "description",
    "front",
    "back",
}


def _error_path(location: tuple[str | int, ...]) -> str:
    path = "$.pair"
    for item in location:
        if type(item) is int:
            path += f"[{item}]"
        elif item in _SCHEMA_KEYS or item == "flashcards":
            path += "." + str(item)
        else:
            break
    return path


@dataclass(frozen=True)
class PolicyIssue:
    path: str
    code: str
    message: str


class ContentPolicyError(ValueError):
    def __init__(
        self, status: int, code: str, issues: tuple[PolicyIssue, ...] = (), total_issues: int = 0
    ):
        super().__init__("Paired content validation rejected input.")
        self.status = status
        self.code = code
        self.issues = issues
        self.total_issues = total_issues

    def response(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": str(self),
                "issues": [vars(issue) for issue in self.issues],
                "totalIssues": self.total_issues,
                "truncated": self.total_issues > len(self.issues),
            }
        }


def artifact_text(value: Any) -> str:
    """The deterministic stored-artifact serialization shared by releases and the draft."""
    return json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n"


@dataclass(frozen=True)
class ValidatedPair:
    # Immutable artifact strings; do not return mutable parsed objects as validation proof.
    quiz_artifact: str
    flashcard_artifact: str
    policy_version: int
    warnings: int


def policy_limits() -> dict[str, int]:
    try:
        limits: dict[str, int] = json.loads((_RESOURCES / "limits.json").read_bytes())
        return limits
    except OSError, ValueError:
        raise ContentPolicyError(503, "content_policy_unavailable") from None


def _reject(path: str, code: str, message: str, status: int = 422) -> None:
    raise ContentPolicyError(status, code, (PolicyIssue(path, code, message),), 1)


def _object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            _reject("$.pair", "duplicate_key", "Duplicate JSON keys are forbidden.", 400)
        if key in _FORBIDDEN:
            _reject("$.pair", "dangerous_key", "Reserved object keys are forbidden.")
        result[key] = value
    return result


def _constant(value: str) -> None:
    _reject("$.pair", "invalid_json", "JSON numbers must be finite.", 400)


def _depth_before_parse(body: bytes, maximum: int) -> None:
    depth, quoted, escaped = 0, False, False
    for byte in body:
        if quoted:
            if escaped:
                escaped = False
            elif byte == 92:
                escaped = True
            elif byte == 34:
                quoted = False
        elif byte == 34:
            quoted = True
        elif byte in (91, 123):
            depth += 1
            if depth > maximum + 1:
                _reject("$.pair", "depth_limit", "Content nesting exceeds the limit.")
        elif byte in (93, 125):
            depth -= 1


def parse_json(body: bytes) -> Any:
    """Byte/depth admission precedes JSON/Pydantic allocation, including chunked bodies."""
    limits = policy_limits()
    if len(body) > limits["requestBytes"]:
        _reject("$", "body_limit", "Request exceeds the 64 MiB limit.", 413)
    _depth_before_parse(body, limits["maxDepth"])
    try:
        value = json.loads(
            body.decode("utf-8"), object_pairs_hook=_object, parse_constant=_constant
        )
        _resources(value, limits)
        return value
    except (UnicodeError, ValueError, RecursionError, OverflowError) as error:
        if isinstance(error, ContentPolicyError):
            raise
        _reject("$", "invalid_json", "Request must contain valid UTF-8 JSON.", 400)


def _resources(value: Any, limits: dict[str, int]) -> None:
    pending = [(value, 0, "$.pair")]
    nodes = 0
    while pending:
        item, depth, path = pending.pop()
        nodes += 1
        if nodes > limits["maxNodes"]:
            _reject(path, "node_limit", "Content exceeds the node limit.")
        if depth > limits["maxDepth"]:
            _reject(path, "depth_limit", "Content nesting exceeds the limit.")
        if isinstance(item, float) and not math.isfinite(item):
            _reject(path, "invalid_number", "Numbers must be finite.")
        if isinstance(item, str):
            if "\0" in item:
                _reject(path, "invalid_text", "Text must not contain NUL.")
            try:
                size = len(item.encode("utf-8"))
            except UnicodeError:
                _reject(path, "invalid_unicode", "Text must contain valid Unicode.")
            if size > limits["maxStringBytes"]:
                _reject(path, "string_limit", "Text exceeds the field limit.")
        elif isinstance(item, list):
            if len(item) > limits["maxArrayLength"]:
                _reject(path, "array_limit", "Collection exceeds the record limit.")
            pending.extend(
                (child, depth + 1, f"{path}[{index}]") for index, child in enumerate(item)
            )
        elif isinstance(item, dict):
            if _FORBIDDEN.intersection(item):
                _reject(path, "dangerous_key", "Reserved object keys are forbidden.")
            if len(item) > limits["maxObjectKeys"]:
                _reject(path, "object_limit", "Object exceeds the field limit.")
            for key, child in item.items():
                child_path = (
                    path + "." + key if key in _SCHEMA_KEYS or key == "flashcards" else path
                )
                pending.append((child, depth + 1, child_path))
                pending.append((key, depth + 1, path))


async def read_json_body(request: Request, limit: int | None = None) -> Any:
    if not _BODY_SLOTS.acquire(blocking=False):
        raise ContentPolicyError(503, "content_policy_busy")
    try:
        return await _read_json_body(request, limit or policy_limits()["requestBytes"])
    finally:
        _BODY_SLOTS.release()


async def _read_json_body(request: Request, limit: int) -> Any:
    """Call after authorization; never let FastAPI parse an unbounded admin body."""
    if request.headers.get("content-encoding", "identity") != "identity":
        raise ContentPolicyError(415, "unsupported_encoding")
    if (
        request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        != "application/json"
    ):
        raise ContentPolicyError(415, "json_required")
    length = request.headers.get("content-length")
    if length is not None:
        if not length.isascii() or not length.isdecimal():
            raise ContentPolicyError(400, "invalid_content_length")
        if len(length) > 12 or int(length) > limit:
            _reject("$", "body_limit", "Request exceeds the 64 MiB limit.", 413)
    body = bytearray()
    try:
        async with asyncio.timeout(30):
            async for chunk in request.stream():
                if len(body) + len(chunk) > limit:
                    _reject("$", "body_limit", "Request exceeds the route body limit.", 413)
                body.extend(chunk)
    except ClientDisconnect:
        raise ContentPolicyError(400, "body_incomplete") from None
    except TimeoutError:
        raise ContentPolicyError(408, "body_timeout") from None
    if length is not None and int(length) != len(body):
        raise ContentPolicyError(400, "invalid_content_length")
    return await run_in_threadpool(parse_json, bytes(body))


class PairedContentValidator:
    def __init__(self, *, image_origins: str = ""):
        # Configuration only; never take policy origins, executable or paths from requests.
        self.image_origins = image_origins

    def validate(self, pair: Any) -> ValidatedPair:
        if not _SLOTS.acquire(blocking=False):
            raise ContentPolicyError(503, "content_policy_busy")
        try:
            return self._validate_admitted(pair)
        finally:
            _SLOTS.release()

    def _validate_admitted(self, pair: Any) -> ValidatedPair:
        limits = policy_limits()
        try:
            _resources(pair, limits)
            if not isinstance(pair, dict) or set(pair) != {"quizzes", "flashcards"}:
                _reject("$.pair", "invalid_pair", "Both stored banks are required.")
            payload = json.dumps(
                pair, ensure_ascii=False, allow_nan=False, separators=(",", ":")
            ).encode("utf-8")
            # Capture one private immutable-by-ownership pair before any asynchronous work.
            pair = parse_json(payload)
            for name, model in (("quizzes", Bank), ("flashcards", FlashcardBank)):
                try:
                    model.model_validate(pair[name], strict=True)
                except ValidationError as error:
                    issues = tuple(
                        PolicyIssue(
                            _error_path((name, *entry["loc"])),
                            "stored_contract",
                            "Stored content violates schema or references.",
                        )
                        for entry in error.errors(include_input=False)[: limits["maxIssues"]]
                    )
                    raise ContentPolicyError(
                        422, "invalid_content", issues, error.error_count()
                    ) from None
        except (UnicodeError, ValueError, RecursionError) as error:
            if isinstance(error, ContentPolicyError):
                raise
            _reject("$.pair", "invalid_content", "Content must contain valid JSON values.")
        if len(payload) > limits["requestBytes"]:
            _reject("$.pair", "body_limit", "Pair exceeds the 64 MiB limit.", 413)
        worker = _RESOURCES / "worker.mjs"
        node = shutil.which("node")
        if node is None or not worker.is_file():
            raise ContentPolicyError(503, "content_policy_unavailable")
        try:
            checked = subprocess.run(
                [node, f"--max-old-space-size={limits['workerMemoryMiB']}", str(worker)],
                input=payload,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=limits["workerSeconds"],
                check=False,
                # No secrets/hosted credentials are inherited by the parser process.
                env={"CONTENT_IMAGE_ORIGINS": self.image_origins},
            )
            if checked.returncode or len(checked.stdout) > 256 * 1024:
                raise ContentPolicyError(503, "content_policy_unavailable")
            result = json.loads(checked.stdout)
            if result["policyVersion"] != limits["policyVersion"]:
                raise ContentPolicyError(503, "content_policy_unavailable")
            issues = tuple(PolicyIssue(**issue) for issue in result["issues"])
            if result["totalIssues"]:
                raise ContentPolicyError(422, "invalid_content", issues, result["totalIssues"])
            # Serialize original validated objects, never Pydantic model defaults.
            return ValidatedPair(
                quiz_artifact=artifact_text(pair["quizzes"]),
                flashcard_artifact=artifact_text(pair["flashcards"]),
                policy_version=limits["policyVersion"],
                warnings=result["warnings"],
            )
        except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError) as error:
            if isinstance(error, ContentPolicyError):
                raise
            raise ContentPolicyError(503, "content_policy_unavailable") from None

    def documents(self, quiz_text: str, flashcard_text: str) -> ValidatedPair:
        # Both documents have independent strict JSON parsing; pair total is checked too.
        try:
            quiz_bytes, flashcard_bytes = quiz_text.encode("utf-8"), flashcard_text.encode("utf-8")
        except UnicodeError:
            _reject("$.pair", "invalid_unicode", "Text must contain valid Unicode.")
        return self.validate(
            {"quizzes": parse_json(quiz_bytes), "flashcards": parse_json(flashcard_bytes)}
        )

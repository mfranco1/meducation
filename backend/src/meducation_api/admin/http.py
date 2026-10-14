"""Private paired HTTP operations behind the verified session prefix boundary."""

import base64
import json
import tempfile
import zipfile
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import Engine
from starlette.concurrency import run_in_threadpool

from meducation_api.admin.contracts import (
    Candidate,
    ContextCommand,
    Export,
    Mutation,
    Publish,
    Reservation,
    Save,
    Undo,
    parse_contract,
    uuid_value,
)
from meducation_api.admin.service import EditorService, digests, wire_result
from meducation_api.auth.config import AuthSettings
from meducation_api.auth.oidc import AuthError
from meducation_api.content_policy import ContentPolicyError, read_json_body
from meducation_api.db.engine import create_database_engine, database_url


def install_editor(app: FastAPI, config: AuthSettings) -> None:
    engine: Engine | None = None
    if config.enabled:
        assert config.editor_database_url is not None
        engine = create_database_engine(
            database_url(
                config.editor_database_url,
                role="meducation_editor",
                local=config.environment == "local",
            )
        )
    app.state.editor_engine = engine

    def service(request: Request) -> EditorService:
        if engine is None:
            raise AuthError(503, "admin_disabled")
        return EditorService(engine, request.app.state.auth.store, request.state.principal)

    async def command(request: Request, cls: type[Any]) -> dict[str, Any]:
        return parse_contract(cls, await read_json_body(request))

    def identifier(value: str) -> str:
        try:
            return uuid_value(value)
        except ValueError:
            raise AuthError(400, "invalid_identifier") from None

    @app.exception_handler(ContentPolicyError)
    async def content_error(request: Request, error: ContentPolicyError) -> JSONResponse:
        data = error.response()
        data["error"]["requestId"] = str(uuid4())
        return JSONResponse(data, status_code=error.status, headers={"Cache-Control": "no-store"})

    @app.get("/api/admin/draft", include_in_schema=False)
    def load(request: Request) -> dict[str, Any]:
        return service(request).load()

    @app.post("/api/admin/reservations", include_in_schema=False)
    async def reserve(request: Request) -> dict[str, Any]:
        value = await command(request, Reservation)
        return await run_in_threadpool(service(request).mutate, "reserve", value)

    @app.post("/api/admin/draft/preview", include_in_schema=False)
    async def preview(request: Request) -> dict[str, Any]:
        return await run_in_threadpool(
            service(request).preview, "save", await command(request, Candidate)
        )

    @app.post("/api/admin/draft/save", include_in_schema=False)
    async def save(request: Request) -> dict[str, Any]:
        return await run_in_threadpool(
            service(request).mutate, "save", await command(request, Save)
        )

    @app.post("/api/admin/draft/undo", include_in_schema=False)
    async def undo(request: Request) -> dict[str, Any]:
        return await run_in_threadpool(
            service(request).mutate, "undo", await command(request, Undo)
        )

    @app.post("/api/admin/draft/reset", include_in_schema=False)
    async def reset(request: Request) -> dict[str, Any]:
        return await run_in_threadpool(
            service(request).mutate, "reset", await command(request, Mutation)
        )

    @app.post("/api/admin/publish/preview", include_in_schema=False)
    async def publication_preview(request: Request) -> dict[str, Any]:
        return await run_in_threadpool(
            service(request).preview, "publish", await command(request, ContextCommand)
        )

    @app.post("/api/admin/publish", include_in_schema=False)
    async def publish(request: Request) -> dict[str, Any]:
        return await run_in_threadpool(
            service(request).mutate, "publish", await command(request, Publish)
        )

    @app.post("/api/admin/releases/{release_id}/activation-preview", include_in_schema=False)
    async def activation_preview(release_id: str, request: Request) -> dict[str, Any]:
        return await run_in_threadpool(
            service(request).preview,
            "activate",
            await command(request, ContextCommand),
            release_id=identifier(release_id),
        )

    @app.post("/api/admin/releases/{release_id}/activate", include_in_schema=False)
    async def activate(release_id: str, request: Request) -> dict[str, Any]:
        return await run_in_threadpool(
            service(request).mutate,
            "activate",
            await command(request, Publish),
            release_id=identifier(release_id),
        )

    @app.get("/api/admin/releases", include_in_schema=False)
    def releases(request: Request) -> dict[str, Any]:
        if set(request.query_params) - {"cursor", "limit"} or len(
            list(request.query_params.multi_items())
        ) != len(request.query_params):
            raise AuthError(400, "invalid_pagination")
        arg: dict[str, Any] = {"limit": 20}
        try:
            if "limit" in request.query_params:
                raw = request.query_params["limit"]
                if not raw.isascii() or not raw.isdecimal() or not 1 <= int(raw) <= 50:
                    raise ValueError
                arg["limit"] = int(raw)
            if "cursor" in request.query_params:
                raw = request.query_params["cursor"]
                if len(raw) > 100:
                    raise ValueError
                arg["cursor"] = identifier(base64.urlsafe_b64decode(raw + "===").decode())
        except ValueError, UnicodeError:
            raise AuthError(400, "invalid_pagination") from None
        result = service(request).read("releases", arg)
        rows = result["releases"]
        result["nextCursor"] = (
            base64.urlsafe_b64encode(rows[-1]["releaseId"].encode()).decode().rstrip("=")
            if len(rows) == arg["limit"]
            else None
        )
        return result

    @app.get("/api/admin/operations/{operation_id}", include_in_schema=False)
    def operation(operation_id: str, request: Request) -> dict[str, Any]:
        try:
            value = service(request).read("operation", {"operationId": identifier(operation_id)})
        except AuthError as error:
            if error.status == 404:
                raise AuthError(404, "operation_not_found") from None
            raise
        return {
            "operationId": operation_id,
            "action": value["action"],
            "fingerprint": value["fingerprint"],
            "result": wire_result(value["result"]["result"]),
        }

    def archive(svc: EditorService, value: dict[str, Any]) -> tuple[Any, str]:
        ctx = svc.context()
        if value["target"] == "draft":
            svc.expected(ctx, value)
            if ctx["revision"] != value["draftRevision"]:
                raise AuthError(409, "draft_or_publication_stale")
            selected = ctx
        else:
            selected = svc.read("release", {"releaseId": value["releaseId"]})
        pair = svc.validator.documents(selected["quizDocument"], selected["flashcardDocument"])
        revisions = selected["digests"]
        q, f = pair.quiz_artifact, pair.flashcard_artifact
        parsed = [json.loads(q), json.loads(f)]
        ids = {
            k: [row["id"] for row in parsed[index][k]]
            for index, keys in ((0, ("subjects", "quizzes", "questions")), (1, ("decks", "cards")))
            for k in keys
        }
        manifest = {
            "contractVersion": 1,
            "target": value["target"],
            "unpublished": value["target"] == "draft",
            "releaseId": None if value["target"] == "draft" else value["releaseId"],
            "draftRevision": ctx["revision"] if value["target"] == "draft" else None,
            "baseReleaseId": ctx["baseReleaseId"] if value["target"] == "draft" else None,
            "basePublicationSequence": ctx["baseSequence"] if value["target"] == "draft" else None,
            "publication": {
                "releaseId": ctx["releaseId"],
                "sequence": ctx["sequence"],
                "selectedIsCurrent": value["target"] == "release"
                and ctx["releaseId"] == value["releaseId"],
            },
            "schemas": {"quizzes": 4, "flashcards": 2},
            "ids": ids,
            "digests": digests(q, f, revisions),
            "validation": {"policyVersion": pair.policy_version, "warnings": pair.warnings},
        }
        files = {
            "questionBank.generated.json": q.encode(),
            "flashcardBank.generated.json": f.encode(),
            "manifest.json": (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode(),
        }
        if sum(len(data) for data in files.values()) > 128 * 1024 * 1024:
            raise AuthError(413, "export_limit")
        stream = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+b")  # noqa: SIM115 - ownership transfers to response iterator
        try:
            with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as zipped:
                for name in sorted(files):
                    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                    info.external_attr = 0o600 << 16
                    zipped.writestr(info, files[name])
            if stream.tell() > 128 * 1024 * 1024:
                raise AuthError(413, "export_limit")
            svc.store.recheck(svc.principal, fresh=True)
            stream.seek(0)
            return stream, "meducation-" + value["target"] + ".zip"
        except BaseException:
            stream.close()
            raise

    @app.post("/api/admin/exports", include_in_schema=False)
    async def export(request: Request) -> StreamingResponse:
        value = await command(request, Export)
        stream, filename = await run_in_threadpool(archive, service(request), value)

        def chunks() -> Iterator[bytes]:
            try:
                while data := stream.read(65536):
                    yield data
            finally:
                stream.close()

        return StreamingResponse(
            chunks(),
            media_type="application/zip",
            headers={
                "Content-Disposition": 'attachment; filename="' + filename + '"',
                "Cache-Control": "no-store",
            },
        )

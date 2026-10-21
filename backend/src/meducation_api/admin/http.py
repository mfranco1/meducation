"""Private record-editor HTTP routes behind the verified session prefix boundary."""

import base64
import hashlib
import json
import re
import tempfile
import zipfile
from collections.abc import Iterator
from typing import Any
from uuid import UUID

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import Engine
from starlette.concurrency import run_in_threadpool

from meducation_api.admin.contracts import (
    BULK_BYTES,
    RECORD_BYTES,
    Activate,
    Bulk,
    Contract,
    Create,
    Delete,
    Empty,
    Export,
    Move,
    Revert,
    Update,
    parse_contract,
    uuid_value,
)
from meducation_api.admin.service import MISSING, DraftError, DraftService
from meducation_api.auth.config import AuthSettings
from meducation_api.auth.oidc import AuthError
from meducation_api.content_policy import ContentPolicyError, read_json_body
from meducation_api.db.draft import KINDS, Kind
from meducation_api.db.engine import create_database_engine, database_url

BULK_PARENTS = {("quizzes", "questions"), ("decks", "cards")}


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

    def service(request: Request) -> DraftService:
        if engine is None:
            raise AuthError(503, "admin_disabled")
        return DraftService(engine, request.app.state.auth.store, request.state.principal)

    async def command(
        request: Request, cls: type[Contract], limit: int = RECORD_BYTES
    ) -> tuple[dict[str, Any], set[str]]:
        return parse_contract(cls, await read_json_body(request, limit))

    def kind_of(name: str) -> Kind:
        if name not in KINDS:
            raise DraftError(404, "route_not_found", "Unknown record kind.")
        return KINDS[name]

    def identifier(value: str) -> str:
        if not re.fullmatch(r"[a-zA-Z0-9-]{1,128}", value):
            raise AuthError(400, "invalid_identifier")
        return value

    def after(value: dict[str, Any], sent: set[str]) -> Any:
        return value["afterId"] if "afterId" in sent else MISSING

    @app.exception_handler(ContentPolicyError)
    async def content_error(request: Request, error: ContentPolicyError) -> JSONResponse:
        data = error.response()
        data["error"]["requestId"] = request.state.request_id
        return JSONResponse(data, status_code=error.status, headers={"Cache-Control": "no-store"})

    @app.exception_handler(DraftError)
    async def draft_error(request: Request, error: DraftError) -> JSONResponse:
        return JSONResponse(
            {
                "error": {
                    "code": error.code,
                    "message": str(error),
                    "requestId": request.state.request_id,
                    **error.extra,
                }
            },
            status_code=error.status,
            headers={"Cache-Control": "no-store"},
        )

    def no_store(value: dict[str, Any]) -> JSONResponse:
        return JSONResponse(value, headers={"Cache-Control": "no-store"})

    @app.get("/api/admin/draft", include_in_schema=False)
    async def load(request: Request) -> Response:
        return no_store(await run_in_threadpool(service(request).snapshot))

    @app.get("/api/admin/draft/diff", include_in_schema=False)
    async def diff(request: Request) -> Response:
        return no_store(await run_in_threadpool(service(request).diff, 200))

    @app.get("/api/admin/draft/changes", include_in_schema=False)
    async def changes(request: Request) -> dict[str, Any]:
        params = dict(request.query_params)
        if set(params) - {"since", "limit"} or len(params) != len(
            list(request.query_params.multi_items())
        ):
            raise AuthError(400, "invalid_pagination")
        values = {"since": 0, "limit": 500}
        for key, raw in params.items():
            if not raw.isascii() or not raw.isdecimal() or len(raw) > 18:
                raise AuthError(400, "invalid_pagination")
            values[key] = int(raw)
        if not 1 <= values["limit"] <= 1000:
            raise AuthError(400, "invalid_pagination")
        return await run_in_threadpool(service(request).changes, values["since"], values["limit"])

    @app.post("/api/admin/draft/changes/{change_id}/revert", include_in_schema=False)
    async def revert(change_id: str, request: Request) -> dict[str, Any]:
        if not change_id.isascii() or not change_id.isdecimal() or len(change_id) > 18:
            raise AuthError(400, "invalid_identifier")
        value, _ = await command(request, Revert)
        return await run_in_threadpool(
            service(request).revert, int(change_id), value["expectedVersion"]
        )

    @app.post("/api/admin/draft/discard", include_in_schema=False)
    async def discard(request: Request) -> Response:
        await command(request, Empty)
        return no_store(await run_in_threadpool(service(request).discard))

    @app.post("/api/admin/draft/publish", include_in_schema=False)
    async def publish(request: Request) -> dict[str, Any]:
        await command(request, Empty)
        return await run_in_threadpool(service(request).publish)

    @app.post("/api/admin/draft/{parent}/{parent_id}/{child}/bulk", include_in_schema=False)
    async def bulk(parent: str, parent_id: str, child: str, request: Request) -> JSONResponse:
        if (parent, child) not in BULK_PARENTS:
            raise DraftError(404, "route_not_found", "Bulk create is for questions and cards.")
        value, sent = await command(request, Bulk, BULK_BYTES)
        result = await run_in_threadpool(
            service(request).bulk,
            KINDS[child],
            identifier(parent_id),
            after(value, sent),
            value["records"],
        )
        return JSONResponse(result, status_code=201)

    @app.post("/api/admin/draft/{kind}", include_in_schema=False)
    async def create(kind: str, request: Request) -> JSONResponse:
        record_kind = kind_of(kind)
        value, sent = await command(request, Create)
        result = await run_in_threadpool(
            service(request).create,
            record_kind,
            value["parentId"],
            after(value, sent),
            value["fields"],
        )
        return JSONResponse(result, status_code=201)

    @app.put("/api/admin/draft/{kind}/{record_id}", include_in_schema=False)
    async def update(kind: str, record_id: str, request: Request) -> dict[str, Any]:
        record_kind = kind_of(kind)
        value, _ = await command(request, Update)
        return await run_in_threadpool(
            service(request).update,
            record_kind,
            identifier(record_id),
            value["expectedVersion"],
            value["fields"],
        )

    @app.delete("/api/admin/draft/{kind}/{record_id}", include_in_schema=False)
    async def delete(kind: str, record_id: str, request: Request) -> dict[str, Any]:
        record_kind = kind_of(kind)
        value, _ = await command(request, Delete)
        return await run_in_threadpool(
            service(request).delete,
            record_kind,
            identifier(record_id),
            value["expectedVersion"],
            value["cascade"],
        )

    @app.post("/api/admin/draft/{kind}/{record_id}/move", include_in_schema=False)
    async def move(kind: str, record_id: str, request: Request) -> dict[str, Any]:
        record_kind = kind_of(kind)
        value, sent = await command(request, Move)
        return await run_in_threadpool(
            service(request).move,
            record_kind,
            identifier(record_id),
            value["expectedVersion"],
            value["parentId"],
            after(value, sent),
        )

    @app.post("/api/admin/releases/{release_id}/activate", include_in_schema=False)
    async def activate(release_id: str, request: Request) -> dict[str, Any]:
        try:
            target = UUID(uuid_value(release_id))
        except ValueError:
            raise AuthError(400, "invalid_identifier") from None
        value, _ = await command(request, Activate)
        return await run_in_threadpool(
            service(request).activate, target, value["expectedPublicationSequence"]
        )

    @app.get("/api/admin/releases", include_in_schema=False)
    async def releases(request: Request) -> dict[str, Any]:
        if set(request.query_params) - {"cursor", "limit"} or len(
            list(request.query_params.multi_items())
        ) != len(request.query_params):
            raise AuthError(400, "invalid_pagination")
        limit, cursor = 20, None
        try:
            if "limit" in request.query_params:
                raw = request.query_params["limit"]
                if not raw.isascii() or not raw.isdecimal() or not 1 <= int(raw) <= 50:
                    raise ValueError
                limit = int(raw)
            if "cursor" in request.query_params:
                raw = request.query_params["cursor"]
                if len(raw) > 100:
                    raise ValueError
                cursor = uuid_value(base64.urlsafe_b64decode(raw + "===").decode())
        except ValueError, UnicodeError:
            raise AuthError(400, "invalid_pagination") from None
        result = await run_in_threadpool(service(request).releases, limit, cursor)
        rows = result["releases"]
        result["nextCursor"] = (
            base64.urlsafe_b64encode(rows[-1]["releaseId"].encode()).decode().rstrip("=")
            if len(rows) == limit
            else None
        )
        return result

    def archive(svc: DraftService, value: dict[str, Any]) -> tuple[Any, str]:
        q, f, context = svc.export_pair(value["releaseId"])
        parsed = [json.loads(q), json.loads(f)]
        ids = {
            k: [row["id"] for row in rows]
            for document in parsed
            for k, rows in document.items()
            if k != "schemaVersion"
        }
        draft = value["target"] == "draft"
        manifest = {
            "contractVersion": 2,
            "target": value["target"],
            "unpublished": draft,
            "releaseId": value["releaseId"],
            "latestChangeId": context.get("latestChangeId"),
            "baseReleaseId": context.get("baseReleaseId"),
            "publication": context["publication"],
            "schemas": {
                "quizzes": parsed[0]["schemaVersion"],
                "flashcards": parsed[1]["schemaVersion"],
            },
            "ids": ids,
            "digests": {
                "quizSha256": hashlib.sha256(q.encode()).hexdigest(),
                "flashcardSha256": hashlib.sha256(f.encode()).hexdigest(),
                **context["revisions"],
            },
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
        value, _ = await command(request, Export)
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

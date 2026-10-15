"""Explicit read-only dependency checks using existing role pools and auth guard."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import Connection, Engine
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.auth.http import read_empty_private_body
from meducation_api.db.migrate import migration_head
from meducation_api.operations import database_failure, dependency_result
from meducation_api.settings import Settings


def limits(connection: Connection) -> None:
    connection.exec_driver_sql("SET TRANSACTION READ ONLY")
    connection.exec_driver_sql("SET LOCAL statement_timeout = '10s'")
    connection.exec_driver_sql("SET LOCAL lock_timeout = '3s'")


def inspect_dependencies(request: Request, config: Settings) -> tuple[dict[str, Any], int]:
    result: dict[str, Any] = {
        "reader": {
            "connectivity": "not_applicable",
            "schema": "not_applicable",
            "publication": "not_applicable",
        },
        "session": "not_checked",
        "editor": "not_checked",
    }
    healthy = True
    source = request.app.state.source
    from meducation_api.repositories.postgres import PostgresContentSource

    reader = result["reader"] = {
        "connectivity": "unavailable",
        "schema": "not_checked",
        "publication": "not_checked",
    }
    phase = "connectivity"
    try:
        if not isinstance(source, PostgresContentSource):
            return result, 503
        with source.runtime.engine.connect() as connection:
            limits(connection)
            connection.exec_driver_sql("SELECT 1").scalar_one()
            reader["connectivity"] = "ok"
            phase = "schema"
            version = int(connection.exec_driver_sql("SHOW server_version_num").scalar_one())
            heads: list[str] = list(
                connection.exec_driver_sql(
                    "SELECT version_num FROM content.schema_version"
                ).scalars()
            )
            reader["schema"] = (
                "ok"
                if 170000 <= version < 180000 and heads == [migration_head()]
                else "unsupported"
            )
            if reader["schema"] == "ok":
                phase = "publication"
                publication = connection.exec_driver_sql(
                    "SELECT p.release_id FROM content.active_publication p JOIN content.published_releases r USING (release_id) WHERE p.publication_sequence>0"
                ).scalar_one_or_none()
                reader["publication"] = "ok" if publication is not None else "missing"
            healthy = reader["schema"] == reader["publication"] == "ok"
            dependency_result("reader", "ok" if healthy else "database_failure")
    except SQLAlchemyError as error:
        reader[phase] = "unavailable"
        database_failure("reader", error)
        healthy = False
    # Authorization already owns a session connection: never nest a pool checkout.
    try:
        request.state.principal.connection.exec_driver_sql("SELECT 1").scalar_one()
        result["session"] = "ok"
        dependency_result("session")
    except SQLAlchemyError as error:
        database_failure("session", error)
        result["session"], healthy = "unavailable", False
    editor: Engine | None = request.app.state.editor_engine
    try:
        if editor is not None:
            with editor.connect() as connection:
                limits(connection)
                connection.exec_driver_sql("SELECT 1").scalar_one()
            result["editor"] = "ok"
            dependency_result("editor")
        else:
            result["editor"], healthy = "unavailable", False
    except SQLAlchemyError as error:
        database_failure("editor", error)
        result["editor"], healthy = "unavailable", False
    return result, 200 if healthy else 503


def install_diagnostics(app: FastAPI, config: Settings) -> None:
    from starlette.concurrency import run_in_threadpool

    @app.post("/api/admin/diagnostics", include_in_schema=False)
    async def diagnostics(request: Request) -> JSONResponse:
        await read_empty_private_body(request)
        result, status = await run_in_threadpool(inspect_dependencies, request, config)
        return JSONResponse(
            {"dependencies": result}, status_code=status, headers={"Cache-Control": "no-store"}
        )

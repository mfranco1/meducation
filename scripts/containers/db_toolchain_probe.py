"""Executed inside the installed API image against an isolated PG17 server."""

import asyncio
import hashlib
import importlib.metadata
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import psycopg
from alembic import command
from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import (
    ContentDatabaseError,
    create_database_engine,
    database_url,
)
from meducation_api.db.migrate import migration_config, migration_head, upgrade
from meducation_api.db.runtime import PostgresRuntime
from meducation_api.main import create_app
from meducation_api.settings import Settings
from pydantic import SecretStr
from sqlalchemy import URL, text
from sqlalchemy.exc import SQLAlchemyError


def run_probe():
    assert psycopg.pq.__impl__ == "binary"
    assert migration_head() == "0004_editor_operations"
    config = migration_config()
    packaged = Path(config.get_main_option("script_location"))
    assert (
        packaged.joinpath("env.py").is_file()
        and packaged.joinpath("versions/__init__.py").is_file()
    )
    assert not Path("/app/backend").exists(), "Probe must use installed wheel resources"
    passwords = RolePasswords(_env_file=None)
    bootstrap_password = os.environ["MEDUCATION_SMOKE_BOOTSTRAP_PASSWORD"]

    def engine_for(role):
        password = (
            bootstrap_password
            if role == "meducation_bootstrap"
            else getattr(
                passwords, role.removeprefix("meducation_") + "_password"
            ).get_secret_value()
        )
        url = URL.create(
            "postgresql+psycopg",
            username=role,
            password=password,
            host="postgres",
            database="meducation",
            query={"sslmode": "disable"},
        )
        return create_database_engine(url, operator=role != "meducation_reader")

    admin = engine_for("meducation_bootstrap")
    migrator = engine_for("meducation_migrator")
    reader = engine_for("meducation_reader")
    backup = engine_for("meducation_backup")
    operator = engine_for("meducation_operator")
    engines = [admin, migrator, reader, backup, operator]

    def denied(engine, statement):
        try:
            with engine.begin() as connection:
                connection.exec_driver_sql(statement)
        except SQLAlchemyError:
            return
        raise AssertionError("Unexpected permission for " + statement.split()[0])

    try:
        bootstrap_env = {
            **os.environ,
            "MEDUCATION_DATABASE_ENVIRONMENT": "local",
            "MEDUCATION_BOOTSTRAP_DATABASE_URL": admin.url.render_as_string(
                hide_password=False
            ),
        }
        result = subprocess.run(
            ["python", "-m", "meducation_api.db.cli", "bootstrap-local"],
            env=bootstrap_env,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, "Explicit local bootstrap command failed"
        assert bootstrap_password not in result.stdout + result.stderr
        bootstrap(admin, passwords)  # Explicit reconciliation is repeatable.
        with admin.begin() as connection:
            connection.exec_driver_sql("GRANT meducation_owner TO meducation_reader")
        try:
            try:
                bootstrap(admin, passwords)
            except ContentDatabaseError as error:
                assert "unexpected memberships" in str(error)
            else:
                raise AssertionError("Unsafe preexisting membership was accepted")
        finally:
            with admin.begin() as connection:
                connection.exec_driver_sql(
                    "REVOKE meducation_owner FROM meducation_reader"
                )
        with admin.connect() as connection:
            version = connection.exec_driver_sql("SHOW server_version_num").scalar_one()
            attrs = connection.exec_driver_sql(
                "SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls "
                "FROM pg_roles WHERE rolname IN ('meducation_reader','meducation_backup','meducation_operator','meducation_migrator')"
            ).all()
            assert len(attrs) == 4 and all(not any(row[1:]) for row in attrs)

        for engine in (reader, backup, operator):
            with engine.connect() as connection:
                assert connection.exec_driver_sql("SELECT 1").scalar_one() == 1
            denied(engine, "SET ROLE meducation_owner")
            denied(engine, "CREATE TABLE content.forbidden(id int)")
            denied(engine, "CREATE TEMP TABLE forbidden(id int)")
            denied(engine, "CREATE TABLE public.forbidden(id int)")
            denied(engine, "CREATE ROLE forbidden")

        upgrade(migrator)
        upgrade(migrator)
        with reader.connect() as connection:
            assert (
                connection.exec_driver_sql(
                    "SELECT version_num FROM content.schema_version"
                ).scalar_one()
                == "0004_editor_operations"
            )
            assert (
                connection.exec_driver_sql(
                    "SELECT count(*) FROM content.published_releases"
                ).scalar_one()
                == 0
            )

        # A synthetic Alembic revision tests packaged env.py without introducing product schema.
        with tempfile.TemporaryDirectory(
            prefix="meducation-migration-probe-"
        ) as temporary:
            fixture_dir = Path(temporary) / "migrations"
            shutil.copytree(packaged, fixture_dir)
            for revision_file in fixture_dir.joinpath("versions").glob("*.py"):
                if revision_file.name != "__init__.py":
                    revision_file.unlink()
            fixture_dir.joinpath("versions/fixture.py").write_text(
                "from alembic import op\n"
                "revision = 'toolchain_fixture'\ndown_revision = None\n"
                "def upgrade():\n"
                "    op.execute('CREATE TABLE content.toolchain_probe(id bigint PRIMARY KEY, body text, payload jsonb)')\n"
                "    op.execute('CREATE SEQUENCE content.toolchain_sequence')\n"
                "    op.execute(\"CREATE FUNCTION content.toolchain_private() RETURNS int LANGUAGE sql AS 'SELECT 1'\")\n"
                "def downgrade():\n    raise RuntimeError('Disposable probe does not downgrade')\n",
                encoding="utf-8",
            )
            config.set_main_option("script_location", str(fixture_dir))
            config.attributes["version_table"] = "toolchain_alembic_version"
            for _ in range(2):
                with migrator.begin() as connection:
                    connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
                    config.attributes["connection"] = connection
                    command.upgrade(config, "head")
            with backup.connect() as connection:
                assert (
                    connection.exec_driver_sql(
                        "SELECT version_num FROM content.toolchain_alembic_version"
                    ).scalar_one()
                    == "toolchain_fixture"
                )
                assert (
                    connection.exec_driver_sql(
                        "SELECT last_value FROM content.toolchain_sequence"
                    ).scalar_one()
                    == 1
                )
        for engine in (reader, operator):
            denied(engine, "SELECT * FROM content.toolchain_probe")
            denied(engine, "SELECT content.toolchain_private()")
        for engine in (reader, backup, operator):
            denied(
                engine,
                "INSERT INTO content.toolchain_probe VALUES (9, 'forbidden', '{}')",
            )
        denied(backup, "SELECT content.toolchain_private()")

        with migrator.begin() as connection:
            connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
            value = "Unicode β; $x^2$\n**Markdown**\n"
            payload = {
                "choices": [
                    {"id": "B", "text": "First"},
                    {"id": "A", "text": "Second"},
                ],
                "metadata": {"topic": "β"},
            }
            connection.execute(
                text(
                    "INSERT INTO content.toolchain_probe VALUES (1, :body, CAST(:payload AS jsonb))"
                ),
                {"body": value, "payload": json.dumps(payload)},
            )
        with backup.connect() as connection:
            row = connection.exec_driver_sql(
                "SELECT body, payload FROM content.toolchain_probe WHERE id=1"
            ).one()
            assert row[0] == value and row[1] == payload
        try:
            with migrator.begin() as connection:
                connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
                connection.exec_driver_sql(
                    "INSERT INTO content.toolchain_probe VALUES (2, 'rollback', '{}')"
                )
                raise RuntimeError("rollback fixture")
        except RuntimeError:
            pass
        with backup.connect() as connection:
            assert (
                connection.exec_driver_sql(
                    "SELECT count(*) FROM content.toolchain_probe"
                ).scalar_one()
                == 1
            )

        reader_url = reader.url.render_as_string(hide_password=False)
        settings = Settings(
            _env_file=None,
            content_source="postgres",
            database_environment="local",
            database_url=reader_url,
        )
        runtime = PostgresRuntime(settings)
        try:
            with runtime:
                raise AssertionError("Uninitialized product schema started")
        except ContentDatabaseError as error:
            assert "No JSON fallback" in str(error)
            assert bootstrap_password not in str(error)
        assert runtime.engine.pool.checkedout() == 0
        assert reader.pool.size() == 2 and reader.pool._max_overflow == 0
        assert reader.pool.checkedout() == 0

        async def rejects_api():
            app = create_app(
                settings,
                repository_factory=lambda _: (_ for _ in ()).throw(
                    AssertionError("JSON fallback")
                ),
            )
            try:
                async with app.router.lifespan_context(app):
                    raise AssertionError("Uninitialized product schema started")
            except ContentDatabaseError:
                pass
            assert app.state.bank is None and app.state.flashcards is None

        asyncio.run(rejects_api())

        # The explicit job can repeat the real schema migration without creating content.
        upgrade(migrator)
        env = {
            **os.environ,
            "MEDUCATION_DATABASE_ENVIRONMENT": "local",
            "MEDUCATION_MIGRATION_DATABASE_URL": migrator.url.render_as_string(
                hide_password=False
            ),
        }
        result = subprocess.run(
            ["python", "-m", "meducation_api.db.cli", "upgrade"],
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0 and "upgraded" in result.stdout
        assert bootstrap_password not in result.stderr
        invalid = database_url(
            SecretStr(reader_url), role="meducation_reader", local=True
        )
        assert invalid.username == "meducation_reader"
        return {
            "server_version_num": version,
            "packages": {
                name: importlib.metadata.version(name)
                for name in ("psycopg", "psycopg-binary", "SQLAlchemy", "alembic")
            },
            "psycopg_implementation": psycopg.pq.__impl__,
            "libpq_version": psycopg.pq.version(),
            "packaged_migration_env_sha256": hashlib.sha256(
                packaged.joinpath("env.py").read_bytes()
            ).hexdigest(),
            "checks": [
                "installed wheel resources",
                "repeatable local bootstrap",
                "unsafe preexisting role membership rejected",
                "role flags/membership/DDL/TEMP isolation",
                "future owner object backup grants",
                "no PUBLIC function execution",
                "synthetic explicit Alembic upgrade/repeat",
                "real packaged content migration upgrade/repeat and reader head view",
                "JSON/text/choice-order round trip",
                "transaction rollback",
                "bounded single reader pool",
                "uninitialized runtime/API refusal and cleanup",
                "explicit repeatable migration CLI",
            ],
            "limitations": "Real product schema plus synthetic toolchain data. Comprehensive actual-bank parity/recovery and DB reverse-proxy/browser acceptance remain Step 6. This smoke does not import authored content. No hosted or native AMD64 claim from ARM64 execution.",
        }
    finally:
        for engine in engines:
            engine.dispose()


if __name__ == "__main__":
    print(json.dumps(run_probe(), indent=2))

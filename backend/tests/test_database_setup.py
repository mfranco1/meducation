"""Fail-closed configuration and lifecycle checks; real PG roles use container smoke."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from sqlalchemy import event, make_url
from sqlalchemy.exc import OperationalError

from meducation_api.db.bootstrap import RolePasswords
from meducation_api.db.engine import ContentDatabaseError, create_database_engine, database_url
from meducation_api.db.migrate import upgrade
from meducation_api.db.runtime import PostgresRuntime
from meducation_api.main import create_app
from meducation_api.settings import Settings

READER = "postgresql+psycopg://meducation_reader:test%40password@127.0.0.1:5433/meducation?sslmode=disable"


@pytest.mark.parametrize(
    "value",
    [
        "garbage-secret",
        "sqlite:///secret.db",
        READER.replace("meducation_reader", "meducation_bootstrap"),
        READER + "&user=meducation_bootstrap",
        READER + "&host=remote.example",
        READER + "&service=other",
        READER + "&gssencmode=prefer",
        READER.replace("127.0.0.1", "remote.example"),
        READER.replace("?sslmode=disable", ""),
    ],
)
def test_runtime_url_rejects_wrong_role_driver_and_local_escape(value: str) -> None:
    with pytest.raises(ValueError) as error:
        database_url(SecretStr(value), role="meducation_reader", local=True)
    assert value not in str(error.value)
    assert "test@password" not in str(error.value)


def test_settings_are_secret_and_fail_closed() -> None:
    with (
        pytest.raises(ContentDatabaseError, match="requires MEDUCATION_DATABASE_URL"),
        TestClient(create_app(Settings(_env_file=None))),
    ):
        pass
    with pytest.raises(ValidationError):
        Settings(_env_file=None, content_source="json")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, content_source="other")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url=READER)
    settings = Settings(
        _env_file=None, content_source="postgres", database_environment="local", database_url=READER
    )
    assert "test@password" not in repr(settings)
    assert "test%40password" not in repr(settings)
    url = database_url(settings.database_url, role="meducation_reader", local=True)
    assert url.password == "test@password"
    assert url == make_url(READER)
    hosted = READER.replace("127.0.0.1", "db.example").replace("disable", "verify-full")
    assert Settings(_env_file=None, database_url=hosted).database_environment == "production"


def test_role_passwords_require_distinct_values() -> None:
    with pytest.raises(ValidationError):
        RolePasswords(
            _env_file=None,
            **{
                f"{role}_password": "repeated-password"
                for role in ("reader", "backup", "operator", "migrator")
            },
        )


def test_connection_parameters_force_tls_path_and_bounded_connect(monkeypatch) -> None:
    monkeypatch.setenv("PGGSSENCMODE", "require")
    engine = create_database_engine(make_url(READER + "&connect_timeout=0"))
    observed = {}

    def intercept(dialect, connection_record, args, params):
        observed.update(params)
        raise RuntimeError("connection intercepted before network")

    event.listen(engine, "do_connect", intercept)
    try:
        with pytest.raises(RuntimeError, match="before network"), engine.connect():
            pytest.fail("Intercepted connection must not proceed")
        assert observed["gssencmode"] == "disable"
        assert observed["connect_timeout"] == 5
    finally:
        engine.dispose()


def test_failed_database_initialization_disposes_engine_without_secret_leak() -> None:
    settings = Settings(
        _env_file=None, content_source="postgres", database_environment="local", database_url=READER
    )
    engine = MagicMock()
    engine.connect.side_effect = OperationalError("secret SQL", {}, Exception(READER))
    with (
        patch("meducation_api.db.runtime.create_database_engine", return_value=engine),
        pytest.raises(ContentDatabaseError) as error,
        PostgresRuntime(settings),
    ):
        pytest.fail("Failed initialization entered the runtime")
    engine.dispose.assert_called_once()
    assert READER not in str(error.value)
    assert "secret SQL" not in str(error.value)


def test_initialized_runtime_disposes_engine_on_body_failure() -> None:
    settings = Settings(
        _env_file=None, content_source="postgres", database_environment="local", database_url=READER
    )
    engine = MagicMock()
    connection = engine.connect.return_value.__enter__.return_value
    connection.exec_driver_sql.return_value.scalar_one.return_value = "170011"
    connection.exec_driver_sql.return_value.scalars.return_value = ["fixture-head"]
    connection.execute.return_value.scalar_one_or_none.return_value = "fixture-release"
    with (
        patch("meducation_api.db.runtime.create_database_engine", return_value=engine),
        patch("meducation_api.db.runtime.migration_head", return_value="fixture-head"),
        pytest.raises(RuntimeError, match="body failed"),
        PostgresRuntime(settings),
    ):
        raise RuntimeError("body failed")
    engine.dispose.assert_called_once()


@pytest.mark.parametrize(
    "schema, publication", [([], "release"), (["old-head"], "release"), (["fixture-head"], None)]
)
def test_runtime_refuses_unsupported_schema_and_missing_release(schema, publication) -> None:
    settings = Settings(
        _env_file=None, content_source="postgres", database_environment="local", database_url=READER
    )
    engine = MagicMock()
    connection = engine.connect.return_value.__enter__.return_value
    connection.exec_driver_sql.return_value.scalar_one.return_value = "170011"
    connection.exec_driver_sql.return_value.scalars.return_value = schema
    connection.execute.return_value.scalar_one_or_none.return_value = publication
    with (
        patch("meducation_api.db.runtime.create_database_engine", return_value=engine),
        patch("meducation_api.db.runtime.migration_head", return_value="fixture-head"),
        pytest.raises(ContentDatabaseError),
        PostgresRuntime(settings),
    ):
        pytest.fail("Invalid schema/publication must not start")
    engine.dispose.assert_called_once()


def test_postgres_api_fails_closed_without_a_file_source_parameter() -> None:
    settings = Settings(
        _env_file=None, content_source="postgres", database_environment="local", database_url=READER
    )
    from inspect import signature

    assert "repository_factory" not in signature(create_app).parameters
    assert "flashcard_repository_factory" not in signature(create_app).parameters
    with patch("meducation_api.repositories.postgres.PostgresRuntime") as runtime:
        runtime.return_value.__enter__.side_effect = ContentDatabaseError("uninitialized")
        app = create_app(settings)
        with pytest.raises(ContentDatabaseError, match="uninitialized"), TestClient(app):
            pytest.fail("Uninitialized DB must not start")
    assert app.state.bank is None and app.state.flashcards is None


def test_upgrade_without_content_revision_does_not_open_a_connection() -> None:
    engine = MagicMock()
    with (
        patch("meducation_api.db.migrate.migration_head", return_value=None),
        pytest.raises(ContentDatabaseError, match="Step 3"),
    ):
        upgrade(engine)
    engine.begin.assert_not_called()


def test_explicit_upgrade_uses_owner_transaction_and_sanitizes_failure() -> None:
    engine = MagicMock()
    connection = engine.begin.return_value.__enter__.return_value
    with (
        patch("meducation_api.db.migrate.migration_head", return_value="fixture"),
        patch("meducation_api.db.migrate.command.upgrade") as job,
    ):
        upgrade(engine)
        job.assert_called_once()
        assert job.call_args.args[0].attributes["connection"] is connection
        connection.exec_driver_sql.assert_any_call("SET LOCAL ROLE meducation_owner")
        job.side_effect = OperationalError("sensitive SQL", {}, Exception(READER))
        with pytest.raises(ContentDatabaseError) as error:
            upgrade(engine)
        assert READER not in str(error.value) and "sensitive SQL" not in str(error.value)
    assert engine.begin.return_value.__exit__.call_count == 2

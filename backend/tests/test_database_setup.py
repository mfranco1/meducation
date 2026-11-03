"""Fail-closed configuration and lifecycle checks; real PG roles use container smoke."""


import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from sqlalchemy import event, make_url

from meducation_api.db.bootstrap import RolePasswords
from meducation_api.db.engine import ContentDatabaseError, create_database_engine, database_url
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

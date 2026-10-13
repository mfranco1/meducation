"""Bounded synchronous connections; credentials never appear in public errors."""

from pydantic import SecretStr
from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.pool import NullPool


class ContentDatabaseError(RuntimeError):
    """An intentional, sanitized database setup/readiness failure."""


def database_url(value: SecretStr, *, role: str, local: bool) -> URL:
    try:
        url = make_url(value.get_secret_value())
        valid = (
            url.drivername == "postgresql+psycopg"
            and url.username == role
            and bool(url.password)
            and bool(url.host)
            and bool(url.database)
            and url.query.get("gssencmode", "disable") == "disable"
            and not any(
                key in url.query
                for key in (
                    "host",
                    "hostaddr",
                    "port",
                    "user",
                    "dbname",
                    "password",
                    "service",
                    "servicefile",
                    "options",
                )
            )
        )
        if local:
            valid = valid and url.host in ("localhost", "127.0.0.1", "::1", "postgres")
            valid = valid and url.query.get("sslmode") in ("disable", "verify-full")
        else:
            valid = valid and url.query.get("sslmode") == "verify-full"
        if not valid:
            raise ValueError
    except ValueError, TypeError, ArgumentError:
        raise ValueError(
            "Invalid database connection: use the assigned role, postgresql+psycopg, "
            "an explicit host/database/password and verified TLS; local exceptions require "
            "database_environment=local with a loopback/Postgres-service host."
        ) from None
    return url


def create_database_engine(url: URL, *, operator: bool = False) -> Engine:
    if operator:
        return create_engine(
            url,
            poolclass=NullPool,
            hide_parameters=True,
            echo=False,
            connect_args={"connect_timeout": 5, "gssencmode": "disable"},
        )
    return create_engine(
        url,
        pool_size=2,
        max_overflow=0,
        pool_timeout=5,
        hide_parameters=True,
        echo=False,
        connect_args={"connect_timeout": 5, "gssencmode": "disable"},
    )

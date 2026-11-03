"""Shared pytest fixtures."""

import os

import pytest
from sqlalchemy import make_url
from support import Database

from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import create_database_engine
from meducation_api.db.migrate import upgrade


@pytest.fixture
def db():
    value = os.environ.get("MEDUCATION_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Run scripts/containers/test-postgres-content.py for isolated real-PG17 tests")
    url = make_url(value)
    if (
        url.host != "127.0.0.1"
        or not (url.database or "").startswith("meducation_test_")
        or url.username != "meducation_bootstrap"
    ):
        raise RuntimeError("Integration tests require the launcher's disposable loopback database")
    passwords = RolePasswords(_env_file=None)
    engines = [create_database_engine(url, operator=True)]
    for role in ("migrator", "operator", "reader", "backup", "session", "editor"):
        engines.append(
            create_database_engine(
                url.set(
                    username="meducation_" + role,
                    password=getattr(passwords, role + "_password").get_secret_value(),
                ),
                operator=True,
            )
        )
    database = Database(*engines)
    try:
        with database.admin.begin() as connection:
            connection.exec_driver_sql("DROP SCHEMA IF EXISTS admin_auth CASCADE")
            connection.exec_driver_sql("DROP SCHEMA IF EXISTS content CASCADE")
        bootstrap(database.admin, passwords)
        upgrade(database.migrator)
        yield database
    finally:
        for engine in engines:
            engine.dispose()

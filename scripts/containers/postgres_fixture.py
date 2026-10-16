"""Synthetic PostgreSQL seed for the container smoke test only."""

import secrets
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend/src"))
from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import create_database_engine
from meducation_api.db.migrate import upgrade
from meducation_api.db.operations import activate_release
from meducation_api.db.transfer import capture_pair, import_pair
from sqlalchemy import URL


def seed_database(port, password, folder, *, database="meducation_test_smoke"):
    """Caller must establish ownership of the loopback container before seeding."""
    if not database.startswith("meducation_test_") or not 1024 <= int(port) <= 65535:
        raise ValueError(
            "Smoke seeding requires an isolated test database/loopback port"
        )
    passwords = RolePasswords(
        _env_file=None,
        **{
            role + "_password": secrets.token_urlsafe(24)
            for role in ("migrator", "reader", "operator", "backup")
        },
    )
    engines = []

    def engine(role):
        value = create_database_engine(
            URL.create(
                "postgresql+psycopg",
                username="meducation_" + role,
                password=password
                if role == "bootstrap"
                else getattr(passwords, role + "_password").get_secret_value(),
                host="127.0.0.1",
                port=int(port),
                database=database,
                query={"sslmode": "disable"},
            ),
            operator=True,
        )
        engines.append(value)
        return value

    try:
        bootstrap(engine("bootstrap"), passwords)
        upgrade(engine("migrator"))
        operator = engine("operator")
        pair = capture_pair(
            ROOT / "e2e/fixtures/bank.json",
            ROOT / "e2e/fixtures/flashcard-bank.json",
            repository=ROOT,
        )
        release = import_pair(
            operator,
            pair,
            operation_id=uuid4(),
            actor="container-smoke",
            reason="Explicit synthetic fixture seed",
        )
        with operator.begin() as connection:
            activate_release(
                connection,
                operation_id=uuid4(),
                release_id=release.release_id,
                expected_sequence=0,
                actor="container-smoke",
                reason="Synthetic fixture publication",
            )
        reader = URL.create(
            "postgresql+psycopg",
            username="meducation_reader",
            password=passwords.reader_password.get_secret_value(),
            host="postgres",
            port=5432,
            database=database,
            query={"sslmode": "disable"},
        )
        env = folder / "reader.env"
        env.write_text(
            "MEDUCATION_DATABASE_ENVIRONMENT=local\nMEDUCATION_DATABASE_URL="
            + reader.render_as_string(hide_password=False)
            + "\n"
        )
        env.chmod(0o600)
        return env
    finally:
        for value in engines:
            value.dispose()

"""Explicit Alembic jobs; workers never call upgrade."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.db.engine import ContentDatabaseError


def migration_config() -> Config:
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    return config


def migration_head() -> str | None:
    return ScriptDirectory.from_config(migration_config()).get_current_head()


def upgrade(engine: Engine) -> None:
    if migration_head() is None:
        raise ContentDatabaseError(
            "No content schema revision is packaged yet; L3 Step 3 is pending."
        )
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
            connection.exec_driver_sql("SET LOCAL search_path = content, pg_catalog")
            connection.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
            connection.exec_driver_sql("SELECT pg_advisory_xact_lock(1936024677, 3)")
            config = migration_config()
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
    except SQLAlchemyError:
        raise ContentDatabaseError(
            "Migration failed; inspect protected operator diagnostics."
        ) from None

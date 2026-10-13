"""One-time schema/publication checks and deterministic engine cleanup."""

from contextlib import AbstractContextManager
from typing import Self

from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.db.engine import ContentDatabaseError, create_database_engine, database_url
from meducation_api.db.migrate import migration_head
from meducation_api.settings import Settings


class PostgresRuntime(AbstractContextManager["PostgresRuntime"]):
    def __init__(self, settings: Settings):
        if settings.database_url is None:
            raise ContentDatabaseError("Postgres content mode requires the runtime connection.")
        self.engine: Engine = create_database_engine(
            database_url(
                settings.database_url,
                role="meducation_reader",
                local=settings.database_environment == "local",
            )
        )

    def __enter__(self) -> Self:
        try:
            with self.engine.connect() as connection:
                version = int(connection.exec_driver_sql("SHOW server_version_num").scalar_one())
                if not 170000 <= version < 180000:
                    raise ContentDatabaseError("Postgres content mode requires PostgreSQL 17.")
                head = migration_head()
                if head is None:
                    raise ContentDatabaseError(
                        "Content schema is not packaged yet; L3 Step 3 is pending."
                    )
                # A reader-visible version view avoids granting access to migration writes.
                current: list[str] = list(
                    connection.exec_driver_sql(
                        "SELECT version_num FROM content.schema_version"
                    ).scalars()
                )
                if current != [head]:
                    raise ContentDatabaseError(
                        "Content schema is not at the supported migration head."
                    )
                publication = connection.execute(
                    text(
                        "SELECT p.release_id FROM content.active_publication p "
                        "JOIN content.published_releases r ON r.release_id = p.release_id "
                        "WHERE p.publication_sequence > 0"
                    )
                ).scalar_one_or_none()
                if publication is None:
                    raise ContentDatabaseError(
                        "No complete active content release; explicitly import and activate first."
                    )
        except SQLAlchemyError, ContentDatabaseError:
            self.engine.dispose()
            raise ContentDatabaseError(
                "Postgres content initialization failed; verify connectivity, roles, schema head "
                "and an explicitly activated paired release. No JSON fallback was used."
            ) from None
        except BaseException:
            self.engine.dispose()
            raise
        return self

    def __exit__(self, *args: object) -> None:
        self.engine.dispose()

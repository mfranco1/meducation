"""Explicit local bootstrap/migration jobs with sanitized output."""

import argparse

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import ContentDatabaseError, create_database_engine, database_url
from meducation_api.db.migrate import migration_head, upgrade
from meducation_api.settings import Settings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("head", "bootstrap-local", "upgrade"))
    args = parser.parse_args()
    try:
        if args.action == "head":
            print(migration_head() or "No content migration head packaged (L3 Step 3 pending).")
            return
        settings = Settings()
        if args.action == "bootstrap-local":
            if settings.database_environment != "local":
                raise ContentDatabaseError("Role bootstrap is local-development-only.")
            secret, role = settings.bootstrap_database_url, "meducation_bootstrap"
            passwords = RolePasswords()
        else:
            secret, role = settings.migration_database_url, "meducation_migrator"
            passwords = None
        if secret is None:
            raise ContentDatabaseError(
                "The explicit job connection is missing; runtime credentials are never substituted."
            )
        url = database_url(secret, role=role, local=settings.database_environment == "local")
        engine = create_database_engine(url, operator=True)
        try:
            if args.action == "bootstrap-local":
                assert passwords is not None
                bootstrap(engine, passwords)
                print(
                    "Local roles/schema reconciled. Content migration/import remain explicit jobs."
                )
            else:
                upgrade(engine)
                print("Content schema upgraded to the packaged head.")
        finally:
            engine.dispose()
    except ValidationError, ValueError, SQLAlchemyError:
        parser.exit(
            1, "Database job configuration/connection failed; no credentials or SQL logged.\n"
        )
    except ContentDatabaseError as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()

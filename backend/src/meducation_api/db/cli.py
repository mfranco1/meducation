"""Explicit bootstrap, migration, release and export jobs with sanitized output."""

import argparse
import json
from pathlib import Path
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import ContentDatabaseError, create_database_engine, database_url
from meducation_api.db.migrate import migration_head, upgrade
from meducation_api.db.operations import activate_release
from meducation_api.db.transfer import export_release
from meducation_api.settings import Settings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    for action in (
        "head",
        "bootstrap-local",
        "upgrade",
        "restore-permissions",
        "invalidate-restored-sessions",
    ):
        commands.add_parser(action)
    for action in ("validate-export", "audit-export"):
        command = commands.add_parser(action)
        command.add_argument("--directory", type=Path, required=True)
        command.add_argument("--repository", type=Path, required=True)
        command.add_argument("--report", type=Path, required=True)
    command = commands.add_parser("activate")
    command.add_argument("--release-id", type=UUID, required=True)
    command.add_argument("--expected-sequence", type=int, required=True)
    command.add_argument("--operation-id", type=UUID, required=True)
    command.add_argument("--actor", required=True)
    command.add_argument("--reason", required=True)
    command = commands.add_parser("advance-id-sequences")
    command.add_argument("--by", type=int, required=True)
    command = commands.add_parser("export-release")
    command.add_argument("--release-id", type=UUID, required=True)
    command.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.action == "head":
            print(migration_head() or "No content migration head packaged.")
            return
        if args.action in ("validate-export", "audit-export"):
            from meducation_api.db.export_tools import inspect_export

            report = inspect_export(
                args.directory, repository=args.repository, audit=args.action == "audit-export"
            )
            # Refuse overwrite; reports may contain private identifier inventories.
            import os

            fd = os.open(args.report, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as output:
                output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
            print(
                "Selected export checked; context recorded in the new private report. Live database currency was not checked."
            )
            return
        settings = Settings()
        if args.action == "bootstrap-local":
            if settings.database_environment != "local":
                raise ContentDatabaseError("Role bootstrap is local-development-only.")
            secret, role = settings.bootstrap_database_url, "meducation_bootstrap"
            passwords = RolePasswords()
        elif args.action in (
            "upgrade",
            "restore-permissions",
            "invalidate-restored-sessions",
            "advance-id-sequences",
        ):
            secret, role = settings.migration_database_url, "meducation_migrator"
            passwords = None
        else:
            secret, role = settings.operator_database_url, "meducation_operator"
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
                    "Local roles/schema reconciled. Schema migration remains an explicit job."
                )
            elif args.action == "upgrade":
                upgrade(engine)
                print("Content schema upgraded to the packaged head.")
            elif args.action == "advance-id-sequences":
                from meducation_api.db.recovery import advance_ids

                if args.by < 1:
                    raise ContentDatabaseError("--by must be a positive number of IDs.")
                with engine.begin() as connection:
                    print(json.dumps({"nextIds": advance_ids(connection, args.by)}))
            elif args.action in ("restore-permissions", "invalidate-restored-sessions"):
                from meducation_api.db.recovery import (
                    invalidate_restored_sessions,
                    restore_content_permissions,
                )

                with engine.begin() as connection:
                    if args.action == "restore-permissions":
                        restore_content_permissions(connection)
                    else:
                        result = invalidate_restored_sessions(connection)
                if args.action == "restore-permissions":
                    print(
                        "Packaged content/auth permissions reapplied; role bootstrap remains separate."
                    )
                else:
                    print(json.dumps(result))
                    print("Keep workers stopped until the external admin epoch is rotated.")
            elif args.action == "activate":
                with engine.begin() as connection:
                    publication = activate_release(
                        connection,
                        operation_id=args.operation_id,
                        release_id=args.release_id,
                        expected_sequence=args.expected_sequence,
                        actor=args.actor,
                        reason=args.reason,
                    )
                print(
                    json.dumps(
                        {
                            "releaseId": str(publication.release_id),
                            "publicationSequence": publication.publication_sequence,
                        }
                    )
                )
            else:
                print(json.dumps(export_release(engine, args.release_id, args.output)))
        finally:
            engine.dispose()
    except ValidationError, ValueError, OSError, SQLAlchemyError:
        parser.exit(
            1, "Database job configuration/connection failed; no credentials or SQL logged.\n"
        )
    except ContentDatabaseError as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()

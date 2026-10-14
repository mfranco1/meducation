"""Explicit bootstrap, migration and paired content jobs with sanitized output."""

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
from meducation_api.db.transfer import capture_pair, export_release, import_pair
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
    for action in ("validate-pair", "import-pair", "parity"):
        command = commands.add_parser(action)
        command.add_argument("--quiz-file", type=Path, required=True)
        command.add_argument("--flashcard-file", type=Path, required=True)
        command.add_argument("--repository", type=Path, required=True)
        if action == "parity":
            command.add_argument("--release-id", type=UUID, required=True)
            command.add_argument("--report", type=Path, required=True)
        if action == "import-pair":
            command.add_argument("--operation-id", type=UUID, required=True)
            command.add_argument("--actor", required=True)
            command.add_argument("--reason", required=True)
    command = commands.add_parser("activate")
    command.add_argument("--release-id", type=UUID, required=True)
    command.add_argument("--expected-sequence", type=int, required=True)
    command.add_argument("--operation-id", type=UUID, required=True)
    command.add_argument("--actor", required=True)
    command.add_argument("--reason", required=True)
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
        pair = None
        if args.action in ("validate-pair", "import-pair", "parity"):
            pair = capture_pair(args.quiz_file, args.flashcard_file, repository=args.repository)
            if args.action == "validate-pair":
                print(json.dumps({"sourceSha256": pair.source_hashes, "warnings": pair.warnings}))
                return
        settings = Settings()
        if args.action == "bootstrap-local":
            if settings.database_environment != "local":
                raise ContentDatabaseError("Role bootstrap is local-development-only.")
            secret, role = settings.bootstrap_database_url, "meducation_bootstrap"
            passwords = RolePasswords()
        elif args.action in ("upgrade", "restore-permissions", "invalidate-restored-sessions"):
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
                    "Local roles/schema reconciled. Content migration/import remain explicit jobs."
                )
            elif args.action == "upgrade":
                upgrade(engine)
                print("Content schema upgraded to the packaged head.")
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
                    print(
                        "Keep workers stopped until the external admin epoch is rotated and allocation recovery is resolved."
                    )
            elif args.action == "import-pair":
                assert pair is not None
                release = import_pair(
                    engine,
                    pair,
                    operation_id=args.operation_id,
                    actor=args.actor,
                    reason=args.reason,
                )
                print(
                    json.dumps(
                        {
                            "releaseId": str(release.release_id),
                            "quizRevision": release.quiz_revision,
                            "flashcardRevision": release.flashcard_revision,
                            "sourceSha256": pair.source_hashes,
                            "warnings": pair.warnings,
                        }
                    )
                )
            elif args.action == "parity":
                from meducation_api.db.parity import verify_parity

                assert pair is not None
                try:
                    report = verify_parity(engine, settings, pair, args.release_id)
                except ContentDatabaseError as error:
                    with args.report.open("x", encoding="utf-8") as output:
                        output.write(
                            json.dumps(
                                {
                                    "result": "fail",
                                    "sourceSha256": pair.source_hashes,
                                    "releaseId": str(args.release_id),
                                    "mismatch": str(error),
                                },
                                indent=2,
                            )
                            + "\n"
                        )
                    raise
                with args.report.open("x", encoding="utf-8") as output:
                    output.write(json.dumps(report, indent=2) + "\n")
                print(json.dumps(report))
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

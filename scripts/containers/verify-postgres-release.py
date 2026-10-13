"""Actual-bank parity and backup-role recovery in a uniquely owned disposable PG17 cluster."""

import argparse
import hashlib
import json
import secrets
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

from compose_support import docker

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend/src"))
from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import ContentDatabaseError, create_database_engine
from meducation_api.db.migrate import upgrade
from meducation_api.db.operations import activate_release, reserve_ids, save_draft
from meducation_api.db.parity import verify_parity
from meducation_api.db.recovery import restore_content_permissions
from meducation_api.db.transfer import capture_pair, import_pair
from meducation_api.settings import Settings
from sqlalchemy import URL, text
from sqlalchemy.exc import SQLAlchemyError

PG_IMAGE = "postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"


def snapshot(engine):
    state = {}
    with engine.connect() as connection:
        tables = (
            connection.execute(
                text(
                    "SELECT tablename FROM pg_tables WHERE schemaname='content' ORDER BY tablename"
                )
            )
            .scalars()
            .all()
        )
        for table in tables:
            rows = [
                json.dumps(row, sort_keys=True, default=str, separators=(",", ":"))
                for row in connection.execute(
                    text(f'SELECT to_jsonb(t) FROM content."{table}" t')
                ).scalars()
            ]
            state[table] = {
                "count": len(rows),
                "sha256": hashlib.sha256("\n".join(sorted(rows)).encode()).hexdigest(),
            }
        state["sequences"] = [
            tuple(row)
            for row in (
                connection.execute(
                    text(
                        "SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='content' ORDER BY sequencename"
                    )
                ).tuples()
            )
        ]
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    name = "meducation-release-verify-" + uuid.uuid4().hex[:12]
    engines = []
    started = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix="meducation-release-verify-") as temp:
            folder = Path(temp)
            admin_secret = secrets.token_urlsafe(24)
            passwords = RolePasswords(
                _env_file=None,
                **{
                    role + "_password": secrets.token_urlsafe(24)
                    for role in ("migrator", "reader", "backup", "operator")
                },
            )
            env = folder / "postgres.env"
            env.write_text(
                "POSTGRES_USER=meducation_bootstrap\nPOSTGRES_DB=meducation_verify_source\nPOSTGRES_PASSWORD="
                + admin_secret
                + "\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n"
            )
            env.chmod(0o600)
            docker(
                "run",
                "--detach",
                "--name",
                name,
                "--env-file",
                str(env),
                "--publish",
                "127.0.0.1::5432",
                "--tmpfs",
                "/var/lib/postgresql/data:rw,size=2g",
                PG_IMAGE,
                timeout=120,
            )
            deadline = time.monotonic() + 60
            while True:
                check = subprocess.run(
                    [
                        "docker",
                        "exec",
                        name,
                        "pg_isready",
                        "-h",
                        "127.0.0.1",
                        "-U",
                        "meducation_bootstrap",
                        "-d",
                        "meducation_verify_source",
                    ],
                    capture_output=True,
                    timeout=5,
                    check=False,
                )
                if check.returncode == 0:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError("Disposable PG17 readiness deadline")
                time.sleep(0.25)
            port = int(
                json.loads(docker("inspect", name))[0]["NetworkSettings"]["Ports"][
                    "5432/tcp"
                ][0]["HostPort"]
            )

            def engine(database, role):
                secret = (
                    admin_secret
                    if role == "bootstrap"
                    else getattr(passwords, role + "_password").get_secret_value()
                )
                value = create_database_engine(
                    URL.create(
                        "postgresql+psycopg",
                        username="meducation_" + role,
                        password=secret,
                        host="127.0.0.1",
                        port=port,
                        database=database,
                        query={"sslmode": "disable"},
                    ),
                    operator=True,
                )
                engines.append(value)
                return value

            source_admin = engine("meducation_verify_source", "bootstrap")
            migrator = engine("meducation_verify_source", "migrator")
            operator = engine("meducation_verify_source", "operator")
            reader = engine("meducation_verify_source", "reader")
            bootstrap(source_admin, passwords)
            upgrade(migrator)
            print("Capturing and validating actual canonical inputs", flush=True)
            pair = capture_pair(
                ROOT / "src/content/questionBank.generated.json",
                ROOT / "src/content/flashcardBank.generated.json",
                repository=ROOT,
            )
            print("Importing actual bank pair into disposable database", flush=True)
            release = import_pair(
                operator,
                pair,
                operation_id=uuid.uuid4(),
                actor="local-recovery-probe",
                reason="Read-only canonical-copy verification",
            )
            with operator.begin() as connection:
                publication = activate_release(
                    connection,
                    operation_id=uuid.uuid4(),
                    release_id=release.release_id,
                    expected_sequence=0,
                    actor="local-recovery-probe",
                    reason="Explicit verification activation",
                )
                save_draft(
                    connection,
                    operation_id=uuid.uuid4(),
                    quiz_text=pair.quiz_artifact,
                    flashcard_text=pair.flashcard_artifact,
                    expected_revision=0,
                    base_sequence=publication.publication_sequence,
                    actor="local-recovery-probe",
                    reason="Private restore fixture",
                )
            reserve_ids(
                operator,
                operation_id=uuid.uuid4(),
                counts={"i": 2, "f": 1},
                expected_draft_revision=1,
                expected_publication_sequence=publication.publication_sequence,
                intent="Burned restore fixture reservations",
                actor="local-recovery-probe",
                reason="Allocator state recovery evidence",
            )
            settings = Settings(
                _env_file=None,
                content_source="postgres",
                database_environment="local",
                database_url=reader.url.render_as_string(hide_password=False),
            )
            print("Comparing every actual-bank learner route", flush=True)
            parity = verify_parity(operator, settings, pair, release.release_id)
            before = snapshot(source_admin)
            passfile = folder / "pgpass"
            passfile.write_text(
                "".join(
                    "127.0.0.1:5432:*:meducation_"
                    + role
                    + ":"
                    + getattr(passwords, role + "_password").get_secret_value()
                    + "\n"
                    for role in ("backup", "migrator")
                )
            )
            passfile.chmod(0o600)
            docker("cp", str(passfile), name + ":/tmp/verify.pgpass")

            def pgtool(role, tool, *options, stdin=None, stdout=subprocess.PIPE):
                result = subprocess.run(
                    [
                        "docker",
                        "exec",
                        "-i",
                        "--env",
                        "PGPASSFILE=/tmp/verify.pgpass",
                        name,
                        tool,
                        "--host",
                        "127.0.0.1",
                        "--username",
                        "meducation_" + role,
                        "--no-password",
                        *options,
                    ],
                    stdin=stdin,
                    stdout=stdout,
                    stderr=subprocess.PIPE,
                    timeout=600,
                    check=False,
                )
                if result.returncode:
                    raise RuntimeError(
                        "PG17 " + tool + " failed; no credentials or SQL logged"
                    )
                return result.stdout

            archive = folder / "content.dump"
            print(
                "Dumping as backup role and restoring into fresh owner-managed target",
                flush=True,
            )
            with archive.open("xb") as stream:
                archive.chmod(0o600)
                pgtool(
                    "backup",
                    "pg_dump",
                    "--dbname",
                    "meducation_verify_source",
                    "--schema",
                    "content",
                    "--format=custom",
                    "--no-owner",
                    "--no-acl",
                    stdout=stream,
                )
            docker(
                "exec",
                name,
                "createdb",
                "-U",
                "meducation_bootstrap",
                "--template",
                "template0",
                "meducation_verify_restored",
            )
            restored_admin = engine("meducation_verify_restored", "bootstrap")
            restored_migrator = engine("meducation_verify_restored", "migrator")
            restored_operator = engine("meducation_verify_restored", "operator")
            restored_reader = engine("meducation_verify_restored", "reader")
            bootstrap(restored_admin, passwords)
            with restored_admin.begin() as connection:
                if (
                    connection.exec_driver_sql(
                        "SELECT count(*) FROM pg_tables WHERE schemaname='content'"
                    ).scalar_one()
                    != 0
                ):
                    raise RuntimeError("Fresh restore schema was not empty")
                connection.exec_driver_sql("DROP SCHEMA content")
                connection.exec_driver_sql(
                    "GRANT CREATE ON DATABASE meducation_verify_restored TO meducation_owner"
                )
            with archive.open("rb") as stream:
                pgtool(
                    "migrator",
                    "pg_restore",
                    "--dbname",
                    "meducation_verify_restored",
                    "--role",
                    "meducation_owner",
                    "--exit-on-error",
                    "--single-transaction",
                    "--no-owner",
                    "--no-acl",
                    stdin=stream,
                )
            with restored_admin.begin() as connection:
                connection.exec_driver_sql(
                    "REVOKE CREATE ON DATABASE meducation_verify_restored FROM meducation_owner"
                )
            bootstrap(restored_admin, passwords)
            with restored_migrator.begin() as connection:
                restore_content_permissions(connection)
            restored = snapshot(restored_admin)
            if before != restored:
                raise RuntimeError(
                    "Restored content/draft/audit/allocator/sequence state differs"
                )
            if before != snapshot(source_admin):
                raise RuntimeError("Source state changed during backup/restore")
            restored_settings = settings.model_copy(
                update={
                    "database_url": Settings(
                        _env_file=None,
                        database_environment="local",
                        database_url=restored_reader.url.render_as_string(
                            hide_password=False
                        ),
                    ).database_url
                }
            )
            print(
                "Repeating complete reconstruction and API parity on restored database",
                flush=True,
            )
            restored_parity = verify_parity(
                restored_operator, restored_settings, pair, release.release_id
            )
            for path, key in (
                (ROOT / "src/content/questionBank.generated.json", "quiz"),
                (ROOT / "src/content/flashcardBank.generated.json", "flashcard"),
            ):
                if (
                    hashlib.sha256(path.read_bytes()).hexdigest()
                    != pair.source_hashes[key]
                ):
                    raise RuntimeError("Authored input changed during verification")
            report = {
                "result": "pass",
                "postgres_image": PG_IMAGE,
                "platform": "linux/"
                + docker("image", "inspect", "--format", "{{.Architecture}}", PG_IMAGE),
                "seconds": round(time.monotonic() - started, 2),
                "source_parity": parity,
                "restored_parity": restored_parity,
                "state_snapshot": before,
                "dump_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                "checks": [
                    "backup login dump, no owner/ACL",
                    "fresh target single-transaction restore as migration owner",
                    "explicit owner/default/reader/operator/backup grants",
                    "exact all-table draft/audit/operation/allocation and sequence state",
                    "source state and authored bytes unchanged",
                    "fresh readers and complete actual-bank/API parity after restoration",
                ],
                "isolation": "unique tmpfs cluster; no persistent volumes or routine DB; credentials and archive temporary",
            }
            args.output.write_text(json.dumps(report, indent=2) + "\n")
            print("Actual-bank parity and recovery passed", flush=True)
    except SQLAlchemyError, ContentDatabaseError:
        raise RuntimeError(
            "Content verification failed; no SQL, content or credentials logged"
        ) from None
    finally:
        for value in engines:
            value.dispose()
        subprocess.run(
            ["docker", "rm", "--force", name],
            capture_output=True,
            check=False,
            timeout=30,
        )


if __name__ == "__main__":
    main()

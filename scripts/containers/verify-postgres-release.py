"""Actual-bank parity and backup-role recovery in a uniquely owned disposable PG17 cluster."""

import argparse
import copy
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
from meducation_api.db.recovery import invalidate_restored_sessions, restore_content_permissions
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
                    "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('content','admin_auth') ORDER BY schemaname,tablename"
                )
            )
            .tuples()
            .all()
        )
        for schema, table in tables:
            rows = [
                json.dumps(row, sort_keys=True, default=str, separators=(",", ":"))
                for row in connection.execute(
                    text(f'SELECT to_jsonb(t) FROM "{schema}"."{table}" t')
                ).scalars()
            ]
            state[schema + "." + table] = {
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



def permission_snapshot(engine):
    # Effective privileges include PUBLIC leakage and implicit owner privileges.
    with engine.connect() as connection:
        result = connection.exec_driver_sql("""
WITH roles AS (SELECT unnest(ARRAY['meducation_owner','meducation_reader','meducation_backup',
 'meducation_operator','meducation_session','meducation_editor','meducation_migrator']) AS role),
permissions AS (
 SELECT r.role,'schema' AS kind,n.nspname AS object,p.privilege,
 has_schema_privilege(r.role,n.oid,p.privilege) AS granted
 FROM pg_namespace n CROSS JOIN roles r CROSS JOIN (VALUES ('USAGE'),('CREATE')) p(privilege)
 WHERE n.nspname IN ('content','admin_auth')
 UNION ALL
 SELECT r.role,'relation',n.nspname||'.'||c.relname,p.privilege,
 has_table_privilege(r.role,c.oid,p.privilege)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN roles r
 CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
 WHERE n.nspname IN ('content','admin_auth') AND c.relkind IN ('r','v')
 UNION ALL
 SELECT r.role,'sequence',n.nspname||'.'||c.relname,p.privilege,
 has_sequence_privilege(r.role,c.oid,p.privilege)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN roles r
 CROSS JOIN (VALUES ('SELECT'),('USAGE'),('UPDATE')) p(privilege)
 WHERE n.nspname IN ('content','admin_auth') AND c.relkind='S'
 UNION ALL
 SELECT r.role,'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 'EXECUTE',has_function_privilege(r.role,p.oid,'EXECUTE')
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN roles r
 WHERE n.nspname IN ('content','admin_auth')
)
SELECT role,kind,object,privilege,granted FROM permissions ORDER BY role,kind,object,privilege
""").tuples().all()
        return [tuple(row) for row in result]

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
                    for role in ("migrator", "reader", "backup", "operator", "session", "editor")
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
            recovery_started = time.monotonic()
            # Test-only identity is created explicitly in this isolated process; no
            # token/provider shortcut is installed in the application.
            from cryptography.fernet import Fernet
            from meducation_api.admin.service import EditorService
            from meducation_api.auth.config import AuthSettings
            from meducation_api.auth.oidc import AuthError, VerifiedEditorIdentity
            from meducation_api.auth.store import SessionStore
            from meducation_api.db.export_tools import inspect_export
            from meducation_api.db.transfer import export_release

            session_engine = engine("meducation_verify_source", "session")
            editor_engine = engine("meducation_verify_source", "editor")
            auth_config = AuthSettings(
                _env_file=None, enabled=False, issuer="http://127.0.0.1/recovery-fixture",
                editor_subject="recovery-fixture", epoch=secrets.token_urlsafe(24),
                encryption_key=Fernet.generate_key().decode(),
            )
            store = SessionStore(session_engine, auth_config)
            token, csrf = store.issue(VerifiedEditorIdentity(
                auth_config.issuer, auth_config.editor_subject, None, time.time(),
                "synthetic-fresh-factor-v1",
            ))
            pending_login = store.begin_login("recovery-fixture-browser")
            with store.guard(token, csrf=csrf, write=True, fresh=True) as principal:
                service = EditorService(editor_engine, store, principal)
                ctx = service.context()
                candidate = {"quizzes": json.loads(pair.quiz_artifact),
                             "flashcards": json.loads(pair.flashcard_artifact)}
                command = {
                    "expected": {"draftRevision": ctx["revision"], "publicationSequence": ctx["sequence"]},
                    "reason": "Paired authored recovery rehearsal", "pair": candidate,
                    "reservationIds": [], "intent": {"reservations": []},
                }
                reviewed = service.preview("save", command)
                service.mutate("save", {**command, "operationId": str(uuid.uuid4()),
                                        "previewFingerprint": reviewed["previewFingerprint"]})
                ctx = service.context()
                command = {"expected": {"draftRevision": ctx["revision"], "publicationSequence": ctx["sequence"]},
                           "reason": "Authored release recovery rehearsal"}
                reviewed = service.preview("publish", command)
                published = service.mutate("publish", {**command, "operationId": str(uuid.uuid4()),
                                                       "previewFingerprint": reviewed["previewFingerprint"]})
                authored_release = uuid.UUID(published["result"]["releaseId"])
                ctx = service.context()
                # Preserve a newer unpublished paired edit in the restored history.
                candidate = copy.deepcopy(candidate)
                candidate["quizzes"]["questions"][0]["stem"] += "\nRecovery fixture only."
                command = {"expected": {"draftRevision": ctx["revision"], "publicationSequence": ctx["sequence"]},
                           "reason": "Unpublished recovery rehearsal", "pair": candidate,
                           "reservationIds": [], "intent": {"reservations": []}}
                reviewed = service.preview("save", command)
                service.mutate("save", {**command, "operationId": str(uuid.uuid4()),
                                        "previewFingerprint": reviewed["previewFingerprint"]})
                ctx = service.context()
                slots = [{"kind": "i", "count": 2, "parentId": candidate["quizzes"]["quizzes"][0]["id"]}]
                service.mutate("reserve", {"expected": {"draftRevision": ctx["revision"], "publicationSequence": ctx["sequence"]},
                                          "reason": "Burned editor allocations for recovery", "counts": {"i": 2},
                                          "intent": {"slots": slots}, "operationId": str(uuid.uuid4())})
            export_manifest = export_release(operator, authored_release, folder / "authored-export")
            export_report = inspect_export(folder / "authored-export", repository=ROOT, audit=True)
            before = snapshot(source_admin)
            source_permissions = permission_snapshot(source_admin)
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
                    "--schema",
                    "admin_auth",
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
                connection.exec_driver_sql("DROP SCHEMA admin_auth")
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
            if source_permissions != permission_snapshot(restored_admin):
                raise RuntimeError("Restored effective content/auth/role privileges differ")
            restored = snapshot(restored_admin)
            if before != restored:
                raise RuntimeError(
                    "Restored content/draft/audit/allocator/sequence state differs"
                )
            raw_restore_seconds = round(time.monotonic() - recovery_started, 2)
            restored_store = SessionStore(engine("meducation_verify_restored", "session"), auth_config)
            with restored_store.guard(token) as _principal:
                pass  # Exact restore initially contains live credentials; quarantine is mandatory.
            with restored_migrator.begin() as connection:
                quarantined = invalidate_restored_sessions(connection)
            try:
                with restored_store.guard(token):
                    raise RuntimeError("Restored session was not revoked")
            except AuthError:
                pass
            try:
                restored_store.consume(pending_login["state"], "recovery-fixture-browser")
                raise RuntimeError("Restored pending callback remained usable")
            except AuthError:
                pass
            rotated_config = auth_config.model_copy(update={"epoch": secrets.token_urlsafe(24)})
            if rotated_config.policy_epoch == auth_config.policy_epoch:
                raise RuntimeError("External auth epoch was not rotated")
            after_quarantine = snapshot(restored_admin)
            if {k: v for k, v in before.items() if not k.startswith("admin_auth.")} != {
                k: v for k, v in after_quarantine.items() if not k.startswith("admin_auth.")
            }:
                raise RuntimeError("Session quarantine changed content history")
            restored_export = export_release(restored_operator, authored_release, folder / "restored-export")
            if restored_export != export_manifest:
                raise RuntimeError("Authored export changed after restoration")
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
                "recovery_seconds": raw_restore_seconds,
                "restored_auth_quarantine": quarantined,
                "external_auth_epoch_rotated": True,
                "authored_export_validation": {k: v for k, v in export_report.items() if k != "explanations"},
                "restored_parity": restored_parity,
                "state_snapshot": before,
                "dump_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                "checks": [
                    "backup login dump, no owner/ACL",
                    "fresh target single-transaction restore as migration owner",
                    "exact effective owner/migrator/reader/operator/backup/session/editor privilege parity",
                    "exact all-table draft/audit/operation/allocation and sequence state",
                    "source state and authored bytes unchanged",
                    "paired authored saves/publication, unpublished history and editor slots restored",
                    "restored live sessions revoked and login transactions cleared; external epoch rotated",
                    "selected authored-release export/audit and exact restored export parity",
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

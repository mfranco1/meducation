"""Selected-export parity or synthetic-fixture recovery in an owned disposable PG17 cluster."""

import argparse
import copy
import hashlib
import json
import logging
import os
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
from meducation_api.db.allocation_fence import issue_range
from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import ContentDatabaseError, create_database_engine
from meducation_api.db.migrate import migration_head, upgrade
from meducation_api.db.operations import activate_release, reserve_ids, save_draft
from meducation_api.db.parity import verify_parity
from meducation_api.db.recovery import (
    invalidate_restored_sessions,
    restore_content_permissions,
)
from meducation_api.db.transfer import capture_pair, import_pair
from meducation_api.settings import Settings
from release_inputs import capture_export, require_unchanged_export
from rollback_drills import (
    application_rollback,
    prepare_retained_pair,
    retained_release,
)
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

def publication_summary(engine):
    with engine.connect() as connection:
        row = connection.exec_driver_sql("SELECT p.release_id,p.publication_sequence,r.quiz_revision,r.flashcard_revision FROM content.active_publication p JOIN content.releases r USING (release_id)").one()
        return {"release_id": str(row[0]), "sequence": row[1], "quiz_digest": row[2], "flashcard_digest": row[3]}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--small-fixture", action="store_true", help="Explicit synthetic fixture for recovery regression; never authority data")
    inputs.add_argument("--export-directory", type=Path, help="Explicit protected export-release directory; parity only, no authority recovery")
    parser.add_argument("--api-image")
    parser.add_argument("--previous-api-image")
    args = parser.parse_args()
    if bool(args.api_image) != bool(args.previous_api_image):
        parser.error("Supply both current and previous images for the application rollback drill")
    if args.export_directory and args.api_image:
        parser.error("Selected-export mode verifies paired parity only; run synthetic recovery separately")
    if args.export_directory and (
        args.output.resolve().is_relative_to(args.export_directory.resolve()) or args.output.exists()
    ):
        parser.error("Selected-export report requires a new path outside the immutable export")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    name = "meducation-release-verify-" + uuid.uuid4().hex[:12]
    engines = []
    started = time.monotonic()
    report = None
    fixture_started = False
    # Per-route behavior is asserted by parity; avoid thousands of fixture request events.
    logging.getLogger("meducation.operations").disabled = True
    try:
        with tempfile.TemporaryDirectory(prefix="meducation-release-verify-") as temp:
            folder = Path(temp)
            selected = None
            if args.export_directory:
                selected_inputs = {
                    str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in [Path(__file__).resolve(), ROOT / "scripts/containers/release_inputs.py",
                              *sorted((ROOT / "backend/src").rglob("*.py")),
                              *sorted((ROOT / "backend/src").rglob("*.sql"))]
                }
                pair, selected = capture_export(args.export_directory, folder / "selected", repository=ROOT)
                require_unchanged_export(args.export_directory, selected)
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
            fixture_started = True
            docker(
                "run",
                "--detach",
                "--name",
                name,
                "--label",
                "meducation.release-verify=" + name,
                "--env-file",
                str(env),
                "--publish",
                "127.0.0.1::5432",
                "--publish",
                "127.0.0.1::8000",
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
            print("Capturing and validating disposable input copies", flush=True)
            source_q, source_f = ROOT / "e2e/fixtures/bank.json", ROOT / "e2e/fixtures/flashcard-bank.json"
            if selected is None:
                pair = capture_pair(source_q, source_f, repository=ROOT)
            print("Importing paired fixture into disposable database", flush=True)
            release = import_pair(
                operator,
                pair,
                operation_id=uuid.uuid4(),
                actor="local-recovery-probe",
                reason="Read-only canonical-copy verification",
            )
            if selected is not None:
                # Reconstruct exactly the pinned published pair. Do not create an
                # authored draft, IDs, sessions or a writable clone of its lineage.
                with operator.begin() as connection:
                    activate_release(
                        connection, operation_id=uuid.uuid4(), release_id=release.release_id,
                        expected_sequence=0, actor="selected-export-parity",
                        reason="Disposable paired-content parity only",
                    )
                settings = Settings(
                    _env_file=None, content_source="postgres", database_environment="local",
                    database_url=reader.url.render_as_string(hide_password=False),
                )
                from meducation_api.db.transfer import export_release

                parity = verify_parity(operator, settings, pair, release.release_id)
                exported = export_release(operator, release.release_id, folder / "reexport")
                if (exported["artifactsSha256"] != selected["artifactsSha256"]
                        or exported["revisions"] != selected["revisions"]):
                    raise ContentDatabaseError("Selected export re-export digests differ.")
                require_unchanged_export(args.export_directory, selected)
                if any(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != digest
                       for p, digest in selected_inputs.items()):
                    raise ContentDatabaseError("Verification code changed during selected-export run.")
                report = {
                    "result": "pass", "input_scope": "selected-release-export",
                    "selected_export": selected, "source_parity": parity,
                    "fixture_release_id": str(release.release_id),
                    "reexport_artifacts_sha256": exported["artifactsSha256"],
                    "reexport_revisions": exported["revisions"],
                    "schema_head": migration_head(), "postgres_image": PG_IMAGE,
                    "platform": "linux/" + docker("image", "inspect", "--format", "{{.Architecture}}", PG_IMAGE),
                    "seconds": round(time.monotonic() - started, 2),
                    "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                    "input_sha256": selected_inputs,
                    "checks": ["pinned manifest/schema/rich-policy validation", "exact authored fields/order/optional presence and paired bytes",
                               "all learner API route/conditional contracts", "exact re-export paired hashes/revisions", "original export unchanged"],
                    "isolation": "unique owned tmpfs PG17 cluster; no routine DB credentials, history, auth or allocation lineage copied",
                    "scope_limit": "Paired content parity only; not full-authority recovery or current-publication verification",
                }
                print("Selected-release export parity passed", flush=True)
                return
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
            journals = (folder / "primary-allocation", folder / "independent-allocation")
            for journal in journals:
                journal.mkdir(mode=0o700)
            prepared_retained_pair = prepare_retained_pair(operator, pair, folder, ROOT)
            admitted_range = issue_range(
                migrator, primary=journals[0], independent=journals[1], size=16,
                recovery=False, reason="Recovery fixture range before backup", rehearsal=True,
            )
            print("Rehearsing retained paired activation and in-flight views", flush=True)
            retained_drill = retained_release(operator, settings, pair, release, prepared_retained_pair,
                                               snapshot, source_admin)
            ctx["sequence"] = retained_drill["activations"][-1]["publication_sequence"]
            app_drill = None
            if args.api_image:
                print("Rehearsing compatible installed application rollback and roll-forward", flush=True)
                binding = json.loads(docker("inspect", name))[0]["NetworkSettings"]["Ports"]["8000/tcp"][0]
                assert binding["HostIp"] == "127.0.0.1"
                runtime_env = folder / "rollback-reader.env"
                runtime_env.write_text("MEDUCATION_CONTENT_SOURCE=postgres\nMEDUCATION_DATABASE_ENVIRONMENT=local\nMEDUCATION_DATABASE_URL="
                                       + reader.url.set(host="127.0.0.1", port=5432).render_as_string(hide_password=False) + "\n")
                runtime_env.chmod(0o600)
                current_ref = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
                app_drill = application_rollback(current_image=args.api_image, prior_image=args.previous_api_image,
                                                 current_ref=current_ref, pg=name,
                                                 origin="http://127.0.0.1:" + binding["HostPort"], envfile=runtime_env,
                                                 admin=source_admin, pair=pair, folder=folder, root=ROOT, snapshot=snapshot)
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

            dump_started = time.monotonic()
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
            dump_seconds = time.monotonic() - dump_started
            # Allocate after the snapshot, then extend the independently retained
            # fence. These IDs/events will intentionally be absent from the dump.
            def allocate(engine):
                return reserve_ids(engine, operation_id=uuid.uuid4(), counts={"i": 2},
                                   expected_draft_revision=int(ctx["revision"]),
                                   expected_publication_sequence=int(ctx["sequence"]),
                                   intent="Post-backup allocation loss rehearsal",
                                   actor="local-recovery-probe", reason="Allocation recovery evidence")
            lost_ids = allocate(operator)["i"]
            later_range = issue_range(
                migrator, primary=journals[0], independent=journals[1], size=16,
                recovery=False, reason="Independent range after backup", rehearsal=True,
            )
            lost_ids += allocate(operator)["i"]
            expected_source_state = snapshot(source_admin)
            # Retire source application access before the restored lineage can write.
            # Only the private bootstrap inspection connection remains possible.
            with source_admin.begin() as connection:
                connection.exec_driver_sql("REVOKE CONNECT ON DATABASE meducation_verify_source FROM meducation_reader,meducation_operator,meducation_session,meducation_editor,meducation_migrator,meducation_backup,meducation_owner")
                connection.exec_driver_sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='meducation_verify_source' AND usename<>'meducation_bootstrap'")
                access = connection.exec_driver_sql("SELECT bool_or(has_database_privilege(role,'meducation_verify_source','CONNECT')) FROM unnest(ARRAY['meducation_reader','meducation_operator','meducation_session','meducation_editor','meducation_migrator','meducation_backup','meducation_owner']) role").scalar_one()
                assert access is False, "Source authority still admits application connections"
            try:
                with operator.connect():
                    raise RuntimeError("Source write connection was not retired")
            except SQLAlchemyError:
                pass
            restore_started = time.monotonic()
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
            raw_restore_seconds = round(time.monotonic() - restore_started, 2)
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
            rotated_store = SessionStore(engine("meducation_verify_restored", "session"), rotated_config)
            fresh_token, fresh_csrf = rotated_store.issue(VerifiedEditorIdentity(
                rotated_config.issuer, rotated_config.editor_subject, None, time.time(),
                "synthetic-fresh-factor-v1",
            ))
            with rotated_store.guard(fresh_token, csrf=fresh_csrf, write=True, fresh=True):
                pass
            try:
                with rotated_store.guard(token):
                    raise RuntimeError("Old-epoch credential accepted after rotation")
            except AuthError:
                pass
            after_quarantine = snapshot(restored_admin)
            if {k: v for k, v in before.items() if not k.startswith("admin_auth.") and k != "content.allocation_fence"} != {
                k: v for k, v in after_quarantine.items() if not k.startswith("admin_auth.") and k != "content.allocation_fence"
            }:
                raise RuntimeError("Session quarantine changed content history")
            try:
                allocate(restored_operator)
                raise RuntimeError("Quarantined restored allocator remained usable")
            except ContentDatabaseError:
                pass
            recovered_range = issue_range(
                restored_migrator, primary=journals[0], independent=journals[1], size=16,
                recovery=True, reason="Burn all post-backup permitted IDs", rehearsal=True,
            )
            recovered_ids = allocate(restored_operator)["i"]
            if set(recovered_ids) & set(lost_ids) or min(int(value[1:]) for value in recovered_ids) < later_range["ceilings"]["i"]:
                raise RuntimeError("Restoration reused a previously permitted identity")
            admission_seconds = time.monotonic() - restore_started
            restored_export = export_release(restored_operator, authored_release, folder / "restored-export")
            if restored_export != export_manifest:
                raise RuntimeError("Authored export changed after restoration")
            if expected_source_state != snapshot(source_admin):
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
                (source_q, "quiz"),
                (source_f, "flashcard"),
            ):
                if (
                    hashlib.sha256(path.read_bytes()).hexdigest()
                    != pair.source_hashes[key]
                ):
                    raise RuntimeError("Authored input changed during verification")
            report = {
                "result": "pass",
                "input_scope": "small-browser-fixture",
                "postgres_image": PG_IMAGE,
                "platform": "linux/"
                + docker("image", "inspect", "--format", "{{.Architecture}}", PG_IMAGE),
                "seconds": round(time.monotonic() - started, 2),
                "source_parity": parity,
                "recovery_seconds": raw_restore_seconds,
                "schema_head": migration_head(),
                "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                "worktree_changes": subprocess.check_output(["git", "status", "--short"], cwd=ROOT, text=True).splitlines(),
                "input_sha256": {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                                  for path in [Path(__file__).resolve(), ROOT / "scripts/containers/rollback_drills.py",
                                               ROOT / "scripts/containers/build-rollback-api.py", ROOT / "backend/Dockerfile",
                                               ROOT / "backend/requirements.lock", ROOT / ".github/workflows/checks.yml", source_q, source_f,
                                               *sorted((ROOT / "backend/src").rglob("*.py")),
                                               *sorted((ROOT / "backend/src").rglob("*.sql"))]},
                "dump_seconds": dump_seconds,
                "restore_and_admission_seconds": admission_seconds,
                "source_and_restored_publication": publication_summary(source_admin),
                "restored_publication": publication_summary(restored_admin),
                "retained_release_drill": retained_drill,
                "application_rollback_drill": app_drill,
                "source_application_access_retired_before_restore": True,
                "source_after_retirement": expected_source_state,
                "restore_target_after_admission": snapshot(restored_admin),
                "restored_auth_quarantine": quarantined,
                "external_auth_epoch_rotated": True,
                "fresh_session_with_rotated_epoch_verified": True,
                "postBackupAllocationRecovery": {
                    "beforeBackup": admitted_range, "afterBackup": later_range,
                    "recovered": recovered_range, "lostIds": lost_ids,
                    "newIds": recovered_ids, "noReuse": True,
                    "retention": "two temporary test journals; not retained/off-device acceptance",
                },
                "authored_export_validation": {k: v for k, v in export_report.items() if k != "explanations"},
                "restored_parity": restored_parity,
                "state_snapshot": before,
                "dump_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                "checks": [
                    "backup login dump, no owner/ACL",
                    "fresh target single-transaction restore as migration owner",
                    "exact effective owner/migrator/reader/operator/backup/session/editor privilege parity",
                    "exact all-table draft/audit/operation/allocation and sequence state",
                    "source application CONNECT revoked and sessions drained before restore; source content state unchanged",
                    "post-backup allocations absent from dump; restore quarantine blocks creates",
                    "complete independent journal reconciliation burns all permitted ranges; no ID reuse",
                    "paired authored saves/publication, unpublished history and editor slots restored",
                    "restored live sessions revoked and login transactions cleared; external epoch rotated",
                    "selected authored-release export/audit and exact restored export parity",
                    "fresh readers and complete actual-bank/API parity after restoration",
                ],
                "isolation": "unique tmpfs cluster; no persistent volumes or routine DB; credentials and archive temporary",
            }
            print("Paired fixture parity and recovery passed", flush=True)
    except SQLAlchemyError, ContentDatabaseError:
        raise RuntimeError(
            "Content verification failed; no SQL, content or credentials logged"
        ) from None
    finally:
        for value in engines:
            value.dispose()
        try:
            cleanup_targets = (("meducation.rollback-fixture", name + "-rollback-api"),
                               ("meducation.release-verify", name)) if fixture_started else ()
            for label, expected in cleanup_targets:
                ids = docker("ps", "--all", "--quiet", "--filter", "label=" + label + "=" + name).splitlines()
                for identifier in ids:
                    owned = json.loads(docker("inspect", identifier))[0]
                    assert owned["Name"] == "/" + expected and owned["Config"]["Labels"][label] == name
                    docker("rm", "--force", identifier)
            if report is not None:
                report["cleanup"] = "pass"
                if selected is None:
                    assert report["source_and_restored_publication"] == report["restored_publication"]
        except Exception:
            if report is not None:
                report.update(result="fail", cleanup="fail")
            raise
        finally:
            if report is not None:
                if selected is not None:
                    with args.output.open("x", encoding="utf-8") as output:
                        output.write(json.dumps(report, indent=2) + "\n")
                else:
                    args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()

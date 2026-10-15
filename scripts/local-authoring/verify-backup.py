"""Restore a retained local dump into a fresh disposable DB; never restore over authority."""

import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import UUID, uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend/src"))
sys.path.insert(0, str(ROOT / "scripts/containers"))
from backup import main as retain_backup
from dotenv import dotenv_values
from meducation_api.db.allocation_fence import issue_range, read_journal
from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import create_database_engine, database_url
from meducation_api.db.operations import activate_release, reserve_ids
from meducation_api.db.recovery import (
    invalidate_restored_sessions,
    restore_content_permissions,
)
from meducation_api.db.transfer import reconstruct_release
from pydantic import SecretStr
from sqlalchemy import text


@contextmanager
def source_rehearsal_lock(engine):
    """Serialize clones of one source database across processes/checkouts."""
    with engine.connect() as connection:
        admitted = connection.exec_driver_sql(
            "SELECT pg_try_advisory_lock(1936024677, 9)"
        ).scalar_one()
        if not admitted:
            raise RuntimeError("Another retained-backup rehearsal owns this source database.")
        connection.commit()
        try:
            yield
        finally:
            connection.exec_driver_sql("SELECT pg_advisory_unlock(1936024677, 9)")
            connection.commit()


def require_retired_writers(engine):
    """Read-only precondition; never stop workers or alter the routine authority."""
    with engine.connect() as connection:
        allowed = connection.exec_driver_sql("""
SELECT bool_or(has_database_privilege(role,current_database(),'CONNECT'))
FROM unnest(ARRAY['meducation_operator','meducation_editor','meducation_session',
                  'meducation_migrator','meducation_owner']) role
""").scalar_one()
        active = connection.exec_driver_sql("""
SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
AND usename IN ('meducation_operator','meducation_editor','meducation_session',
                'meducation_migrator','meducation_owner')
""").scalar_one()
    if allowed or active:
        raise RuntimeError(
            "Retire source writer CONNECT privileges and drain their connections before "
            "this writable recovery rehearsal. No source changes were performed. "
            "Read-only reader/backup access may remain available."
        )


def main():
    started = time.monotonic()
    root = ROOT / "var/local-authority"
    state = json.loads((root / "state.json").read_text())
    if not (state["phase"] == "initialized"):
        raise RuntimeError("Local cutover verification failed")
    env = dotenv_values(root / "operator.env")
    base = database_url(
        SecretStr(env["MEDUCATION_BOOTSTRAP_DATABASE_URL"]),
        role="meducation_bootstrap",
        local=True,
    )
    name = "meducation_verify_cutover_" + uuid4().hex[:12]
    original = create_database_engine(base, operator=True)
    engines = [original]
    try:
        with source_rehearsal_lock(original):
            verify_retained_backup(started, root, state, env, base, name, original, engines)
    finally:
        for engine in engines:
            engine.dispose()


def verify_retained_backup(started, root, state, env, base, name, original, engines):
    spec = importlib.util.spec_from_file_location(
        "recovery_probe", ROOT / "scripts/containers/verify-postgres-release.py"
    )
    probe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(probe)
    require_retired_writers(original)
    archive = retain_backup()
    with original.connect() as c:
        current = c.exec_driver_sql(
            "SELECT release_id,publication_sequence FROM content.active_publication"
        ).one()
        state = {
            **state,
            "releaseId": str(current[0]),
            "publicationSequence": current[1],
            "draftRevision": c.exec_driver_sql(
                "SELECT revision FROM content.draft"
            ).scalar_one(),
        }
    before = probe.snapshot(original)
    before_acl = probe.permission_snapshot(original)
    created = False
    try:
        with original.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
            c.exec_driver_sql("CREATE DATABASE " + name + " OWNER meducation_owner")
        created = True
        with archive.open("rb") as stream:
            result = subprocess.run(
                [
                    "docker",
                    "exec",
                    "-i",
                    "meducation-authority-postgres",
                    "pg_restore",
                    "--username",
                    "meducation_bootstrap",
                    "--dbname",
                    name,
                    "--role",
                    "meducation_owner",
                    "--single-transaction",
                    "--exit-on-error",
                    "--no-owner",
                    "--no-acl",
                ],
                stdin=stream,
                capture_output=True,
                timeout=600,
                check=False,
            )
        if not (result.returncode == 0):
            raise RuntimeError("Fresh target restore failed")
        restored = create_database_engine(base.set(database=name), operator=True)
        engines.append(restored)
        bootstrap(
            restored,
            RolePasswords(
                _env_file=None,
                **{
                    role + "_password": env[
                        "MEDUCATION_POSTGRES_" + role.upper() + "_PASSWORD"
                    ]
                    for role in [
                        "migrator",
                        "reader",
                        "operator",
                        "backup",
                        "session",
                        "editor",
                    ]
                },
            ),
        )
        migration = database_url(
            SecretStr(env["MEDUCATION_MIGRATION_DATABASE_URL"]),
            role="meducation_migrator",
            local=True,
        )
        mig = create_database_engine(migration.set(database=name), operator=True)
        engines.append(mig)
        with mig.begin() as c:
            restore_content_permissions(c)
        if not (probe.snapshot(restored) == before):
            raise RuntimeError("Table/sequence restoration differs")
        if not (probe.permission_snapshot(restored) == before_acl):
            raise RuntimeError("Effective ACL restoration differs")
        with original.connect() as source, restored.connect() as target:
            qt, ft, _ = reconstruct_release(source, UUID(state["releaseId"]))
            rq, rf, _ = reconstruct_release(target, UUID(state["releaseId"]))
            if not ((qt, ft) == (rq, rf)):
                raise RuntimeError("Local cutover verification failed")
        with mig.begin() as c:
            quarantine = invalidate_restored_sessions(c)
        with tempfile.TemporaryDirectory(
            prefix="meducation-cutover-journals-"
        ) as folder:
            paths = [Path(folder) / "primary", Path(folder) / "copy"]
            for target, source in zip(
                paths, ["allocation-primary", "allocation-local-copy"], strict=True
            ):
                shutil.copytree(ROOT / "var/backups/postgres" / source, target)
            old = read_journal(paths[0])[-1]
            recovered = issue_range(
                mig,
                primary=paths[0],
                independent=paths[1],
                size=1000,
                recovery=True,
                reason="Disposable retained local backup recovery acceptance",
                rehearsal=True,
            )
            op = database_url(
                SecretStr(env["MEDUCATION_OPERATOR_DATABASE_URL"]),
                role="meducation_operator",
                local=True,
            )
            operator = create_database_engine(op.set(database=name), operator=True)
            engines.append(operator)
            ids = reserve_ids(
                operator,
                operation_id=uuid4(),
                counts={"i": 1},
                expected_draft_revision=state["draftRevision"],
                expected_publication_sequence=state["publicationSequence"],
                intent="Local backup acceptance",
                actor="cutover-recovery-check",
                reason="Burn all prior admitted ranges on restored disposable target",
            )
            if not (int(ids["i"][0][1:]) >= old["ceilings"]["i"]):
                raise RuntimeError("Local cutover verification failed")
        from fastapi.testclient import TestClient
        from meducation_api.auth.config import AuthSettings
        from meducation_api.main import create_app
        from meducation_api.settings import Settings

        reader = base.set(
            username="meducation_reader",
            password=env["MEDUCATION_POSTGRES_READER_PASSWORD"],
            database=name,
        )
        app = create_app(
            Settings(
                _env_file=None,
                content_source="postgres",
                database_environment="local",
                database_url=reader.render_as_string(hide_password=False),
            ),
            auth_settings=AuthSettings(_env_file=None),
        )
        with restored.connect() as c:
            other = c.execute(
                text(
                    "SELECT release_id FROM content.releases WHERE state='finalized' AND release_id<>:id ORDER BY release_id LIMIT 1"
                ),
                {"id": UUID(state["releaseId"])},
            ).scalar_one()
            retained = c.exec_driver_sql(
                "SELECT count(*) FROM content.releases"
            ).scalar_one()
        sequence = state["publicationSequence"]
        with TestClient(app) as client:
            if client.get("/api/v1/subjects").status_code != 200:
                raise RuntimeError("Restored reader startup failed")
            for selected in [other, UUID(state["releaseId"])]:
                with operator.begin() as c:
                    publication = activate_release(
                        c,
                        operation_id=uuid4(),
                        release_id=selected,
                        expected_sequence=sequence,
                        actor="local-restoration-check",
                        reason="Disposable previous-release activation and return rehearsal",
                    )
                    sequence = publication.publication_sequence
                if client.get("/api/v1/subjects").status_code != 200:
                    raise RuntimeError("Restored retained-release reader failed")
            if client.get("/api/v1/flashcards/subjects").status_code != 200:
                raise RuntimeError("Restored paired reader failed")
        with restored.connect() as c:
            if (
                c.exec_driver_sql("SELECT count(*) FROM content.releases").scalar_one()
                != retained
            ):
                raise RuntimeError("Retained activation deleted later releases")
        if not (probe.snapshot(original) == before):
            raise RuntimeError("Authority changed during verification")
        report = {
            "result": "pass",
            "backupPath": str(archive.relative_to(ROOT)),
            "backupSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            "seconds": round(time.monotonic() - started, 2),
            "scope": "retained local backup, same available machine; no off-device/disaster recovery claim",
            "checks": [
                "fresh separate database restoration",
                "exact full content/auth table and sequence parity",
                "exact effective role privileges",
                "exact selected paired artifacts",
                "restored sessions revoked and login transactions cleared",
                "protected allocation quarantine and copied-journal recovery",
                "all prior admitted question IDs burned before resumed allocation",
                "compatible restored app/schema and paired reader startup",
                "previous-release activation and return preserve later releases",
                "original authority state unchanged",
            ],
            "quarantine": quarantine,
            "allocationRecovery": recovered,
            "newIds": ids,
        }
        (ROOT / "var/backups/postgres/local-restore-evidence.json").write_text(
            json.dumps(report, indent=2) + "\n"
        )
        print(
            json.dumps(
                {
                    "result": "pass",
                    "seconds": report["seconds"],
                    "checks": report["checks"],
                }
            ),
            flush=True,
        )
    finally:
        for engine in engines[1:]:
            engine.dispose()
        if created:
            with original.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as c:
                c.exec_driver_sql("DROP DATABASE " + name + " WITH (FORCE)")
        original.dispose()


if __name__ == "__main__":
    main()

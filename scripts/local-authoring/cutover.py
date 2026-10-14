"""Explicit local authority initialization. Never reimports into an existing target."""

import hashlib
import json
import os
import secrets
import subprocess
import sys
import time
from pathlib import Path
from uuid import UUID, uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend/src"))
sys.path.insert(0, str(ROOT / "scripts/containers"))
from compose_support import docker
from cryptography.fernet import Fernet
from meducation_api.admin.authoring import PairedAuthoringService
from meducation_api.db.allocation_fence import issue_range
from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import create_database_engine
from meducation_api.db.migrate import migration_head, upgrade
from meducation_api.db.operations import activate_release, save_draft
from meducation_api.db.transfer import (
    capture_pair,
    export_release,
    import_pair,
    reconstruct_release,
)
from sqlalchemy import URL

STATE_ROOT = ROOT / "var/local-authority"
BACKUPS = ROOT / "var/backups/postgres"
CONTAINER = "meducation-authority-postgres"
VOLUME = "meducation-authority-data"
PG = "postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"


def private(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write(value)


def main():
    os.umask(0o077)
    STATE_ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    BACKUPS.mkdir(parents=True, exist_ok=True, mode=0o700)
    if (STATE_ROOT / "state.json").exists():
        raise RuntimeError(
            "Target initialization already started; inspect the private state. Refusing automatic reimport/replay."
        )
    if (ROOT / "backend/.env").exists():
        raise RuntimeError(
            "Existing backend configuration requires reviewed integration; refusing replacement."
        )
    if docker(
        "ps", "-a", "--filter", "name=^/" + CONTAINER + "$", "--format", "{{.Names}}"
    ):
        raise RuntimeError("Authority container already exists; refusing replacement.")
    if VOLUME in docker("volume", "ls", "--format", "{{.Name}}").splitlines():
        raise RuntimeError(
            "Authority volume already exists; refusing reuse without review."
        )
    pair = capture_pair(
        ROOT / "src/content/questionBank.generated.json",
        ROOT / "src/content/flashcardBank.generated.json",
        repository=ROOT,
    )
    state = {
        "phase": "initializing",
        "sourceSha256": pair.source_hashes,
        "operations": {k: str(uuid4()) for k in ["import", "activate", "draft"]},
        "offDevice": "user-deferred 2026-10-14",
    }
    private(STATE_ROOT / "state.json", json.dumps(state, indent=2) + "\n")
    credentials = {
        role: secrets.token_urlsafe(32)
        for role in [
            "bootstrap",
            "migrator",
            "operator",
            "reader",
            "backup",
            "session",
            "editor",
        ]
    }
    private(
        STATE_ROOT / "postgres.env",
        "POSTGRES_USER=meducation_bootstrap\nPOSTGRES_DB=meducation_authority\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\nPOSTGRES_PASSWORD="
        + credentials["bootstrap"]
        + "\n",
    )
    docker("volume", "create", "--label", "meducation.authority=local", VOLUME)
    docker(
        "run",
        "--detach",
        "--name",
        CONTAINER,
        "--label",
        "meducation.authority=local",
        "--restart",
        "unless-stopped",
        "--env-file",
        str(STATE_ROOT / "postgres.env"),
        "--publish",
        "127.0.0.1:5433:5432",
        "--mount",
        "type=volume,src=" + VOLUME + ",dst=/var/lib/postgresql/data",
        PG,
        timeout=120,
    )
    for _ in range(180):
        result = subprocess.run(
            [
                "docker",
                "exec",
                CONTAINER,
                "pg_isready",
                "-U",
                "meducation_bootstrap",
                "-d",
                "meducation_authority",
            ],
            capture_output=True,
            check=False,
        )
        if result.returncode == 0:
            break
        time.sleep(0.5)
    else:
        raise RuntimeError("Authority PG17 startup deadline")
    urls = {
        role: URL.create(
            "postgresql+psycopg",
            username="meducation_" + role,
            password=secret,
            host="127.0.0.1",
            port=5433,
            database="meducation_authority",
            query={"sslmode": "disable"},
        )
        for role, secret in credentials.items()
    }
    jobs = ["MEDUCATION_DATABASE_ENVIRONMENT=local"]
    for role, key in [
        ("bootstrap", "BOOTSTRAP"),
        ("migrator", "MIGRATION"),
        ("operator", "OPERATOR"),
    ]:
        jobs.append(
            "MEDUCATION_"
            + key
            + "_DATABASE_URL="
            + urls[role].render_as_string(hide_password=False)
        )
    jobs += [
        "MEDUCATION_POSTGRES_" + role.upper() + "_PASSWORD=" + credentials[role]
        for role in credentials
        if role != "bootstrap"
    ]
    private(STATE_ROOT / "operator.env", "\n".join(jobs) + "\n")
    auth = [
        "MEDUCATION_CONTENT_SOURCE=postgres",
        "MEDUCATION_DATABASE_ENVIRONMENT=local",
        "MEDUCATION_DATABASE_URL="
        + urls["reader"].render_as_string(hide_password=False),
        "MEDUCATION_ADMIN_ENABLED=true",
        "MEDUCATION_ADMIN_ENVIRONMENT=local",
        "MEDUCATION_ADMIN_ORIGIN=http://127.0.0.1:5173",
        "MEDUCATION_ADMIN_ISSUER=http://127.0.0.1:5173/api/local-identity",
        "MEDUCATION_ADMIN_AUTHORIZATION_ENDPOINT=http://127.0.0.1:5173/api/local-identity/authorize",
        "MEDUCATION_ADMIN_TOKEN_ENDPOINT=http://127.0.0.1:5173/api/local-identity/token",
        "MEDUCATION_ADMIN_JWKS_URI=http://127.0.0.1:5173/api/local-identity/jwks",
        "MEDUCATION_ADMIN_CLIENT_ID=meducation-local-editor",
        "MEDUCATION_ADMIN_CLIENT_SECRET=" + secrets.token_urlsafe(32),
        "MEDUCATION_ADMIN_EDITOR_SUBJECT=local-editor",
        "MEDUCATION_ADMIN_EPOCH=" + secrets.token_urlsafe(32),
        "MEDUCATION_ADMIN_ENCRYPTION_KEY=" + Fernet.generate_key().decode(),
        "MEDUCATION_ADMIN_SESSION_DATABASE_URL="
        + urls["session"].render_as_string(hide_password=False),
        "MEDUCATION_ADMIN_EDITOR_DATABASE_URL="
        + urls["editor"].render_as_string(hide_password=False),
    ]
    private(STATE_ROOT / "runtime.env", "\n".join(auth) + "\n")
    engines = {
        role: create_database_engine(url, operator=True) for role, url in urls.items()
    }
    try:
        print("Bootstrapping roles and schema", flush=True)
        bootstrap(
            engines["bootstrap"],
            RolePasswords(
                _env_file=None,
                **{
                    role + "_password": credentials[role]
                    for role in credentials
                    if role != "bootstrap"
                },
            ),
        )
        upgrade(engines["migrator"])
        print("Importing frozen reviewed pair", flush=True)
        release = import_pair(
            engines["operator"],
            pair,
            operation_id=UUID(state["operations"]["import"]),
            actor="local-cutover-operator",
            reason="User-authorized local PostgreSQL authority cutover",
        )
        with engines["operator"].begin() as c:
            activate_release(
                c,
                operation_id=UUID(state["operations"]["activate"]),
                release_id=release.release_id,
                expected_sequence=0,
                actor="local-cutover-operator",
                reason="Activate reviewed cutover pair",
            )
            save_draft(
                c,
                operation_id=UUID(state["operations"]["draft"]),
                quiz_text=pair.quiz_artifact,
                flashcard_text=pair.flashcard_artifact,
                expected_revision=0,
                base_sequence=1,
                actor="local-cutover-operator",
                reason="Initialize reviewed authoritative draft",
            )
        with engines["operator"].connect() as c:
            qt, ft, _ = reconstruct_release(c, release.release_id)
            if not ((qt, ft) == (pair.quiz_artifact, pair.flashcard_artifact)):
                raise RuntimeError("Local cutover verification failed")
        journals = [BACKUPS / "allocation-primary", BACKUPS / "allocation-local-copy"]
        for folder in journals:
            folder.mkdir(mode=0o700)
        fence = issue_range(
            engines["migrator"],
            primary=journals[0],
            independent=journals[1],
            size=1000,
            recovery=False,
            reason="User-approved local-only retention; off-device deferred",
            local_copy_only=True,
        )
        # Deliberate nonmedical metadata rehearsal; restore exact original before finishing.
        service = PairedAuthoringService(
            engines["operator"], actor="local-cutover-rehearsal"
        )
        original = {"quizzes": json.loads(qt), "flashcards": json.loads(ft)}
        modified = json.loads(json.dumps(original))
        modified["quizzes"]["subjects"][0]["name"] += " (cutover rehearsal)"
        publications = []
        for candidate, reason in [
            (modified, "Temporary subject-label cutover rehearsal"),
            (original, "Restore exact reviewed subject label after cutover rehearsal"),
        ]:
            context = service.load()
            preview = service.preview(
                candidate,
                expected_revision=context.revision,
                expected_sequence=context.publication_sequence,
                reason=reason,
            )
            service.save(preview, operation_id=uuid4())
            context = service.load()
            preview = service.publish_preview(
                expected_revision=context.revision,
                expected_sequence=context.publication_sequence,
                reason=reason,
            )
            publication = service.publish(preview, operation_id=uuid4())
            publications.append(str(publication.release.release_id))
        print("Exporting final pair and retaining full local backup", flush=True)
        export = export_release(
            engines["operator"], UUID(publications[-1]), BACKUPS / "cutover-export"
        )
        passfile = STATE_ROOT / "backup.pgpass"
        private(
            passfile,
            "127.0.0.1:5432:*:meducation_backup:" + credentials["backup"] + "\n",
        )
        docker("cp", str(passfile), CONTAINER + ":/tmp/authority.pgpass")
        archive = BACKUPS / "cutover.dump"
        with archive.open("xb") as stream:
            archive.chmod(0o600)
            result = subprocess.run(
                [
                    "docker",
                    "exec",
                    "--env",
                    "PGPASSFILE=/tmp/authority.pgpass",
                    CONTAINER,
                    "pg_dump",
                    "--host",
                    "127.0.0.1",
                    "--username",
                    "meducation_backup",
                    "--no-password",
                    "--dbname",
                    "meducation_authority",
                    "--schema",
                    "content",
                    "--schema",
                    "admin_auth",
                    "--format=custom",
                    "--no-owner",
                    "--no-acl",
                ],
                stdout=stream,
                stderr=subprocess.PIPE,
                timeout=600,
                check=False,
            )
        docker("exec", CONTAINER, "rm", "/tmp/authority.pgpass")
        if result.returncode:
            raise RuntimeError("Local backup failed; no credentials logged")
        with engines["operator"].connect() as c:
            context = service.load()
            current_q, current_f, _ = reconstruct_release(c, UUID(publications[-1]))
            if not ((current_q, current_f) == (qt, ft)):
                raise RuntimeError("Local cutover verification failed")
        state.update(
            phase="initialized",
            schema=migration_head(),
            releaseId=publications[-1],
            publicationSequence=context.publication_sequence,
            draftRevision=context.revision,
            fence=fence,
            rehearsalPublications=publications,
            backupSha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
            export=export,
        )
        (STATE_ROOT / "state.json").write_text(json.dumps(state, indent=2) + "\n")
        print(
            "Local authority initialized; protected local dump/export and journals retained. Off-device explicitly deferred.",
            flush=True,
        )
    finally:
        for engine in engines.values():
            engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - boundary must never expose credential-bearing driver errors
        print(
            "Cutover stopped ("
            + type(error).__name__
            + "). Preserve local state/volume; no secrets logged.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None

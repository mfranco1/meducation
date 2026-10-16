"""Explicit synthetic PostgreSQL seeds for owned container smoke tests only."""

import json
import secrets
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from compose_support import docker

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend/src"))
from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import create_database_engine
from meducation_api.db.migrate import upgrade
from meducation_api.db.operations import activate_release
from meducation_api.db.transfer import capture_pair, import_pair
from sqlalchemy import URL

PG_IMAGE = "postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"
LABEL = "meducation.postgres-smoke"


def seed_database(port, password, folder, *, database="meducation_test_smoke"):
    """Caller must establish ownership of the loopback container before seeding."""
    if not database.startswith("meducation_test_") or not 1024 <= int(port) <= 65535:
        raise ValueError(
            "Smoke seeding requires an isolated test database/loopback port"
        )
    passwords = RolePasswords(
        _env_file=None,
        **{
            role + "_password": secrets.token_urlsafe(24)
            for role in ("migrator", "reader", "operator", "backup")
        },
    )
    engines = []

    def engine(role):
        value = create_database_engine(
            URL.create(
                "postgresql+psycopg",
                username="meducation_" + role,
                password=password
                if role == "bootstrap"
                else getattr(passwords, role + "_password").get_secret_value(),
                host="127.0.0.1",
                port=int(port),
                database=database,
                query={"sslmode": "disable"},
            ),
            operator=True,
        )
        engines.append(value)
        return value

    try:
        bootstrap(engine("bootstrap"), passwords)
        upgrade(engine("migrator"))
        operator = engine("operator")
        pair = capture_pair(
            ROOT / "e2e/fixtures/bank.json",
            ROOT / "e2e/fixtures/flashcard-bank.json",
            repository=ROOT,
        )
        release = import_pair(
            operator,
            pair,
            operation_id=uuid4(),
            actor="container-smoke",
            reason="Explicit synthetic fixture seed",
        )
        with operator.begin() as connection:
            activate_release(
                connection,
                operation_id=uuid4(),
                release_id=release.release_id,
                expected_sequence=0,
                actor="container-smoke",
                reason="Synthetic fixture publication",
            )
        reader = URL.create(
            "postgresql+psycopg",
            username="meducation_reader",
            password=passwords.reader_password.get_secret_value(),
            host="postgres",
            port=5432,
            database=database,
            query={"sslmode": "disable"},
        )
        env = folder / "reader.env"
        env.write_text(
            "MEDUCATION_DATABASE_ENVIRONMENT=local\nMEDUCATION_DATABASE_URL="
            + reader.render_as_string(hide_password=False)
            + "\n"
        )
        env.chmod(0o600)
        return env
    finally:
        for value in engines:
            value.dispose()


@contextmanager
def postgres_fixture(network, prefix, folder):
    name = prefix + "-postgres"
    secret = secrets.token_urlsafe(24)
    env = folder / "postgres.env"
    env.write_text(
        "POSTGRES_USER=meducation_bootstrap\nPOSTGRES_DB=meducation_test_smoke\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\nPOSTGRES_PASSWORD="
        + secret
        + "\n"
    )
    env.chmod(0o600)
    try:
        docker(
            "run",
            "--detach",
            "--name",
            name,
            "--label",
            LABEL + "=" + name,
            "--network",
            network,
            "--network-alias",
            "postgres",
            "--env-file",
            str(env),
            "--publish",
            "127.0.0.1::5432",
            "--tmpfs",
            "/var/lib/postgresql/data:rw,size=512m",
            PG_IMAGE,
        )
        deadline = time.monotonic() + 60
        while True:
            ready = subprocess.run(
                [
                    "docker",
                    "exec",
                    name,
                    "pg_isready",
                    "-h",
                    "127.0.0.1",
                    "-U",
                    "meducation_bootstrap",
                ],
                capture_output=True,
                timeout=5,
                check=False,
            )
            if ready.returncode == 0:
                break
            if time.monotonic() > deadline:
                raise RuntimeError("Disposable PostgreSQL readiness failed")
            time.sleep(0.25)
        info = json.loads(docker("inspect", name))[0]
        assert info["Config"]["Labels"].get(LABEL) == name
        binding = info["NetworkSettings"]["Ports"]["5432/tcp"][0]
        assert binding["HostIp"] == "127.0.0.1"
        yield seed_database(binding["HostPort"], secret, folder)
    finally:
        ids = docker(
            "ps", "--all", "--quiet", "--filter", "label=" + LABEL + "=" + name
        ).splitlines()
        for identifier in ids:
            info = json.loads(docker("inspect", identifier))[0]
            assert (
                info["Name"] == "/" + name
                and info["Config"]["Labels"].get(LABEL) == name
            )
            assert "/var/lib/postgresql/data" in info["HostConfig"]["Tmpfs"]
            docker("rm", "--force", identifier)

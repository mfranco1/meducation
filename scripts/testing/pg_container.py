"""Disposable loopback PG17 containers shared by the test harnesses."""

import json
import secrets
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "containers"))
from compose_support import docker

PG_IMAGE = "postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"
ROLES = ("MIGRATOR", "READER", "BACKUP", "OPERATOR", "SESSION", "EDITOR")


def wait_ready(name, database, timeout=45):
    deadline = time.monotonic() + timeout
    while True:
        ready = subprocess.run(
            ["docker", "exec", name, "pg_isready", "-h", "127.0.0.1",
             "-U", "meducation_bootstrap", "-d", database],
            capture_output=True,
            timeout=5,
            check=False,
        )
        if ready.returncode == 0:
            return
        if time.monotonic() > deadline:
            raise RuntimeError("Disposable PG17 did not become ready")
        time.sleep(0.25)


def start_postgres(name, database, folder, *docker_args):
    """Run a PG17 container (bootstrap superuser only) and return (password, host port)."""
    password = secrets.token_urlsafe(24)
    env_file = Path(folder) / "postgres.env"
    env_file.write_text(
        f"POSTGRES_USER=meducation_bootstrap\nPOSTGRES_DB={database}\n"
        f"POSTGRES_PASSWORD={password}\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n"
    )
    env_file.chmod(0o600)
    docker("run", "--detach", "--name", name, "--env-file", str(env_file), *docker_args,
           PG_IMAGE, timeout=120)
    wait_ready(name, database)
    port = json.loads(docker("inspect", name))[0]["NetworkSettings"]["Ports"]["5432/tcp"][0]
    return password, int(port["HostPort"])


def role_password_env():
    """Fresh MEDUCATION_POSTGRES_*_PASSWORD values for every application role."""
    return {f"MEDUCATION_POSTGRES_{role}_PASSWORD": secrets.token_urlsafe(24) for role in ROLES}

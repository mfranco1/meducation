"""Run fixture integration tests against one disposable loopback/tmpfs PG17 server."""

import argparse
import json
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
PG_IMAGE = "postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    name = "meducation-pg-content-" + uuid.uuid4().hex[:12]
    try:
        with tempfile.TemporaryDirectory(prefix="meducation-pg-content-") as temp:
            env_file = Path(temp) / "postgres.env"
            password = secrets.token_urlsafe(24)
            env_file.write_text(
                "POSTGRES_USER=meducation_bootstrap\nPOSTGRES_DB=meducation_test_content\nPOSTGRES_PASSWORD="
                + password
                + "\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n"
            )
            os.chmod(env_file, 0o600)
            docker(
                "run",
                "--detach",
                "--name",
                name,
                "--env-file",
                str(env_file),
                "--publish",
                "127.0.0.1::5432",
                "--tmpfs",
                "/var/lib/postgresql/data:rw,size=512m",
                PG_IMAGE,
                timeout=120,
            )
            deadline = time.monotonic() + 45
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
                        "-d",
                        "meducation_test_content",
                    ],
                    capture_output=True,
                    timeout=5,
                    check=False,
                )
                if ready.returncode == 0:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError("Disposable PG17 did not become ready")
                time.sleep(0.25)
            port = json.loads(docker("inspect", name))[0]["NetworkSettings"]["Ports"][
                "5432/tcp"
            ][0]["HostPort"]
            env = {
                **os.environ,
                "PYTHONPATH": str(ROOT / "backend/src"),
                "MEDUCATION_TEST_DATABASE_URL": "postgresql+psycopg://meducation_bootstrap:"
                + password
                + "@127.0.0.1:"
                + port
                + "/meducation_test_content?sslmode=disable",
            }
            for role in ("MIGRATOR", "READER", "BACKUP", "OPERATOR"):
                env["MEDUCATION_POSTGRES_" + role + "_PASSWORD"] = (
                    secrets.token_urlsafe(24)
                )
            command = [
                sys.executable,
                "-m",
                "pytest",
                "backend/tests/test_postgres_content.py",
                "-q",
                "--tb=short",
            ]
            result = subprocess.run(
                command,
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=180,
                check=False,
            )
            print(result.stdout)
            if result.returncode:
                raise RuntimeError(
                    "Postgres content integration failed; see fixture test output above"
                )
            report = {
                "result": "pass",
                "postgres_image": PG_IMAGE,
                "platform": "linux/"
                + docker("image", "inspect", "--format", "{{.Architecture}}", PG_IMAGE),
                "command": command,
                "pytest_output": result.stdout,
                "isolation": "unique tmpfs container; loopback port; fixture-only disposable schema; no routine database or volume used",
            }
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(report, indent=2) + "\n")
    finally:
        subprocess.run(
            ["docker", "rm", "--force", name],
            capture_output=True,
            timeout=30,
            check=False,
        )


if __name__ == "__main__":
    main()

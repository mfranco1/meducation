"""Run fixture integration tests against one disposable loopback/tmpfs PG17 server."""

import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from pg_container import PG_IMAGE, docker, role_password_env, start_postgres

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--maxfail", type=int, default=0)
    parser.add_argument("--keyword", default="")
    parser.add_argument(
        "--restartable",
        action="store_true",
        help="Use an owned disposable volume for real stop/start cases",
    )
    args = parser.parse_args()
    name = "meducation-pg-content-" + uuid.uuid4().hex[:12]
    volume = name + "-data"
    volume_created = False
    try:
        if args.restartable:
            docker(
                "volume",
                "create",
                "--label",
                "meducation.restartable-fixture=" + name,
                volume,
            )
            volume_created = True
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                fixed_port = reservation.getsockname()[1]
            storage = [
                "--mount",
                "type=volume,src=" + volume + ",dst=/var/lib/postgresql/data",
                "--label",
                "meducation.restartable-fixture=" + name,
            ]
            binding = "127.0.0.1:" + str(fixed_port) + ":5432"
        else:
            storage = ["--tmpfs", "/var/lib/postgresql/data:rw,size=512m"]
            binding = "127.0.0.1::5432"
        with tempfile.TemporaryDirectory(prefix="meducation-pg-content-") as temp:
            password, port = start_postgres(
                name, "meducation_test_content", temp, "--publish", binding, *storage
            )
            env = {
                **os.environ,
                **role_password_env(),
                "MEDUCATION_TEST_DATABASE_URL": "postgresql+psycopg://meducation_bootstrap:"
                + password
                + f"@127.0.0.1:{port}/meducation_test_content?sslmode=disable",
                "MEDUCATION_TEST_RESTART_CONTAINER": name if args.restartable else "",
            }
            command = [
                sys.executable,
                "-m",
                "pytest",
                *sorted(str(path) for path in (ROOT / "backend/tests").glob("test_pg_*.py")),
                "-q",
                "--tb=short",
                "--maxfail=" + str(args.maxfail),
                "-k",
                args.keyword,
            ]
            result = subprocess.run(
                command,
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=600,
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
                "isolation": (
                    "owned disposable restartable volume; removed after run; no routine database/volume"
                    if args.restartable
                    else "unique tmpfs container; loopback port; fixture-only disposable schema; no routine database or volume used"
                ),
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

        if volume_created:
            metadata = json.loads(docker("volume", "inspect", volume))[0]
            if metadata.get("Labels", {}).get("meducation.restartable-fixture") != name:
                raise RuntimeError("Fixture volume ownership changed; refusing removal")
            docker("volume", "rm", volume)


if __name__ == "__main__":
    main()

"""Run fixture integration tests against one disposable loopback/tmpfs PG17 server."""

import argparse
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from pg_container import role_password_env, start_postgres

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--maxfail", type=int, default=0)
    parser.add_argument("--keyword", default="")
    args = parser.parse_args()
    name = "meducation-pg-content-" + uuid.uuid4().hex[:12]
    try:
        with tempfile.TemporaryDirectory(prefix="meducation-pg-content-") as temp:
            password, port = start_postgres(
                name,
                "meducation_test_content",
                temp,
                "--publish",
                "127.0.0.1::5432",
                "--tmpfs",
                "/var/lib/postgresql/data:rw,size=512m",
            )
            env = {
                **os.environ,
                **role_password_env(),
                "MEDUCATION_TEST_DATABASE_URL": "postgresql+psycopg://meducation_bootstrap:"
                + password
                + f"@127.0.0.1:{port}/meducation_test_content?sslmode=disable",
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
                command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=600, check=False
            )
            print(result.stdout)
            if result.returncode:
                raise RuntimeError(
                    "Postgres content integration failed; see fixture test output above"
                )
    finally:
        subprocess.run(
            ["docker", "rm", "--force", name], capture_output=True, timeout=30, check=False
        )


if __name__ == "__main__":
    main()

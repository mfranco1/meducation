"""Isolated real reverse proxy + installed Postgres API + fixture learner/browser acceptance."""

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
sys.path.insert(0, str(ROOT / "backend/src"))
from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.engine import create_database_engine
from meducation_api.db.migrate import upgrade
from meducation_api.db.operations import activate_release
from meducation_api.db.transfer import capture_pair, import_pair
from sqlalchemy import URL

PG_IMAGE = "postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-image", default="meducation-api:local")
    parser.add_argument("--frontend-image", default="meducation-learner:local")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    run_id = uuid.uuid4().hex
    prefix = "meducation-l2-proxy-" + run_id
    label = "meducation.l2.proxy-smoke"
    created = []
    engines = []
    docker("network", "create", "--label", label + "=" + run_id, prefix)
    try:
        with tempfile.TemporaryDirectory(prefix="meducation-pg-browser-") as temp:
            folder = Path(temp)
            secret = secrets.token_urlsafe(24)
            passwords = RolePasswords(
                _env_file=None,
                **{
                    role + "_password": secrets.token_urlsafe(24)
                    for role in ("migrator", "reader", "operator", "backup")
                },
            )
            pg_env = folder / "pg.env"
            pg_env.write_text(
                "POSTGRES_USER=meducation_bootstrap\nPOSTGRES_DB=meducation_verify_browser\nPOSTGRES_PASSWORD="
                + secret
                + "\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n"
            )
            pg_env.chmod(0o600)

            def start(name, image, *options):
                created.append(prefix + "-" + name)
                return docker(
                    "run",
                    "--detach",
                    "--name",
                    prefix + "-" + name,
                    "--network",
                    prefix,
                    "--label",
                    label + "=" + run_id,
                    *options,
                    image,
                )

            start(
                "pg",
                PG_IMAGE,
                "--network-alias",
                "postgres",
                "--env-file",
                str(pg_env),
                "--publish",
                "127.0.0.1::5432",
                "--tmpfs",
                "/var/lib/postgresql/data:rw,size=512m",
            )

            def wait(container):
                deadline = time.monotonic() + 60
                while True:
                    state = json.loads(docker("inspect", container))[0]["State"]
                    if state.get("Health", {}).get("Status") == "healthy":
                        return
                    if not state["Running"] or time.monotonic() > deadline:
                        raise RuntimeError("Owned smoke container readiness failed")
                    time.sleep(0.25)

            deadline = time.monotonic() + 60
            while True:
                result = subprocess.run(
                    [
                        "docker",
                        "exec",
                        prefix + "-pg",
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
                if result.returncode == 0:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError("PG readiness failed")
                time.sleep(0.25)
            port = int(
                json.loads(docker("inspect", prefix + "-pg"))[0]["NetworkSettings"][
                    "Ports"
                ]["5432/tcp"][0]["HostPort"]
            )

            def engine(role):
                password = (
                    secret
                    if role == "bootstrap"
                    else getattr(passwords, role + "_password").get_secret_value()
                )
                value = create_database_engine(
                    URL.create(
                        "postgresql+psycopg",
                        username="meducation_" + role,
                        password=password,
                        host="127.0.0.1",
                        port=port,
                        database="meducation_verify_browser",
                        query={"sslmode": "disable"},
                    ),
                    operator=True,
                )
                engines.append(value)
                return value

            admin, migrator, operator = (
                engine("bootstrap"),
                engine("migrator"),
                engine("operator"),
            )
            bootstrap(admin, passwords)
            upgrade(migrator)
            qp, fp = (
                ROOT / "e2e/fixtures/bank.json",
                ROOT / "e2e/fixtures/flashcard-bank.json",
            )
            pair = capture_pair(qp, fp, repository=ROOT)
            original = import_pair(
                operator,
                pair,
                operation_id=uuid.uuid4(),
                actor="local-browser-probe",
                reason="Paired fixture import",
            )
            duplicate = import_pair(
                operator,
                pair,
                operation_id=uuid.uuid4(),
                actor="local-browser-probe",
                reason="Unchanged fixture reimport",
            )
            if duplicate != original:
                raise RuntimeError("Unchanged fixture pair created a different release")
            with operator.begin() as connection:
                activate_release(
                    connection,
                    operation_id=uuid.uuid4(),
                    release_id=original.release_id,
                    expected_sequence=0,
                    actor="local-browser-probe",
                    reason="Browser fixture activation",
                )
            changed = json.loads(qp.read_text())
            changed["questions"][0]["stem"] = (
                "Changed fixture question after publication"
            )
            changed_path = folder / "changed.json"
            changed_path.write_text(json.dumps(changed))
            new_pair = capture_pair(changed_path, fp, repository=ROOT)
            import_pair(
                operator,
                new_pair,
                operation_id=uuid.uuid4(),
                actor="local-browser-probe",
                reason="Changed-content conflict fixture",
            )
            pgpass = folder / "pgpass"
            pgpass.write_text(
                "127.0.0.1:5432:*:meducation_operator:"
                + passwords.operator_password.get_secret_value()
                + "\n"
            )
            pgpass.chmod(0o600)
            docker("cp", str(pgpass), prefix + "-pg:/tmp/browser.pgpass")
            reader = URL.create(
                "postgresql+psycopg",
                username="meducation_reader",
                password=passwords.reader_password.get_secret_value(),
                host="postgres",
                port=5432,
                database="meducation_verify_browser",
                query={"sslmode": "disable"},
            )
            api_env = folder / "reader.env"
            api_env.write_text(
                "MEDUCATION_CONTENT_SOURCE=postgres\nMEDUCATION_DATABASE_ENVIRONMENT=local\nMEDUCATION_DATABASE_URL="
                + reader.render_as_string(hide_password=False)
                + "\n"
            )
            api_env.chmod(0o600)
            start(
                "api",
                args.api_image,
                "--network-alias",
                "api",
                "--env-file",
                str(api_env),
                "--read-only",
                "--tmpfs",
                "/tmp",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
            )
            wait(prefix + "-api")
            start(
                "frontend",
                args.frontend_image,
                "--publish",
                "127.0.0.1::8080",
                "--read-only",
                "--tmpfs",
                "/tmp",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
            )
            wait(prefix + "-frontend")
            binding = json.loads(docker("inspect", prefix + "-frontend"))[0][
                "NetworkSettings"
            ]["Ports"]["8080/tcp"][0]
            if binding["HostIp"] != "127.0.0.1":
                raise RuntimeError("Browser smoke requires loopback origin")
            origin = "http://127.0.0.1:" + binding["HostPort"]
            env = {
                **os.environ,
                "MEDUCATION_CONTAINER_URL": origin,
                "MEDUCATION_SMOKE_FRONTEND": prefix + "-frontend",
                "MEDUCATION_SMOKE_RUN_ID": run_id,
                "MEDUCATION_SMOKE_PYTHON": sys.executable,
                "MEDUCATION_POSTGRES_BROWSER": "1",
            }
            browser = subprocess.run(
                [
                    "npx",
                    "playwright",
                    "test",
                    "--config=playwright.containers.config.ts",
                ],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=900,
                check=False,
            )
            print(browser.stdout)
            if browser.returncode:
                raise RuntimeError(
                    "Postgres learner browser suite failed; see fixture output above"
                )
            report = {
                "result": "pass",
                "platform": "linux/"
                + docker(
                    "image", "inspect", "--format", "{{.Architecture}}", args.api_image
                ),
                "api_image": docker(
                    "image", "inspect", "--format", "{{.Id}}", args.api_image
                ),
                "frontend_image": docker(
                    "image", "inspect", "--format", "{{.Id}}", args.frontend_image
                ),
                "browser_output": browser.stdout,
                "revisions": {
                    "quiz": original.quiz_revision,
                    "flashcard": original.flashcard_revision,
                },
                "checks": [
                    "installed reader API + actual shipped proxy",
                    "all existing learner/progress-backup/recreation Chromium flows",
                    "unchanged reimport and PostgreSQL API recreation retain study/history",
                    "changed-content conflict/restart behavior",
                ],
                "isolation": "owned labeled network/tmpfs PG; disposable fixtures only; no routine DB/volume",
            }
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + "\n")
    finally:
        for value in engines:
            value.dispose()
        for name in reversed(created):
            subprocess.run(
                ["docker", "rm", "--force", name],
                capture_output=True,
                timeout=30,
                check=False,
            )
        subprocess.run(
            ["docker", "network", "rm", prefix],
            capture_output=True,
            timeout=30,
            check=False,
        )


if __name__ == "__main__":
    main()

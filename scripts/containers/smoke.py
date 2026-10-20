"""Container smoke test: build the images, start Compose with a disposable seeded Postgres, probe over HTTP."""

import json
import os
import secrets
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from compose_support import docker, service_container, wait_services
from postgres_fixture import seed_database

ROOT = Path(__file__).resolve().parents[2]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def get(origin, path):
    try:
        response = urllib.request.urlopen(origin + path, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read()


def main():
    project = "meducation-smoke-" + uuid.uuid4().hex[:12]
    env = {k: v for k, v in os.environ.items() if not k.startswith(("MEDUCATION_", "COMPOSE_"))}
    with tempfile.TemporaryDirectory(prefix="meducation-smoke-") as temp:
        env_file = Path(temp) / ".env"
        bootstrap_password = secrets.token_urlsafe(32)
        env_file.write_text(
            "MEDUCATION_FRONTEND_PORT=0\nMEDUCATION_POSTGRES_PORT=0\n"
            f"MEDUCATION_POSTGRES_BOOTSTRAP_PASSWORD={bootstrap_password}\n"
        )
        env_file.chmod(0o600)
        override = Path(temp) / "fixture.json"
        override.write_text(
            json.dumps({"services": {"postgres": {"environment": {"POSTGRES_DB": "meducation_test_smoke"}}}})
        )

        def compose(*command, timeout=300):
            result = subprocess.run(
                ["docker", "compose", "--project-name", project, "--env-file", str(env_file),
                 "--file", str(ROOT / "compose.yaml"), "--file", str(override),
                 "--file", str(ROOT / "ops/containers/compose.db-port.yaml"), "--profile", "db", *command],
                cwd=ROOT, env=env, text=True, capture_output=True, timeout=timeout, check=False,
            )
            if result.returncode:
                # Never print resolved config or stdout; they can contain credentials.
                raise RuntimeError(f"docker compose {command[0]} failed: {result.stderr[-1500:]}")
            return result.stdout.strip()

        def published(service, port):
            container = service_container(project, service)
            binding = json.loads(docker("inspect", container))[0]["NetworkSettings"]["Ports"][port][0]
            require(binding["HostIp"] == "127.0.0.1", service + " must bind loopback")
            return binding["HostPort"]

        try:
            print("Building API and learner images", flush=True)
            compose("build", "api", "frontend", timeout=900)
            compose("up", "--detach", "postgres", timeout=120)
            wait_services(project, ["postgres"])
            reader_env = seed_database(published("postgres", "5432/tcp"), bootstrap_password, Path(temp))
            with env_file.open("a") as stream:
                stream.write(reader_env.read_text())
            compose("up", "--detach", "--no-build", "api", "frontend", timeout=120)
            wait_services(project, ["api", "frontend"])
            origin = "http://127.0.0.1:" + published("frontend", "8080/tcp")

            status, body = get(origin, "/")
            require(status == 200 and b'<div id="root"' in body, "Learner page did not load")
            status, body = get(origin, "/api/v1/subjects")
            require(status == 200 and json.loads(body)["subjects"], "Seeded content missing through /api")
            for path in ("/health/frontend", "/health/live", "/health/ready"):
                require(get(origin, path)[0] == 200, "Health route failed: " + path)
            require(get(origin, "/admin.html")[0] == 404, "Learner image serves /admin.html")
            for path in ("/", "/favicon.svg"):
                with urllib.request.urlopen(origin + path, timeout=15) as response:
                    require(
                        "frame-ancestors 'none'" in response.headers.get("Content-Security-Policy", "")
                        and response.headers.get("X-Content-Type-Options") == "nosniff",
                        "Missing security headers: " + path,
                    )
            print("Container smoke passed.")
        finally:
            try:
                compose("down", "--volumes", "--timeout", "30", timeout=120)
            except RuntimeError as error:
                print("Cleanup failed: " + str(error))


if __name__ == "__main__":
    main()

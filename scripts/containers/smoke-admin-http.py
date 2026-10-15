"""Private editor browser acceptance in isolated PG17/API/nginx containers."""

import argparse
import json
import os
import secrets
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from compose_support import docker

ROOT = Path(__file__).resolve().parents[2]
PG = "postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"
NGINX = "nginxinc/nginx-unprivileged:1.30.5-trixie@sha256:8f18dedfceea3d7feb98792810c8c9925c985890ade257f2ec1b2f492b4eaebb"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="meducation-api:l4-step5")
    parser.add_argument("--frontend-image", help="Optional packaged admin image instead of host dist assets")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--grep", default="")
    args = parser.parse_args()
    name = "meducation-editor-" + uuid.uuid4().hex[:10]
    network, pg, api, proxy = [name + s for s in ("-net", "-pg", "-api", "-proxy")]
    try:
        docker("network", "create", network)
        with tempfile.TemporaryDirectory(prefix=name) as folder:
            temp = Path(folder)
            os.chmod(temp, 0o755)
            password = secrets.token_urlsafe(24)
            env = temp / "postgres.env"
            env.write_text(
                "POSTGRES_USER=meducation_bootstrap\nPOSTGRES_DB=meducation_test_editor\nPOSTGRES_PASSWORD="
                + password
                + "\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n"
            )
            os.chmod(env, 0o600)
            asset_mount = [] if args.frontend_image else [
                "--mount", f"type=bind,src={ROOT / 'dist'},dst=/opt/meducation/html,readonly",
            ]
            docker(
                "run",
                "--detach",
                "--name",
                pg,
                "--network",
                network,
                "--network-alias",
                "postgres",
                "--env-file",
                str(env),
                "--tmpfs",
                "/var/lib/postgresql/data:rw,size=512m",
                PG,
            )
            for _ in range(100):
                check = subprocess.run(
                    [
                        "docker",
                        "exec",
                        pg,
                        "pg_isready",
                        "-U",
                        "meducation_bootstrap",
                        "-d",
                        "meducation_test_editor",
                    ],
                    capture_output=True,
                    check=False,
                )
                if check.returncode == 0:
                    break
                time.sleep(0.25)
            else:
                raise RuntimeError("Fixture PG17 startup timed out")
            api_env = temp / "api.env"
            api_env.write_text(
                "FIXTURE_DATABASE_URL=postgresql+psycopg://meducation_bootstrap:"
                + password
                + "@postgres:5432/meducation_test_editor?sslmode=disable\n"
                + "".join(
                    "MEDUCATION_POSTGRES_"
                    + role
                    + "_PASSWORD="
                    + secrets.token_urlsafe(24)
                    + "\n"
                    for role in [
                        "MIGRATOR",
                        "READER",
                        "OPERATOR",
                        "BACKUP",
                        "SESSION",
                        "EDITOR",
                    ]
                )
            )
            os.chmod(api_env, 0o600)
            (temp / "editor_http.py").write_bytes(
                (ROOT / "scripts/containers/fixtures/editor_http.py").read_bytes()
            )
            (temp / "pair.json").write_bytes(
                (ROOT / "tests/fixtures/paired-authoring-cases.json").read_bytes()
            )
            docker(
                "run",
                "--detach",
                "--name",
                api,
                "--network",
                network,
                "--publish",
                "127.0.0.1::8080",
                "--env-file",
                str(api_env),
                "--mount",
                f"type=bind,src={temp},dst=/fixture,readonly",
                "--entrypoint",
                "python",
                args.image,
                "/fixture/editor_http.py",
            )
            port = json.loads(docker("inspect", api))[0]["NetworkSettings"]["Ports"][
                "8080/tcp"
            ][0]["HostPort"]
            origin = "http://127.0.0.1:" + port
            (temp / "origin.txt").write_text(origin)
            config = (
                (ROOT / "ops/containers/nginx.conf")
                .read_text()
                .replace("server api:8000 resolve;", "server 127.0.0.1:8000;")
                .replace(
                    "location = /admin.html {\n            return 404;\n        }",
                    'location = /admin.html { try_files $uri =404; add_header Cache-Control "no-store" always; }\n        location /fixture/ { include /etc/nginx/meducation-proxy.conf; }\n        location = /fixture/upstream-unavailable { proxy_pass http://127.0.0.1:1; }',
                )
            )
            (temp / "nginx.conf").write_text(config)
            docker(
                "run",
                "--detach",
                "--name",
                proxy,
                "--network",
                "container:" + api,
                "--mount",
                f"type=bind,src={temp / 'nginx.conf'},dst=/etc/nginx/nginx.conf,readonly",
                "--mount",
                f"type=bind,src={ROOT / 'ops/containers/proxy.conf'},dst=/etc/nginx/meducation-proxy.conf,readonly",
                *asset_mount,
                args.frontend_image or NGINX,
            )
            import urllib.request

            for _ in range(240):
                try:
                    with urllib.request.urlopen(
                        origin + "/api/admin/session", timeout=2
                    ) as response:
                        if response.status == 200:
                            break
                except (OSError, TimeoutError):
                    pass
                time.sleep(0.25)
            else:
                # Logs contain no credentials, body or OIDC callback query.
                for failed in (api, proxy):
                    logs = subprocess.run(
                        ["docker", "logs", failed],
                        capture_output=True,
                        text=True,
                        check=False,
                        timeout=10,
                    )
                    print(logs.stdout)
                    print(logs.stderr)
                raise RuntimeError("Private editor fixture startup failed")
            result = subprocess.run(
                [
                    "npx",
                    "playwright",
                    "test",
                    "--config=playwright.admin-http.config.ts",
                    "--grep",
                    args.grep,
                ],
                cwd=ROOT,
                env={**os.environ, "MEDUCATION_EDITOR_HTTP_ORIGIN": origin},
                capture_output=True,
                check=False,
                text=True,
                timeout=360,
            )
            print(result.stdout)
            if result.returncode:
                print(result.stderr)
                raise RuntimeError("Private editor browser acceptance failed")
            # Exercise both Uvicorn and real Nginx failure logs, including native
            # proxy errors whose default format would contain the full request.
            canary = "L5_LOG_SECRET_" + uuid.uuid4().hex
            import urllib.error

            def probe(path, expected, *, data=None, method=None):
                req = urllib.request.Request(
                    origin + path,
                    data=data,
                    method=method,
                    headers={
                        "Cookie": "secret=" + canary,
                        "X-Forwarded-For": canary,
                        "X-Request-ID": canary,
                        "Content-Type": "application/json",
                    },
                )
                try:
                    response = urllib.request.urlopen(req, timeout=15)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    if response.status != expected:
                        raise RuntimeError(
                            f"Operational log probe status {response.status}, expected {expected}"
                        )
                    response.read()

            probe("/fixture/operational-failure/" + canary + "?code=" + canary, 500)
            probe("/api/" + canary + "?token=" + canary, 400, method=canary)
            # The public ingress's default 1 MiB admission should fail before API.
            probe(
                "/api/" + canary + "?code=" + canary,
                413,
                data=(canary + " ").encode() + b"x" * (1024 * 1024),
            )
            probe("/fixture/upstream-unavailable?code=" + canary, 502)
            captured = {}
            for target, label in ((api, "api"), (proxy, "proxy")):
                logs = subprocess.run(
                    ["docker", "logs", target],
                    capture_output=True,
                    text=True,
                    check=True,
                    timeout=15,
                )
                combined = logs.stdout + logs.stderr
                if canary in combined:
                    # Never print the failed log itself; it may contain the canary.
                    raise RuntimeError(
                        "Operational log redaction canary leaked in " + label
                    )
                captured[label] = combined
            if (
                '"event":"request_complete"' not in captured["api"]
                or '"event":"proxy_request"' not in captured["proxy"]
            ):
                raise RuntimeError("Structured operational request events missing")
            if (
                '"failure_category":"internal_error"' not in captured["api"]
                or '"failure_category":"upstream_unavailable"' not in captured["proxy"]
            ):
                raise RuntimeError("Operational failure categories missing")
            report = {
                "result": "pass",
                "operational_log_canaries": "pass: path/query/method/headers/body/exception canaries; API 500, proxy 413 and upstream 502; generated request correlation; no raw log retention",
                "isolation": "unique PG17 tmpfs, API and nginx containers/network; synthetic fixture identity; no routine volumes",
                "image": args.image,
                "frontendImage": args.frontend_image,
                "frontendImageId": docker("image", "inspect", "--format", "{{.Id}}", args.frontend_image) if args.frontend_image else None,
                "imageId": docker(
                    "image", "inspect", "--format", "{{.Id}}", args.image
                ),
                "platform": docker(
                    "image", "inspect", "--format", "{{.Architecture}}", args.image
                ),
                "playwrightOutput": result.stdout,
                "identity": "signed local synthetic factor/nonce/PKCE fixture; maintained OIDC verifier; no production provider acceptance",
            }
            if args.output:
                args.output.write_text(json.dumps(report, indent=2) + "\n")
    finally:
        for container in (proxy, api, pg):
            subprocess.run(
                ["docker", "rm", "--force", container],
                capture_output=True,
                check=False,
                timeout=30,
            )
        subprocess.run(
            ["docker", "network", "rm", network],
            capture_output=True,
            check=False,
            timeout=30,
        )


if __name__ == "__main__":
    main()

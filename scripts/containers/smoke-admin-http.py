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
                    'location = /admin.html { try_files $uri =404; add_header Cache-Control "no-store" always; }\n        location /fixture/ { include /etc/nginx/meducation-proxy.conf; }',
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
                "--mount",
                f"type=bind,src={ROOT / 'dist'},dst=/opt/meducation/html,readonly",
                NGINX,
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
            report = {
                "result": "pass",
                "isolation": "unique PG17 tmpfs, API and nginx containers/network; synthetic fixture identity; no routine volumes",
                "image": args.image,
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

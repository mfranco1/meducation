"""Isolated installed-image PG17 role/toolchain acceptance; never touches Compose volumes."""

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

PG_IMAGE = "postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="meducation-api:local")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    tag = "meducation-db-toolchain-" + uuid.uuid4().hex[:12]
    pg, runner, network = tag + "-pg", tag + "-probe", tag + "-net"
    created = []
    network_created = False
    try:
        docker("network", "create", network)
        network_created = True
        with tempfile.TemporaryDirectory(prefix="meducation-db-toolchain-") as temp:
            pg_env, probe_env = Path(temp) / "postgres.env", Path(temp) / "probe.env"
            secret = secrets.token_urlsafe(24)
            pg_env.write_text(
                "POSTGRES_USER=meducation_bootstrap\nPOSTGRES_DB=meducation\nPOSTGRES_PASSWORD="
                + secret
                + "\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n"
            )
            probe_env.write_text(
                "MEDUCATION_SMOKE_BOOTSTRAP_PASSWORD="
                + secret
                + "\n"
                + "".join(
                    "MEDUCATION_POSTGRES_"
                    + role
                    + "_PASSWORD="
                    + secrets.token_urlsafe(24)
                    + "\n"
                    for role in ("MIGRATOR", "READER", "BACKUP", "OPERATOR")
                )
            )
            os.chmod(pg_env, 0o600)
            os.chmod(probe_env, 0o600)
            created.append(pg)
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
                str(pg_env),
                "--tmpfs",
                "/var/lib/postgresql/data:rw,size=512m",
                PG_IMAGE,
                timeout=120,
            )
            deadline = time.monotonic() + 45
            while True:
                check = subprocess.run(
                    [
                        "docker",
                        "exec",
                        pg,
                        "pg_isready",
                        "-h",
                        "127.0.0.1",
                        "-U",
                        "meducation_bootstrap",
                        "-d",
                        "meducation",
                    ],
                    capture_output=True,
                    check=False,
                )
                if check.returncode == 0:
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError("Isolated PG17 readiness failed")
                time.sleep(0.25)
            created.append(runner)
            probe = Path(__file__).with_name("db_toolchain_probe.py").resolve()
            output = docker(
                "run",
                "--rm",
                "--name",
                runner,
                "--network",
                network,
                "--env-file",
                str(probe_env),
                "--read-only",
                "--tmpfs",
                "/tmp",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--mount",
                f"type=bind,src={probe},dst=/probe.py,readonly",
                args.image,
                "python",
                "/probe.py",
                timeout=120,
            )
            report = json.loads(output)
            report["platform"] = "linux/" + docker(
                "image", "inspect", "--format", "{{.Architecture}}", args.image
            )
            report["image_id"] = docker(
                "image", "inspect", "--format", "{{.Id}}", args.image
            )
            report["postgres_image"] = PG_IMAGE
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(report, indent=2) + "\n")
            print(json.dumps(report, indent=2))
    finally:
        for container in reversed(created):
            subprocess.run(
                ["docker", "rm", "--force", container], capture_output=True, check=False
            )
        if network_created:
            subprocess.run(
                ["docker", "network", "rm", network], capture_output=True, check=False
            )


if __name__ == "__main__":
    main()

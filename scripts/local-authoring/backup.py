"""Retain a new protected local full backup of the designated authority."""

import hashlib
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/containers"))
from compose_support import docker
from dotenv import dotenv_values


def main():
    os.umask(0o077)
    name = "meducation-authority-postgres"
    metadata = json.loads(docker("inspect", name))[0]
    if metadata["Config"].get("Labels", {}).get(
        "meducation.authority"
    ) != "local" or not any(
        m.get("Name") == "meducation-authority-data" for m in metadata["Mounts"]
    ):
        raise RuntimeError("Refusing unexpected authority container")
    env = dotenv_values(ROOT / "var/local-authority/operator.env")
    secret = env["MEDUCATION_POSTGRES_BACKUP_PASSWORD"]
    output = ROOT / "var/backups/postgres"
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
    archive = output / (stamp + ".dump")
    passfile = output / ("." + stamp + ".pgpass")
    passfile.write_text("127.0.0.1:5432:*:meducation_backup:" + secret + "\n")
    passfile.chmod(0o600)
    remote = "/tmp/" + stamp + ".pgpass"
    try:
        docker("cp", str(passfile), name + ":" + remote)
        with archive.open("xb") as stream:
            result = subprocess.run(
                [
                    "docker",
                    "exec",
                    "--env",
                    "PGPASSFILE=" + remote,
                    name,
                    "pg_dump",
                    "--host",
                    "127.0.0.1",
                    "--username",
                    "meducation_backup",
                    "--no-password",
                    "--dbname",
                    "meducation_authority",
                    "--schema",
                    "content",
                    "--schema",
                    "admin_auth",
                    "--format=custom",
                    "--no-owner",
                    "--no-acl",
                ],
                stdout=stream,
                stderr=subprocess.PIPE,
                timeout=600,
                check=False,
            )
        if result.returncode:
            archive.unlink()
            raise RuntimeError("Backup failed; no credentials or SQL logged")
        with archive.open("rb") as stream:
            listing = subprocess.run(
                ["docker", "exec", "-i", name, "pg_restore", "--list"],
                stdin=stream,
                capture_output=True,
                timeout=60,
                check=False,
            )
        if (
            listing.returncode
            or b"SCHEMA - content" not in listing.stdout
            or b"SCHEMA - admin_auth" not in listing.stdout
        ):
            raise RuntimeError(
                "Archive verification failed; preserve archive for inspection"
            )
        report = {
            "createdUtc": stamp,
            "database": "meducation_authority",
            "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            "schemas": ["content", "admin_auth"],
            "retention": "local-only; off-device user-deferred",
        }
        archive.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
        print("Retained verified local full backup: " + str(archive))
        return archive
    finally:
        docker("exec", name, "rm", "-f", remote)
        passfile.unlink(missing_ok=True)


if __name__ == "__main__":
    main()

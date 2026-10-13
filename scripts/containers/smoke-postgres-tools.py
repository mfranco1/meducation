"""Rehearse local PG17 recovery on a generated project; never touch developer data."""

import argparse
import hashlib
import json
import os
import secrets
import stat
import subprocess
import tempfile
import uuid
from pathlib import Path

from compose_support import docker
from postgres_tools import PostgresTools

ROOT = Path(__file__).resolve().parents[2]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    project = "meducation-l2-tools-" + uuid.uuid4().hex[:16]
    report = {"project": project, "platform": docker("info", "--format", "{{.OSType}}/{{.Architecture}}"),
              "checks": [], "scope": "synthetic development bootstrap recovery; no L3 bank/role parity"}
    environment = {k: v for k, v in os.environ.items() if not k.startswith(("MEDUCATION_", "COMPOSE_"))}
    with tempfile.TemporaryDirectory(prefix="meducation-l2-tools-") as temp:
        folder = Path(temp)
        envfile = folder / ".env"
        # Exercise pgpass escaping as well as SCRAM authentication. Do not log this value.
        envfile.write_text("MEDUCATION_POSTGRES_BOOTSTRAP_PASSWORD='" + secrets.token_hex(24) + ":\\secret'\n")
        envfile.chmod(0o600)

        def compose(*command):
            result = subprocess.run(["docker", "compose", "--project-name", project,
                                     "--env-file", str(envfile), "--file", str(ROOT / "compose.yaml"),
                                     "--profile", "db", *command], env=environment,
                                    capture_output=True, timeout=120, check=False)
            require(result.returncode == 0, "Isolated Compose operation failed")

        def cli(*command, success=True, input_bytes=None):
            result = subprocess.run([str(ROOT / ".venv/bin/python"), str(ROOT / "scripts/containers/postgres.py"),
                                     "--project", project, *command], input=input_bytes, capture_output=True, timeout=360, check=False)
            require((result.returncode == 0) == success, "Unexpected CLI result: " + command[0])
            return result.stdout.decode()

        try:
            compose("up", "--detach", "postgres")
            tools = PostgresTools(project)
            report["versions"] = json.loads(cli("versions"))
            require(cli("psql", input_bytes=b"SELECT current_database();\n").strip() == "meducation", "psql CLI stdin failed")
            report["checks"].append("PG17 psql/pg_dump/pg_restore and authenticated server major; escaped pgpass credentials")
            tools.sql("postgres", "CREATE DATABASE l2_source;")
            tools.sql("l2_source", "CREATE TABLE sentinel (position integer GENERATED ALWAYS AS IDENTITY, value text, metadata jsonb);"
                      "INSERT INTO sentinel(value, metadata) VALUES ('µg: α\\β', '{\"source\":\"synthetic\",\"order\":[3,1,2]}');"
                      "INSERT INTO sentinel(value, metadata) SELECT md5(i::text), jsonb_build_object('index',i) FROM generate_series(1,5000) i;")
            query = "SELECT md5(string_agg(row_to_json(s)::text, E'\\n' ORDER BY position)) FROM sentinel s;"
            sentinel = tools.sql("l2_source", query)
            backup = folder / "backups" / "rehearsal.dump"
            cli("dump", "--database", "l2_source", "--output", str(backup))
            require(stat.S_IMODE(backup.stat().st_mode) == 0o600, "Archive permission is not 0600")
            original = backup.read_bytes()
            require(original.startswith(b"PGDMP"), "Not custom-format archive")
            cli("dump", "--database", "l2_missing", "--output", str(backup), success=False)
            require(backup.read_bytes() == original and not list(backup.parent.glob(".pg-dump-*")), "Failed dump replaced backup/leaked temp output")
            cli("restore", "--database", "l2_restored", "--input", str(backup))
            require(tools.sql("l2_restored", query) == sentinel, "Restored sentinel/order/JSON/text mismatch")
            require(tools.sql("l2_restored", "INSERT INTO sentinel(value) VALUES ('sequence check') RETURNING position;").splitlines()[0] == "5002", "Sequence did not restore")
            cli("restore", "--database", "l2_source", "--input", str(backup), success=False)
            cli("restore", "--database", "meducation", "--input", str(backup), success=False)
            require(tools.sql("l2_source", query) == sentinel, "Existing source changed")
            report["checks"].append("custom dump 0600; failed dump preserves good archive; fresh restore matches 5001 rows/text/JSON/order/sequence; existing/reserved targets rejected")
            broken = folder / "truncated.dump"
            broken.write_bytes(original[:-100])
            cli("restore", "--database", "l2_failed", "--input", str(broken), success=False)
            # Listing succeeds, createdb succeeds, restore fails mid-stream and rolls back DDL/data.
            require(tools.sql("l2_failed", "SELECT count(*) FROM pg_tables WHERE schemaname='public';").strip() == "0", "Failed restore left partial tables")
            report["checks"].append("truncated archive fails during restore; single transaction leaves newly created target empty")
            require(not docker("exec", tools.container, "sh", "-ec", "find /tmp -name 'meducation-pgpass.*' -print"), "Ephemeral credential file leaked")
            cli("discard-volume", "--discard-disposable-data", success=False)
            report["checks"].append("credential tmpfs files cleaned on success/failure; destructive reset refuses referenced volume")
            for database in ("l2_source", "l2_restored", "l2_failed"):
                tools.sql("postgres", f"DROP DATABASE {database};")
            report["archive_sha256"] = hashlib.sha256(original).hexdigest()
            report["checks"].append("only synthetic source/verification databases explicitly dropped")
        finally:
            compose("down", "--timeout", "30")
            # Deliberate discard of this script's generated disposable volume only.
            name = project + "_postgres-data"
            if docker("volume", "ls", "--quiet", "--filter", "name=^" + name + "$"):
                cli("discard-volume", "--discard-disposable-data")
        # A wrong-label same-name volume must not be deleted, even with explicit discard.
        docker("volume", "create", "--label", "com.docker.compose.project=wrong-project", name)
        try:
            cli("discard-volume", "--discard-disposable-data", success=False)
        finally:
            docker("volume", "rm", name)  # Generated here, confirmed unrelated to any real project.
        report["checks"].append("exact generated Compose volume removed after down; wrong-label volume rejected")
    report["result"] = "pass"
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Postgres tools smoke passed: {len(report['checks'])} groups; isolated resources removed.")


if __name__ == "__main__":
    main()

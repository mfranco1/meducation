"""Local-only PG17 tools using the running Compose development bootstrap service."""

import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from compose_support import docker, wait_services

# Password stays inside the container: protected ephemeral pgpass on its /tmp tmpfs.
# Never exec here: the EXIT trap must remove the credential file after the client exits.
AUTH = r'''
set -eu
umask 077
passfile=$(mktemp /tmp/meducation-pgpass.XXXXXX)
trap 'rm -f "$passfile"' EXIT HUP INT TERM
escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/:/\\:/g'; }
for value in "$POSTGRES_USER" "$POSTGRES_PASSWORD"; do
  test "$value" = "$(printf '%s' "$value" | tr -d '\r\n')" || exit 1
done
printf '127.0.0.1:5432:*:%s:%s\n' "$(escape "$POSTGRES_USER")" "$(escape "$POSTGRES_PASSWORD")" > "$passfile"
unset PGPASSWORD
export PGPASSFILE="$passfile" PGCONNECT_TIMEOUT=5
"$@" --host 127.0.0.1 --username "$POSTGRES_USER" --no-password
'''


def identifier(value):
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", value):
        raise ValueError("Database must be a simple lowercase identifier (maximum 63 characters)")
    return value


def project_name(value):
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,62}", value):
        raise ValueError("Invalid Compose project name")
    return value


class PostgresTools:
    def __init__(self, project):
        project_name(project)
        self.container = wait_services(project, ["postgres"], timeout=30)["postgres"]
        # Verify tool AND server majors before any mutation or output replacement.
        self.versions = {tool: docker("exec", self.container, tool, "--version")
                         for tool in ("psql", "pg_dump", "pg_restore")}
        if any(not re.search(r"\(PostgreSQL\) 17\.", v) for v in self.versions.values()):
            raise RuntimeError("Expected PostgreSQL 17 client tools")
        self.versions["server"] = self.sql("postgres", "SHOW server_version_num;").strip()
        if not 170000 <= int(self.versions["server"]) < 180000:
            raise RuntimeError("Expected PostgreSQL 17 server")

    def command(self, *args):
        return ["docker", "exec", "-i", self.container, "sh", "-ec", AUTH, "--", *args]

    def run(self, *args, stdin=None, stdout=subprocess.PIPE, input_bytes=None):
        result = subprocess.run(self.command(*args), stdin=stdin, stdout=stdout,
                                stderr=subprocess.PIPE, input=input_bytes, timeout=300, check=False)
        if result.returncode:
            # Do not print server/client diagnostics: restored SQL may contain private data.
            raise RuntimeError(f"{args[0]} failed (exit {result.returncode}); no credentials or SQL logged")
        return result.stdout

    def sql(self, database, sql):
        return self.run("psql", "--dbname", identifier(database), "--no-psqlrc",
                        "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1",
                        input_bytes=sql.encode()).decode()

    def dump(self, database, destination):
        identifier(database)
        destination = Path(destination).absolute()
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if destination.is_symlink() or (destination.exists() and not destination.is_file()):
            raise ValueError("Backup destination must be a regular file, not a symlink")
        fd, temporary = tempfile.mkstemp(prefix=".pg-dump-", dir=destination.parent)
        try:
            with os.fdopen(fd, "wb") as output:
                self.run("pg_dump", "--dbname", database, "--format=custom",
                         "--no-owner", "--no-acl", stdout=output)
                output.flush()
                os.fsync(output.fileno())
            # Catch unusable/truncated archive output before publishing it.
            with open(temporary, "rb") as archive:
                self.archive_list(archive)
            os.replace(temporary, destination)
        finally:
            Path(temporary).unlink(missing_ok=True)
        return destination

    def archive_list(self, archive):
        result = subprocess.run(["docker", "exec", "-i", self.container, "pg_restore", "--list"],
                                stdin=archive, capture_output=True, timeout=60, check=False)
        if result.returncode:
            raise RuntimeError("Invalid PostgreSQL archive; destination unchanged")

    def restore(self, archive_path, database):
        identifier(database)
        if database in {"postgres", "template0", "template1", "meducation"}:
            raise ValueError("Restore requires a distinct fresh verification database")
        with Path(archive_path).open("rb") as archive:
            self.archive_list(archive)
            archive.seek(0)
            # createdb fails if the target already exists; never clean/drop it.
            self.run("createdb", "--template=template0", database)
            self.run("pg_restore", "--dbname", database, "--exit-on-error",
                     "--single-transaction", "--no-owner", "--no-acl", stdin=archive)
        # On restore failure leave the newly created empty DB for inspection, never auto-drop.


def discard_volume(project):
    """Explicit disposable-data deletion only; routine stop/cleanup never calls this."""
    project_name(project)
    name = project + "_postgres-data"
    volume = json.loads(docker("volume", "inspect", name))[0]
    labels = volume.get("Labels") or {}
    if (volume["Name"] != name or labels.get("com.docker.compose.project") != project
            or labels.get("com.docker.compose.volume") != "postgres-data"):
        raise RuntimeError("Refusing volume removal: exact Compose identity/labels do not match")
    if docker("ps", "--all", "--quiet", "--filter", "volume=" + name):
        raise RuntimeError("Remove project containers with Compose down first; volume is still referenced")
    docker("volume", "rm", name)
    return name

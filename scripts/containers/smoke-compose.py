"""Exercise the actual Compose model using an isolated project and disposable DB volume."""

import argparse
import json
import os
import secrets
import subprocess
import tempfile
import urllib.request
import uuid
from pathlib import Path

from compose_support import docker, service_container, wait_services
from postgres_fixture import seed_database

ROOT = Path(__file__).resolve().parents[2]
PSQL = ('export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql --host 127.0.0.1 '
        '--username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-password '
        '--no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    project = "meducation-l2-compose-" + uuid.uuid4().hex[:16]
    volume_name = project + "_postgres-data"
    report = {"project": project, "volume": volume_name, "checks": []}
    env = {k: v for k, v in os.environ.items() if not k.startswith(("MEDUCATION_", "COMPOSE_"))}
    with tempfile.TemporaryDirectory(prefix="meducation-l2-compose-") as temp:
        env_file = Path(temp) / ".env"
        env_file.write_text("MEDUCATION_FRONTEND_PORT=0\nMEDUCATION_POSTGRES_PORT=0\n")
        env_file.chmod(0o600)
        fixture_override = Path(temp) / "fixture.json"
        fixture_override.write_text(json.dumps({"services": {"postgres": {"environment": {"POSTGRES_DB": "meducation_test_smoke"}}}}))

        def compose(*command, db=False, port=False, input_text=None, timeout=60):
            flags = ["docker", "compose", "--project-name", project, "--env-file", str(env_file),
                     "--file", str(ROOT / "compose.yaml"), "--file", str(fixture_override)]
            if port:
                flags += ["--file", str(ROOT / "ops/containers/compose.db-port.yaml")]
            if db:
                flags += ["--profile", "db"]
            result = subprocess.run(
                [*flags, *command], cwd=ROOT, env=env, input=input_text,
                text=True, capture_output=True, timeout=timeout, check=False,
            )
            if result.returncode:
                # Never emit resolved config/stdout; it can contain credentials.
                raise RuntimeError(f"Compose command failed ({result.returncode}): {result.stderr[-1500:]}")
            return result.stdout.strip()

        def inspection(service):
            container = service_container(project, service)
            require(container is not None, "Missing service: " + service)
            return json.loads(docker("inspect", container))[0]

        def sql(text):
            return compose("exec", "-T", "postgres", "sh", "-ec", PSQL,
                           db=True, input_text=text, timeout=15)

        def api_subjects():
            binding = inspection("frontend")["NetworkSettings"]["Ports"]["8080/tcp"]
            require(len(binding) == 1 and binding[0]["HostIp"] == "127.0.0.1", "Frontend must bind loopback")
            origin = "http://127.0.0.1:" + binding[0]["HostPort"]
            with urllib.request.urlopen(origin + "/api/v1/subjects", timeout=15) as response:
                require(response.status == 200, "Proxy/API failed")
                return json.load(response)

        try:
            # Inspect in memory only: never write secret-bearing resolved config.
            model = json.loads(compose("config", "--format", "json"))
            require(set(model["services"]) == {"api", "frontend"}, "Default profile started DB")
            require(not model["services"]["api"].get("ports"), "API port must be private")
            compose("config", "--quiet", db=True)
            compose("config", "--quiet", db=True, port=True)
            report["checks"].append("default/DB/DB-port configs validate; API requires explicit reader configuration")
            compose("up", "--detach", "postgres", db=True, timeout=120)
            try:
                wait_services(project, ["postgres"], timeout=15)
            except RuntimeError:
                failed = inspection("postgres")["State"]
                require(not failed["Running"] and failed["ExitCode"] == 1, "Missing-password failure was not the startup guard")
            else:
                raise RuntimeError("Postgres accepted missing development credentials")
            report["checks"].append("missing DB password rejects startup")

            bootstrap_password = secrets.token_urlsafe(32)
            with env_file.open("a") as file:
                file.write("MEDUCATION_POSTGRES_BOOTSTRAP_PASSWORD=" + bootstrap_password + "\n")
            compose("up", "--detach", "--force-recreate", "postgres", db=True, timeout=120)
            wait_services(project, ["postgres"])
            require(sql("SELECT 1;\n") == "1", "Authenticated TCP SQL check failed")
            try:
                compose("exec", "-T", "postgres", "sh", "-ec",
                        "unset PGPASSWORD; " + PSQL.split("; ", 1)[1],
                        db=True, input_text="SELECT 1;\n", timeout=15)
            except RuntimeError as error:
                require("no password supplied" in str(error), "Unexpected unauthenticated SQL failure")
            else:
                raise RuntimeError("TCP SQL access did not require authentication")
            pg = inspection("postgres")
            require(not any(pg["NetworkSettings"]["Ports"].values()), "Postgres has a default host port")
            mounts = [m for m in pg["Mounts"] if m["Type"] == "volume"]
            require(len(mounts) == 1 and mounts[0]["Name"] == volume_name
                    and mounts[0]["Destination"] == "/var/lib/postgresql/data", "Wrong PG17 named volume")
            server_version = sql("SHOW server_version;\n")
            server_version_num = sql("SHOW server_version_num;\n")
            require(server_version_num == "170011", "Wrong Postgres version: " + server_version)
            report["postgres"] = {"server_version": server_version, "server_version_num": server_version_num,
                                  "image": pg["Image"], "volume_destination": mounts[0]["Destination"]}
            report["checks"].append("native PG17 healthy, authenticated TCP SELECT 1, correct volume, no published port")
            print("Postgres startup and authenticated readiness passed.", flush=True)

            # Expose only the owned temporary DB to seed via separated role connections.
            compose("up", "--detach", "--force-recreate", "postgres", db=True, port=True, timeout=120)
            wait_services(project, ["postgres"])
            seeded_pg = inspection("postgres")
            require(seeded_pg["Config"]["Labels"]["com.docker.compose.project"] == project, "Refusing unowned seed target")
            binding = seeded_pg["NetworkSettings"]["Ports"]["5432/tcp"][0]
            require(binding["HostIp"] == "127.0.0.1", "Seed port must be loopback")
            reader_env = seed_database(binding["HostPort"], bootstrap_password, Path(temp))
            with env_file.open("a") as stream:
                stream.write(reader_env.read_text())
            compose("up", "--detach", "--force-recreate", "postgres", db=True, timeout=120)
            wait_services(project, ["postgres"])
            require(not any(inspection("postgres")["NetworkSettings"]["Ports"].values()), "Default DB port must be private")
            compose("up", "--detach", "--no-build", "api", "frontend", db=True, timeout=120)
            wait_services(project, ["api", "frontend"])
            subjects = api_subjects()
            require(subjects["subjects"], "PostgreSQL fixture subjects absent")
            frontend_keys = [v.split("=", 1)[0] for v in inspection("frontend")["Config"]["Env"]]
            require(not any("DATABASE_URL" in key or "POSTGRES" in key for key in frontend_keys), "DB credentials reached frontend")
            api_env = dict(v.split("=", 1) for v in inspection("api")["Config"]["Env"])
            require("meducation_reader:" in api_env["MEDUCATION_DATABASE_URL"], "API needs reader-only credentials")
            require(not any(key.endswith(("OPERATOR_DATABASE_URL", "MIGRATION_DATABASE_URL", "BOOTSTRAP_DATABASE_URL")) for key in api_env), "Privileged job credentials reached API")
            report["checks"].append("PostgreSQL-only stack healthy through proxy; private DB; API reader isolation; frontend has no DB credentials")

            token = uuid.uuid4().hex
            sql("CREATE DATABASE l2_smoke;\n\\connect l2_smoke\n"
                "CREATE TABLE l2_sentinel (value text PRIMARY KEY);\n"
                f"INSERT INTO l2_sentinel VALUES ('{token}');\n")

            def sentinel():
                return sql("\\connect l2_smoke\nSELECT value FROM l2_sentinel;\n").splitlines()[-1]

            require(sentinel() == token, "Sentinel write failed")
            compose("restart", "postgres", db=True, timeout=60)
            wait_services(project, ["postgres"])
            require(sentinel() == token, "Restart lost sentinel data")
            old_container = inspection("postgres")["Id"]
            compose("up", "--detach", "--force-recreate", "postgres", db=True, timeout=120)
            wait_services(project, ["postgres"])
            require(inspection("postgres")["Id"] != old_container, "Postgres was not recreated")
            require(sentinel() == token, "Recreation lost named-volume data")
            report["checks"].append("disposable sentinel survives Postgres restart and container recreation")

            compose("up", "--detach", "--force-recreate", "postgres", db=True, port=True, timeout=120)
            wait_services(project, ["postgres"])
            bindings = inspection("postgres")["NetworkSettings"]["Ports"]["5432/tcp"]
            require(len(bindings) == 1 and bindings[0]["HostIp"] == "127.0.0.1", "DB override is not loopback-only")
            require(sentinel() == token and api_subjects() == subjects, "Port override affected data/API")
            report["checks"].append("optional DB host port is loopback-only; sentinel and PostgreSQL API unchanged")
            sql("DROP DATABASE l2_smoke;\n")
            report["result"] = "pass"
        finally:
            # This project/volume was generated here solely for disposable tests.
            # Ordinary developer start/stop commands never delete their volume.
            compose("down", "--timeout", "30", db=True, port=True, timeout=90)
            listed = docker("volume", "ls", "--quiet", "--filter", f"name=^{volume_name}$")
            if listed:
                volume = json.loads(docker("volume", "inspect", volume_name))[0]
                labels = volume.get("Labels") or {}
                require(labels.get("com.docker.compose.project") == project
                        and labels.get("com.docker.compose.volume") == "postgres-data",
                        "Refusing to delete a volume outside the smoke project")
                docker("volume", "rm", volume_name)
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Compose smoke passed: {len(report['checks'])} groups; disposable volume removed.")


if __name__ == "__main__":
    main()

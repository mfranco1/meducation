"""Disposable PG17 / installed single-worker API: twenty synchronized learner launches."""

import argparse
import hashlib
import json
import platform
import secrets
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

from compose_support import docker
from load_rounds import DEADLINE, SEED, run_round

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
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--items-per-bank", type=int, default=200)
    args = parser.parse_args()
    if not 2 <= args.items_per_bank <= 2000:
        parser.error("items-per-bank must be between 2 and 2000")
    if not 1 <= args.rounds <= 20:
        parser.error("rounds must be between 1 and 20")
    started = time.monotonic()
    architecture = docker("info", "--format", "{{.Architecture}}")
    architecture = {"aarch64": "arm64", "x86_64": "amd64"}.get(
        architecture, architecture
    )
    host_architecture = {
        "arm64": "arm64",
        "aarch64": "arm64",
        "x86_64": "amd64",
        "AMD64": "amd64",
    }.get(platform.machine())
    image_architecture = docker(
        "image", "inspect", "--format", "{{.Architecture}}", args.api_image
    )
    if architecture != host_architecture or architecture != image_architecture:
        parser.error(
            "Host, Docker engine and API image must use the same native architecture"
        )
    run_id = uuid.uuid4().hex
    prefix = "meducation-l5-load-" + run_id
    label = "meducation.l5.load"
    created = []
    engines = []
    report = {"result": "fail", "rounds": []}
    docker("network", "create", "--label", label + "=" + run_id, prefix)
    try:
        docker("volume", "create", "--label", label + "=" + run_id, prefix + "-data")
        with tempfile.TemporaryDirectory(prefix="meducation-load-") as temp:
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
                "POSTGRES_USER=meducation_bootstrap\nPOSTGRES_DB=meducation_verify_load\nPOSTGRES_PASSWORD="
                + secret
                + "\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n"
            )
            pg_env.chmod(0o600)

            def start(name, image, *options, command=()):
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
                    *command,
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
                "--mount",
                f"type=volume,src={prefix}-data,dst=/var/lib/postgresql/data",
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
                        database="meducation_verify_load",
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
            fixture_sources = [qp, fp]
            qdata, fdata = json.loads(qp.read_text()), json.loads(fp.read_text())
            qdata["questions"] = [
                {**qdata["questions"][index % 2], "id": f"i{index + 1}"}
                for index in range(args.items_per_bank)
            ]
            fdata["cards"] = [
                {**fdata["cards"][index % 2], "id": f"f-load-{index:04d}"}
                for index in range(args.items_per_bank)
            ]
            qp, fp = folder / "baseline-q.json", folder / "baseline-f.json"
            qp.write_text(json.dumps(qdata))
            fp.write_text(json.dumps(fdata))
            pair = capture_pair(qp, fp, repository=ROOT)
            original = import_pair(
                operator,
                pair,
                operation_id=uuid.uuid4(),
                actor="local-load-probe",
                reason="Paired fixture import",
            )
            with operator.begin() as connection:
                activate_release(
                    connection,
                    operation_id=uuid.uuid4(),
                    release_id=original.release_id,
                    expected_sequence=0,
                    actor="local-load-probe",
                    reason="Disposable load baseline",
                )
            questions, flashcards = (
                json.loads(qp.read_text()),
                json.loads(fp.read_text()),
            )
            changed_questions = json.loads(qp.read_text())
            changed_cards = json.loads(fp.read_text())
            changed_questions["questions"][0]["stem"] = (
                "Changed disposable load question"
            )
            changed_cards["cards"][0]["front"] = "Changed disposable load flashcard"
            cq, cf = folder / "changed-q.json", folder / "changed-f.json"
            cq.write_text(json.dumps(changed_questions))
            cf.write_text(json.dumps(changed_cards))
            changed = import_pair(
                operator,
                capture_pair(cq, cf, repository=ROOT),
                operation_id=uuid.uuid4(),
                actor="local-load-probe",
                reason="Disposable changed paired release",
            )
            reader = URL.create(
                "postgresql+psycopg",
                username="meducation_reader",
                password=passwords.reader_password.get_secret_value(),
                host="postgres",
                port=5432,
                database="meducation_verify_load",
                query={"sslmode": "disable"},
            )
            api_env = folder / "reader.env"
            api_env.write_text(
                "MEDUCATION_CONTENT_SOURCE=postgres\nMEDUCATION_DATABASE_ENVIRONMENT=local\n"
                "MEDUCATION_DATABASE_URL="
                + reader.render_as_string(hide_password=False)
                + "\n"
            )
            api_env.chmod(0o600)
            start(
                "api",
                args.api_image,
                "--env-file",
                str(api_env),
                "--publish",
                "127.0.0.1::8000",
                "--read-only",
                "--tmpfs",
                "/tmp",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--mount",
                f"type=bind,src={ROOT / 'scripts/containers/fixtures/load_api.py'},dst=/fixture/load_api.py,readonly",
                command=("python", "/fixture/load_api.py"),
            )
            # Replace only the disposable fixture's entrypoint; the installed wheel is unchanged.
            wait(prefix + "-api")
            binding = json.loads(docker("inspect", prefix + "-api"))[0][
                "NetworkSettings"
            ]["Ports"]["8000/tcp"][0]
            assert binding["HostIp"] == "127.0.0.1"
            origin = "http://127.0.0.1:" + binding["HostPort"]
            flashcards["subjects"] = questions["subjects"]
            changed_cards["subjects"] = changed_questions["subjects"]
            baseline = {"quiz": questions, "flashcard": flashcards}
            updated = {"quiz": changed_questions, "flashcard": changed_cards}
            report.update(
                seed=SEED,
                deadline_seconds=DEADLINE,
                measured_rounds_per_cache=args.rounds,
                worker_count=1,
                reader_pool_size=2,
                reader_max_overflow=0,
                host=platform.system() + "/" + platform.machine(),
                engine_architecture=docker("info", "--format", "{{.Architecture}}"),
                docker_version=docker(
                    "version", "--format", "{{.Client.Version}}/{{.Server.Version}}"
                ),
                api_image=docker(
                    "image", "inspect", "--format", "{{.Id}}", args.api_image
                ),
                api_architecture=docker(
                    "image", "inspect", "--format", "{{.Architecture}}", args.api_image
                ),
                postgres_image=PG_IMAGE,
                source_commit=subprocess.check_output(
                    ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
                ).strip(),
                source_changes=subprocess.check_output(
                    ["git", "status", "--short"], cwd=ROOT, text=True
                ).splitlines(),
                inputs_sha256={
                    str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in [
                        Path(__file__).resolve(),
                        ROOT / "scripts/containers/load_rounds.py",
                        ROOT / "scripts/containers/test_load_rounds.py",
                        ROOT / "scripts/containers/fixtures/load_api.py",
                        *fixture_sources,
                        *sorted((ROOT / "backend/src").rglob("*.py")),
                    ]
                },
                fixture={
                    "subjects": len(questions["subjects"]),
                    "quizzes": len(questions["quizzes"]),
                    "questions": len(questions["questions"]),
                    "decks": len(flashcards["decks"]),
                    "cards": len(flashcards["cards"]),
                    "baseline_question_sha256": hashlib.sha256(
                        qp.read_bytes()
                    ).hexdigest(),
                    "baseline_flashcard_sha256": hashlib.sha256(
                        fp.read_bytes()
                    ).hexdigest(),
                    "question_file_bytes": qp.stat().st_size,
                    "flashcard_file_bytes": fp.stat().st_size,
                    "changed_question_sha256": hashlib.sha256(
                        cq.read_bytes()
                    ).hexdigest(),
                    "changed_flashcard_sha256": hashlib.sha256(
                        cf.read_bytes()
                    ).hexdigest(),
                },
                isolation="exact owned labeled network, containers and volume; loopback HTTP/PG only; no routine database",
                scope="API launch characterization on a synthetic fixture; no browser rendering, proxy, hosted latency or production SLO",
                sql_counts="SQLAlchemy cursor statements and dialect pre-pings counted separately; driver startup/rollback protocol excluded",
            )
            # Ensure the image actually contains the source whose hashes the report records.
            for path in sorted((ROOT / "backend/src/meducation_api").rglob("*.py")):
                relative = str(path.relative_to(ROOT / "backend/src"))
                actual = docker(
                    "exec",
                    prefix + "-api",
                    "python",
                    "-c",
                    "import hashlib,pathlib;print(hashlib.sha256(pathlib.Path('/opt/venv/lib/python3.14/site-packages/' + "
                    + repr(relative)
                    + ").read_bytes()).hexdigest())",
                )
                assert actual == hashlib.sha256(path.read_bytes()).hexdigest(), (
                    "Installed source differs: " + relative
                )

            def measured(name, banks, **options):
                report["active_round"] = {}
                try:
                    result = run_round(
                        origin, name, banks, progress=report["active_round"], **options
                    )
                except Exception as error:
                    report["active_round"].update(
                        status="fail", error_type=type(error).__name__
                    )
                    raise
                report.pop("active_round")
                return result

            report["warmup"] = measured("unmeasured-warmup", baseline, cold=True)
            for index in range(args.rounds):
                for mode in ("cold", "warm"):
                    result = measured(
                        f"{mode}-{index + 1}", baseline, cold=mode == "cold"
                    )
                    report["rounds"].append(result)
                    print(result["name"] + " passed", flush=True)

            def publish(release=changed, sequence=1):
                # A single explicit fixture write, never retried or replayed on errors.
                with operator.begin() as connection:
                    activate_release(
                        connection,
                        operation_id=uuid.uuid4(),
                        release_id=release.release_id,
                        expected_sequence=sequence,
                        actor="local-load-probe",
                        reason="Publication across twenty launches",
                    )

            report["rounds"].append(
                measured(
                    "publication-boundary",
                    baseline,
                    transition=publish,
                    expected=409,
                )
            )
            report["rounds"].append(measured("publication-recovery", updated))

            report["rounds"].append(
                measured(
                    "publication-body-boundary",
                    updated,
                    transition=lambda: publish(original, 2),
                    expected=409,
                    transition_after="membership",
                )
            )
            report["rounds"].append(measured("publication-body-recovery", baseline))

            def stop():
                owned = json.loads(docker("inspect", prefix + "-pg"))[0]
                assert owned["Config"]["Labels"][label] == run_id
                assert any(m.get("Name") == prefix + "-data" for m in owned["Mounts"])
                docker("stop", "--time", "3", prefix + "-pg")

            report["rounds"].append(
                measured("outage-boundary", baseline, transition=stop, expected=503)
            )
            docker("start", prefix + "-pg")
            deadline = time.monotonic() + 45
            while subprocess.run(
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
            ).returncode:
                assert time.monotonic() < deadline, (
                    "Owned PG recovery exceeded deadline"
                )
                time.sleep(0.25)
            report["rounds"].append(measured("outage-recovery", baseline))
            assert all(
                hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == value
                for name, value in report["inputs_sha256"].items()
            ), "Inputs changed during load"
            report["result"] = "pass"
    finally:
        for value in engines:
            value.dispose()
        # Deletions use only generated names, verify ownership, and fail if cleanup fails.
        try:
            owned_names = set(
                docker(
                    "ps",
                    "--all",
                    "--filter",
                    "label=" + label + "=" + run_id,
                    "--format",
                    "{{.Names}}",
                ).splitlines()
            )
            assert owned_names <= set(created)
            for name in reversed(created):
                if name not in owned_names:
                    continue
                owned = json.loads(docker("inspect", name))[0]
                assert owned["Config"]["Labels"][label] == run_id
                docker("rm", "--force", name)
            if docker(
                "volume", "ls", "--filter", "label=" + label + "=" + run_id, "--quiet"
            ):
                owned_volume = json.loads(
                    docker("volume", "inspect", prefix + "-data")
                )[0]
                assert owned_volume["Labels"][label] == run_id
                docker("volume", "rm", prefix + "-data")
            docker("network", "rm", prefix)
            report["cleanup"] = "pass"
        except Exception:
            report["result"] = "fail"
            report["cleanup"] = "fail"
            raise
        finally:
            report["elapsed_seconds"] = round(time.monotonic() - started, 3)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + "\n")
    print("Load characterization passed: " + str(args.output))


if __name__ == "__main__":
    main()

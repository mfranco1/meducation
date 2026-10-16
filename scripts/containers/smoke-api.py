"""Exercise an already-built PostgreSQL API image in disposable, loopback-only containers."""

import argparse
import hashlib
import json
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from contextlib import ExitStack
from pathlib import Path

from postgres_fixture import postgres_fixture

ROOT = Path(__file__).resolve().parents[2]
AUDIT = """
import hashlib, importlib.metadata, json, os, platform, shutil
from pathlib import Path
import meducation_api.main
from meducation_api.repositories import question_bank
from meducation_api.settings import Settings
config = Settings()
print(json.dumps({
    'uid': os.getuid(), 'gid': os.getgid(), 'python': platform.python_version(),
    'package_path': meducation_api.main.__file__,
    'corpus_present': bool(list(Path('/app').rglob('*.generated.json'))),
    'file_repository_present': any(name.startswith('Json') for name in vars(question_bank)),
    'bank_path_settings': any(name in type(config).model_fields for name in ('bank_path', 'flashcard_bank_path')),
    'lock_sha256': hashlib.sha256(Path('/app/requirements.lock').read_bytes()).hexdigest(),
    'packages': {d.metadata['Name'].lower().replace('_', '-'): d.version for d in importlib.metadata.distributions()},
    'compiler_present': shutil.which('cc') is not None,
    'source_env_present': config.model_config['env_file'].exists(),
}))
"""


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def docker(*args, timeout=30):
    result = subprocess.run(
        ["docker", *args], capture_output=True, text=True, timeout=timeout, check=True
    )
    output = result.stdout + result.stderr if args[0] == "logs" else result.stdout
    return output.strip()


def state(container):
    return json.loads(docker("inspect", "--format", "{{json .State}}", container))


def wait_for(container, predicate, description, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        current = state(container)
        if predicate(current):
            return current
        if not current["Running"]:
            raise RuntimeError(
                f"Container exited before {description}: {current['ExitCode']}"
            )
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {description}")


def request(origin, path, headers=None):
    req = urllib.request.Request(origin + path, headers=headers or {})
    try:
        response = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read()
        headers = {key.lower(): value for key, value in response.headers.items()}
        return response.status, headers, json.loads(raw) if raw else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="meducation-api:local")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    image = json.loads(docker("image", "inspect", args.image))[0]
    require(
        image["Config"]["User"] == "10001:10001", "API image user must be 10001:10001"
    )
    run_id = uuid.uuid4().hex
    network = "meducation-api-smoke-" + run_id
    containers = []
    resources = ExitStack()
    docker("network", "create", "--label", "meducation.api-smoke=" + run_id, network)
    report = {
        "image": image["Id"],
        "image_platform": image["Os"] + "/" + image["Architecture"],
        "checks": [],
    }
    try:
        folder = Path(
            resources.enter_context(tempfile.TemporaryDirectory(prefix=network))
        )
        reader_env = resources.enter_context(postgres_fixture(network, network, folder))

        def start(label, *extra, reader=True, publish=False):
            name = network + "-" + label
            containers.append(name)
            options = ["--env-file", str(reader_env)] if reader else []
            if publish:
                options += ["--publish", "127.0.0.1::8000"]
            docker(
                "run",
                "--detach",
                "--name",
                name,
                "--network",
                network,
                "--label",
                "meducation.api-smoke=" + run_id,
                "--read-only",
                "--tmpfs",
                "/tmp",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                *options,
                *extra,
                image["Id"],
            )
            return name

        container = start("reader", publish=True)
        wait_for(
            container,
            lambda s: s.get("Health", {}).get("Status") == "healthy",
            "health",
        )
        inspection = json.loads(docker("inspect", container))[0]
        require(
            not any(m["Type"] in {"bind", "volume"} for m in inspection["Mounts"]),
            "Reader must have no content/source mounts",
        )
        binding = inspection["NetworkSettings"]["Ports"]["8000/tcp"][0]
        require(binding["HostIp"] == "127.0.0.1", "Loopback binding required")
        origin = "http://127.0.0.1:" + binding["HostPort"]
        audit = json.loads(docker("exec", container, "python", "-c", AUDIT))
        require(audit["uid"] == audit["gid"] == 10001, "Runtime process user changed")
        require(audit["python"] == "3.14.8", "Wrong Python runtime")
        require(
            audit["package_path"].startswith("/opt/venv/"),
            "App must be installed from its wheel",
        )
        require(
            not audit["source_env_present"] and not audit["compiler_present"],
            "Unexpected developer environment/compiler",
        )
        require(
            not audit["corpus_present"]
            and not audit["file_repository_present"]
            and not audit["bank_path_settings"],
            "File-backed content was shipped",
        )
        expected_packages = {}
        for line in (ROOT / "backend/requirements.lock").read_text().splitlines():
            if line and not line.lstrip().startswith("#"):
                name, version = line.split("==")
                expected_packages[name.split("[", 1)[0].lower().replace("_", "-")] = (
                    version
                )
        require(
            {
                k: v
                for k, v in audit["packages"].items()
                if k not in {"pip", "meducation-api"}
            }
            == expected_packages,
            "Runtime dependencies differ from lock",
        )
        require(
            audit["lock_sha256"]
            == hashlib.sha256(
                (ROOT / "backend/requirements.lock").read_bytes()
            ).hexdigest(),
            "Shipped lock differs",
        )
        require(
            docker("exec", container, "python", "-m", "pip", "check")
            == "No broken requirements found.",
            "Runtime dependency check failed",
        )
        report["runtime"] = audit
        report["checks"].append(
            "non-root/read-only wheel runtime; exact dependency lock; no corpus, JSON repositories or file settings"
        )
        for path, expected in [("/health/live", "live"), ("/health/ready", "ready")]:
            require(request(origin, path)[2] == {"status": expected}, "Health failed")
        bank = json.loads((ROOT / "e2e/fixtures/bank.json").read_text())
        cards = json.loads((ROOT / "e2e/fixtures/flashcard-bank.json").read_text())
        status, headers, subjects = request(origin, "/api/v1/subjects")
        expected = [
            {
                **s,
                "quizCount": sum(q["subjectId"] == s["id"] for q in bank["quizzes"]),
                "quizIds": [
                    q["id"] for q in bank["quizzes"] if q["subjectId"] == s["id"]
                ],
            }
            for s in bank["subjects"]
        ]
        require(
            status == 200 and subjects["subjects"] == expected, "Subject catalog drift"
        )
        for quiz in bank["quizzes"]:
            result = request(origin, "/api/v1/quizzes/" + quiz["id"] + "/questions")
            require(
                result[0] == 200
                and result[2]["questions"]
                == [q for q in bank["questions"] if q["quizId"] == quiz["id"]],
                "Question text/order/provenance drift",
            )
        for deck in cards["decks"]:
            result = request(
                origin, "/api/v1/flashcards/decks/" + deck["id"] + "/cards"
            )
            require(
                result[0] == 200
                and result[2]["cards"]
                == [c for c in cards["cards"] if c["deckId"] == deck["id"]],
                "Card text/order drift",
            )
        require(
            request(origin, "/api/v1/subjects", {"If-None-Match": headers["etag"]})[0]
            == 304,
            "Conditional response failed",
        )
        require(
            request(origin, "/api/v1/subjects?revision=stale")[0] == 409,
            "Revision conflict failed",
        )
        require(
            request(origin, "/api/v1/quizzes/missing/questions")[0] == 404,
            "Missing quiz response failed",
        )
        require(
            request(origin, "/api/v1/subjects", {"Origin": "http://127.0.0.1:4173"})[
                1
            ].get("access-control-allow-origin")
            == "http://127.0.0.1:4173",
            "Configured CORS failed",
        )
        require(
            "access-control-allow-origin"
            not in request(
                origin, "/api/v1/subjects", {"Origin": "https://untrusted.invalid"}
            )[1],
            "Unconfigured CORS allowed",
        )
        report["checks"].append(
            "PostgreSQL fixture catalogs, exact content/order/provenance, health, 304/409/404 and explicit CORS"
        )
        docker("stop", "--time", "15", container)
        require(
            state(container)["ExitCode"] == 0 and not state(container)["OOMKilled"],
            "API shutdown was not clean",
        )
        report["checks"].append("SIGTERM graceful exit 0")
        # Fail closed with no reader configuration and with a secret-bearing unreachable credential.
        canary = "STARTUP_SECRET_" + uuid.uuid4().hex
        from sqlalchemy import make_url

        entries = dict(
            line.split("=", 1) for line in reader_env.read_text().splitlines()
        )
        bad = folder / "bad-reader.env"
        entries["MEDUCATION_DATABASE_URL"] = (
            make_url(entries["MEDUCATION_DATABASE_URL"])
            .set(password=canary)
            .render_as_string(hide_password=False)
        )
        bad.write_text("".join(k + "=" + v + "\n" for k, v in entries.items()))
        bad.chmod(0o600)
        for label, options in [
            ("missing-reader", []),
            ("bad-reader", ["--env-file", str(bad)]),
        ]:
            failed = start(label, *options, reader=False)
            result = wait_for(failed, lambda s: not s["Running"], "startup rejection")
            require(
                result["ExitCode"] != 0 and not result["OOMKilled"],
                "Invalid DB configuration was accepted",
            )
            logs = docker("logs", failed)
            require(
                '"event":"server_error"' in logs
                and canary not in logs
                and "Traceback" not in logs,
                "Startup diagnostics leaked or were not sanitized",
            )
        report["checks"].append(
            "missing/unusable reader fails startup with redacted diagnostics and no fallback"
        )
        report["result"] = "pass"
    finally:
        for container in reversed(containers):
            docker("rm", "--force", container)
        resources.close()
        docker("network", "rm", network)
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"PostgreSQL API smoke passed: {len(report['checks'])} groups")


if __name__ == "__main__":
    main()

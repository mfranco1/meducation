"""Exercise an already-built JSON API image in disposable, loopback-only containers."""

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
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = """
import hashlib, importlib.metadata, json, os, platform, shutil
from pathlib import Path
import meducation_api.main
from meducation_api.settings import Settings
config = Settings()
print(json.dumps({
    'uid': os.getuid(), 'gid': os.getgid(), 'python': platform.python_version(),
    'architecture': platform.machine(),
    'package_path': meducation_api.main.__file__,
    'bank_paths': [str(config.bank_path), str(config.flashcard_bank_path)],
    'allowed_origins': config.cors_origins,
    'hashes': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in
        [config.bank_path, config.flashcard_bank_path, Path('/app/requirements.lock')]},
    'packages': {d.metadata['Name'].lower().replace('_', '-'): d.version
        for d in importlib.metadata.distributions()},
    'compiler_present': shutil.which('cc') is not None,
    'source_env_present': (config.model_config['env_file']).exists(),
    'banks_writable': any(os.access(p, os.W_OK) for p in
        [config.bank_path, config.flashcard_bank_path]),
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
            raise RuntimeError(f"Container exited before {description}: {current['ExitCode']}")
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
    parser.add_argument("--image", default="meducation-api:l2-step2")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    image = json.loads(docker("image", "inspect", args.image))[0]
    require(image["Config"]["User"] == "10001:10001", "API image user must be 10001:10001")
    require(image["Os"] == "linux", "Expected a Linux image")
    run_id = uuid.uuid4().hex
    containers = []

    def start(label, *extra, publish=False):
        command = [
            "create", "--name", f"meducation-l2-api-{run_id}-{label}",
            "--label", f"meducation.l2.smoke={run_id}", "--read-only", "--tmpfs", "/tmp",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
        ]
        if publish:
            command.extend(["--publish", "127.0.0.1::8000"])
        container = docker(*command, *extra, image["Id"])
        containers.append(container)
        docker("start", container)
        return container

    report = {
        "image_tag": args.image, "image_id": image["Id"],
        "image_platform": f"{image['Os']}/{image['Architecture']}",
        "docker": json.loads(docker("version", "--format", "{{json .}}")),
        "checks": [],
    }
    try:
        container = start("canonical", publish=True)
        wait_for(container, lambda s: s.get("Health", {}).get("Status") == "healthy", "health")
        inspection = json.loads(docker("inspect", container))[0]
        require(not any(m["Type"] in {"bind", "volume"} for m in inspection["Mounts"]),
                "Canonical smoke must run without source/content mounts")
        binding = inspection["NetworkSettings"]["Ports"]["8000/tcp"]
        require(len(binding) == 1 and binding[0]["HostIp"] == "127.0.0.1", "Loopback binding required")
        origin = "http://127.0.0.1:" + binding[0]["HostPort"]
        audit = json.loads(docker("exec", container, "python", "-c", AUDIT))
        require(audit["uid"] == audit["gid"] == 10001, "Runtime process is not the selected user")
        require(audit["python"] == "3.14.8", "Wrong Python runtime")
        require(audit["bank_paths"] == [
            "/app/content/questionBank.generated.json", "/app/content/flashcardBank.generated.json"
        ], "Bank paths must be explicit")
        require(audit["package_path"].startswith("/opt/venv/"), "App must be installed from its wheel")
        require(not audit["source_env_present"], "Runtime must not load a developer env file")
        require(not audit["banks_writable"] and not audit["compiler_present"], "Runtime needs no writes/compiler")
        expected_packages = {}
        for line in (ROOT / "backend/requirements.lock").read_text().splitlines():
            if line and not line.lstrip().startswith("#"):
                name, version = line.split("==")
                # Extras select dependencies; they are not part of a distribution name.
                expected_packages[name.split("[", 1)[0].lower().replace("_", "-")] = version
        installed = {k: v for k, v in audit["packages"].items() if k not in {"pip", "meducation-api"}}
        require(installed == expected_packages, "Runtime dependency set differs from the lock")
        for host, shipped in [
            ("src/content/questionBank.generated.json", audit["bank_paths"][0]),
            ("src/content/flashcardBank.generated.json", audit["bank_paths"][1]),
            ("backend/requirements.lock", "/app/requirements.lock"),
        ]:
            require(hashlib.sha256((ROOT / host).read_bytes()).hexdigest() == audit["hashes"][shipped],
                    "Shipped file differs: " + host)
        require(docker("exec", container, "python", "-m", "pip", "check") == "No broken requirements found.",
                "Runtime dependencies do not satisfy the package")
        report["runtime"] = audit
        report["checks"].append("non-root/read-only runtime, exact bank/lock hashes, locked dependencies/imports")

        for path, expected in [("/health/live", "live"), ("/health/ready", "ready")]:
            status, _, payload = request(origin, path)
            require(status == 200 and payload == {"status": expected}, "Health failed: " + path)
        bank = json.loads((ROOT / "src/content/questionBank.generated.json").read_text())
        flashcards = json.loads((ROOT / "src/content/flashcardBank.generated.json").read_text())
        status, headers, subjects = request(origin, "/api/v1/subjects")
        expected_subjects = []
        for subject in bank["subjects"]:
            quizzes = [q["id"] for q in bank["quizzes"] if q["subjectId"] == subject["id"]]
            expected_subjects.append({**subject, "quizCount": len(quizzes), "quizIds": quizzes})
        require(status == 200 and subjects["subjects"] == expected_subjects, "Subject catalog drift")
        quiz_ids = {bank["quizzes"][0]["id"]}
        verified = next((q for q in bank["questions"] if q.get("verifiedAnswer") is not None), None)
        if verified:
            quiz_ids.add(verified["quizId"])
        for quiz_id in sorted(quiz_ids):
            status, _, questions = request(origin, "/api/v1/quizzes/" + urllib.parse.quote(quiz_id, safe="") + "/questions")
            expected = [q for q in bank["questions"] if q["quizId"] == quiz_id]
            require(status == 200 and questions["questions"] == expected, "Question text/order/provenance drift")
        deck_id = flashcards["decks"][0]["id"]
        status, _, cards = request(origin, "/api/v1/flashcards/decks/" + urllib.parse.quote(deck_id, safe="") + "/cards")
        require(status == 200 and cards["cards"] == [c for c in flashcards["cards"] if c["deckId"] == deck_id],
                "Flashcard text/order drift")
        require(request(origin, "/api/v1/subjects", {"If-None-Match": headers["etag"]})[0] == 304,
                "Conditional response failed")
        require(request(origin, "/api/v1/subjects?revision=stale")[0] == 409, "Revision conflict failed")
        require(request(origin, "/api/v1/quizzes/l2-missing/questions")[0] == 404, "Missing quiz response failed")
        status, cors, _ = request(origin, "/api/v1/subjects", {"Origin": "http://127.0.0.1:4173"})
        require(status == 200 and cors.get("access-control-allow-origin") == "http://127.0.0.1:4173",
                "Configured local CORS origin failed")
        require("access-control-allow-origin" not in request(origin, "/api/v1/subjects", {"Origin": "https://untrusted.invalid"})[1],
                "Unconfigured origin was allowed")
        report["checks"].append("health, canonical subject/quiz/flashcard content, 304/409/404 and explicit CORS")
        docker("stop", "--time", "15", container)
        final = state(container)
        require(final["ExitCode"] == 0 and not final["OOMKilled"], "API did not shut down cleanly")
        report["checks"].append("SIGTERM graceful shutdown with exit 0")

        with tempfile.TemporaryDirectory(prefix="meducation-l2-invalid-") as temp:
            invalid = Path(temp) / "invalid.json"
            canary = "L5_STARTUP_SECRET_" + uuid.uuid4().hex
            invalid.write_text(json.dumps({"secret": canary}))
            for key in ["MEDUCATION_BANK_PATH", "MEDUCATION_FLASHCARD_BANK_PATH"]:
                for mode in ["missing", "invalid"]:
                    target = f"/{mode}-{canary}.json"
                    options = ["--env", f"{key}={target}"]
                    if mode == "invalid":
                        options += ["--mount", f"type=bind,source={invalid},target={target},readonly"]
                    failed = start(key.lower() + "-" + mode, *options)
                    result = wait_for(failed, lambda s: not s["Running"], "startup rejection", timeout=30)
                    require(result["ExitCode"] != 0 and not result["OOMKilled"], "Invalid bank did not fail startup")
                    failure_logs = docker("logs", failed)
                    require('"event":"server_error"' in failure_logs, "Missing sanitized startup failure")
                    require(canary not in failure_logs and "Traceback" not in failure_logs, "Startup log canary/trace leaked")
                    report["checks"].append(f"{key}: {mode} input fails startup")
            invalid.write_text(json.dumps({
                "schemaVersion": flashcards["schemaVersion"],
                "decks": [{"id": "dL2", "subjectId": "sL2Missing", "name": "Synthetic mismatch"}],
                "cards": [],
            }))
            failed = start(
                "paired-mismatch", "--env", "MEDUCATION_FLASHCARD_BANK_PATH=/invalid-bank.json",
                "--mount", f"type=bind,source={invalid},target=/invalid-bank.json,readonly",
            )
            result = wait_for(failed, lambda s: not s["Running"], "paired-bank rejection", timeout=30)
            require(result["ExitCode"] != 0 and not result["OOMKilled"], "Cross-bank mismatch was accepted")
            failure_logs = docker("logs", failed)
            require('"event":"server_error"' in failure_logs and "Traceback" not in failure_logs, "Missing sanitized paired-bank startup failure")
            report["checks"].append("flashcard subject absent from quiz bank fails paired initialization; startup canaries and traces are redacted")
        report["result"] = "pass"
    finally:
        for container in containers:
            docker("rm", "--force", container)
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"API container smoke passed: {len(report['checks'])} groups on {report['image_platform']}")


if __name__ == "__main__":
    main()

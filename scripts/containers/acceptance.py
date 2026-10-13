"""Clean repeated native builds and isolated L2 acceptance; retains scoped evidence/logs."""

import argparse
import hashlib
import json
import platform
import subprocess
import sys
import time
from pathlib import Path

from compose_support import docker

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "test-results/container-acceptance")
    parser.add_argument("--expected-architecture", choices=["amd64", "arm64"])
    args = parser.parse_args()
    output = args.output.absolute()
    output.mkdir(parents=True, exist_ok=True)
    architecture = docker("info", "--format", "{{.Architecture}}")
    architecture = {"aarch64": "arm64", "x86_64": "amd64"}.get(architecture, architecture)
    host = {"aarch64": "arm64", "arm64": "arm64", "x86_64": "amd64", "AMD64": "amd64"}.get(platform.machine())
    if architecture != host or (args.expected_architecture and architecture != args.expected_architecture):
        parser.error("Host and Docker engine must match the requested native architecture; emulation is not acceptance")
    report = {"source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "worktree_changes": subprocess.check_output(["git", "status", "--short"], cwd=ROOT, text=True).splitlines(),
              "platform": "linux/" + architecture, "host": platform.system() + "/" + platform.machine(),
              "docker": docker("version", "--format", "{{.Client.Version}}/{{.Server.Version}}"),
              "compose": docker("compose", "version", "--short"), "commands": [], "builds": [],
              "reproducibility": "two no-cache builds from pinned inputs; output/content/runtime verified, no byte-identical digest promise"}
    inputs = ["Dockerfile", "backend/Dockerfile", "compose.yaml", ".dockerignore", "package-lock.json",
              "backend/requirements.lock", "backend/requirements-build.lock", "ops/containers/nginx.conf",
              "ops/containers/proxy.conf", "src/content/questionBank.generated.json", "src/content/flashcardBank.generated.json"]
    inputs += [str(p.relative_to(ROOT)) for p in (ROOT / "scripts/containers").glob("*.py")]
    inputs += [str(p.relative_to(ROOT)) for p in (ROOT / "backend/src/meducation_api").rglob("*.py")]
    inputs += [str(p.relative_to(ROOT)) for p in (ROOT / "backend/src/meducation_api").rglob("*.sql")]
    inputs += [str(p.relative_to(ROOT)) for p in (ROOT / "backend/tests").glob("*.py")]
    inputs += [str(p.relative_to(ROOT)) for p in (ROOT / "tests/fixtures").rglob("*.json")]
    inputs += ["scripts/content/validate-paired-files.ts",
               "backend/pyproject.toml", "backend/requirements-dev.lock",
               "playwright.containers.config.ts", "e2e/containers/service-recreation.spec.ts"]
    report["inputs_sha256"] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in inputs}

    def run(name, command, timeout=600):
        print("Running " + name, flush=True)
        started = time.monotonic()
        with (output / (name + ".log")).open("w") as log:
            result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                                    timeout=timeout, check=False)
        report["commands"].append({"name": name, "command": command, "exit_code": result.returncode,
                                   "seconds": round(time.monotonic() - started, 2), "log": name + ".log"})
        if result.returncode:
            # These logs come only from builds and isolated synthetic smokes, never env/config dumps.
            # Show the underlying assertion in Actions instead of only the wrapper traceback.
            with (output / (name + ".log")).open("rb") as log:
                log.seek(0, 2)
                log.seek(max(0, log.tell() - 24000))
                excerpt = log.read().decode(errors="replace")
            print(f"{name} failure log (last 24000 bytes):\n{excerpt}", file=sys.stderr, flush=True)
            raise RuntimeError(f"{name} failed; see {output / (name + '.log')}")
        print(name + " passed", flush=True)

    def smoke(name, script, *options):
        run(name, [sys.executable, str(ROOT / "scripts/containers" / script), *options,
                   "--report", str(output / (name + ".json"))], timeout=900)

    try:
        for iteration in (1, 2):
            run(f"build-{iteration}", ["docker", "compose", "build", "--pull", "--no-cache", "api", "frontend"], timeout=900)
            images = {tag: json.loads(docker("image", "inspect", tag))[0]
                      for tag in ("meducation-api:local", "meducation-learner:local")}
            if any(image["Architecture"] != architecture or image["Os"] != "linux" for image in images.values()):
                raise RuntimeError("Built image platform does not match native Docker engine")
            report["builds"].append({"iteration": iteration, "images": {tag: image["Id"] for tag, image in images.items()}})
            smoke(f"api-{iteration}", "smoke-api.py", "--image", "meducation-api:local")
            smoke(f"learner-{iteration}", "smoke-learner.py", "--api-image", "meducation-api:local",
                  "--frontend-image", "meducation-learner:local", *(("--browser",) if iteration == 2 else ()))
        smoke("compose", "smoke-compose.py")
        smoke("postgres-tools", "smoke-postgres-tools.py")
        run("db-toolchain", [sys.executable, str(ROOT / "scripts/containers/smoke-db-toolchain.py"),
                             "--image", "meducation-api:local", "--output", str(output / "db-toolchain.json")], timeout=300)
        run("postgres-content", [sys.executable, str(ROOT / "scripts/containers/test-postgres-content.py"),
                                 "--output", str(output / "postgres-content.json")], timeout=300)
        if any(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != value for name, value in report["inputs_sha256"].items()):
            raise RuntimeError("Acceptance inputs changed during execution")
        report["result"] = "pass"
    except Exception:
        report["result"] = "fail"
        raise
    finally:
        (output / "acceptance.json").write_text(json.dumps(report, indent=2) + "\n")
    print("Native container acceptance passed; evidence: " + str(output / "acceptance.json"))


if __name__ == "__main__":
    main()

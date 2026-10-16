"""Check shipped learner assets, real API proxy and Docker DNS recovery in isolation."""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from contextlib import ExitStack
from pathlib import Path

from postgres_fixture import postgres_fixture

ROOT = Path(__file__).resolve().parents[2]
UNAVAILABLE_API = """
from http.server import BaseHTTPRequestHandler, HTTPServer
class Unavailable(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(503)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('ETag', '"l2-unavailable"')
        self.end_headers()
        self.wfile.write(b'{"detail":{"code":"l2_unavailable"}}')
HTTPServer(('0.0.0.0', 8000), Unavailable).serve_forever()
"""


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def docker(*args, timeout=30):
    result = subprocess.run(
        ["docker", *args], capture_output=True, text=True, timeout=timeout, check=True
    )
    return result.stdout.strip()


def inspect(container):
    return json.loads(docker("inspect", container))[0]


def wait_for(predicate, description, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.25)
    raise RuntimeError("Timed out waiting for " + description)


def healthy(container):
    state = inspect(container)["State"]
    require(state["Running"], "Container exited before readiness")
    return state.get("Health", {}).get("Status") == "healthy"


def request(origin, path, headers=None):
    req = urllib.request.Request(origin + path, headers=headers or {})
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, {k.lower(): v for k, v in response.headers.items()}, response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend-image", default="meducation-learner:l2-step3")
    parser.add_argument("--api-image", default="meducation-api:l2-step2")
    parser.add_argument("--browser", action="store_true", help="Run the existing learner suite through the proxy with fixture banks")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    frontend = json.loads(docker("image", "inspect", args.frontend_image))[0]
    api_image = json.loads(docker("image", "inspect", args.api_image))[0]
    require(frontend["Config"]["User"] == "101:101", "Wrong frontend image user")
    run_id = uuid.uuid4().hex
    network_name = "meducation-l2-proxy-" + run_id
    containers = []
    resources = ExitStack()
    report = {
        "frontend_image": frontend["Id"], "api_image": api_image["Id"],
        "image_platform": f"{frontend['Os']}/{frontend['Architecture']}", "checks": [],
    }
    network = docker("network", "create", "--label", f"meducation.l2.proxy-smoke={run_id}", network_name)

    def start(label, image, *options, command=()):
        container = docker(
            "create", "--name", f"{network_name}-{label}", "--network", network,
            "--label", f"meducation.l2.proxy-smoke={run_id}", "--read-only", "--tmpfs", "/tmp",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", *options, image, *command,
        )
        containers.append(container)
        docker("start", container)
        return container

    def remove(container):
        docker("rm", "--force", container)
        containers.remove(container)

    try:
        folder = Path(resources.enter_context(tempfile.TemporaryDirectory(prefix=network_name)))
        reader_env = resources.enter_context(postgres_fixture(network_name, network_name, folder))
        front = start("frontend", frontend["Id"], "--publish", "127.0.0.1::8080")
        # Track by exact generated name so browser recreation cleanup removes the replacement.
        front = inspect(front)["Name"].lstrip("/")
        containers[-1] = front
        wait_for(lambda: healthy(front), "frontend health without API")
        binding = inspect(front)["NetworkSettings"]["Ports"]["8080/tcp"]
        require(len(binding) == 1 and binding[0]["HostIp"] == "127.0.0.1", "Loopback binding required")
        origin = "http://127.0.0.1:" + binding[0]["HostPort"]
        frontend_started = inspect(front)["State"]["StartedAt"]
        require(docker("exec", front, "id", "-u") == "101", "Frontend is not non-root")
        docker("exec", front, "nginx", "-t")
        audit = json.loads(docker("exec", front, "cat", "/opt/learner-artifacts.json"))
        require(not audit["adminAndQaModules"] and not audit["canonicalBankModules"], "Forbidden learner modules")
        report["artifact_audit"] = audit
        for file in audit["files"]:
            status, headers, body = request(origin, "/" + file["path"])
            require(status == 200 and hashlib.sha256(body).hexdigest() == file["sha256"],
                    "Shipped artifact drift: " + file["path"])
            if file["path"].startswith("assets/"):
                require(headers.get("cache-control") == "public, max-age=31536000, immutable", "Asset cache policy failed")
            else:
                require(headers.get("cache-control") == "no-cache", "Stable file must revalidate")
        for path in ["/admin.html", "/assets/missing.js", "/missing.svg", "/missing.txt", "/.vite/manifest.json"]:
            require(request(origin, path)[0] == 404, "Missing/private artifact fell through: " + path)
        js = next(f["path"] for f in audit["files"] if f["path"].endswith('.js'))
        require(request(origin, "/" + js + ".map")[0] == 404, "Source map was shipped")
        require(request(origin, "/health/frontend")[0] == 200, "Static health failed")
        require(request(origin, "/api/v1/subjects")[0] == 502, "Absent API must fail visibly")
        report["checks"].append("non-root/read-only static startup independent of API; shipped artifact hashes/cache/missing-file policies")

        api = start("api-first", api_image["Id"], "--network-alias", "api", "--env-file", str(reader_env))
        wait_for(lambda: healthy(api), "canonical API health")
        wait_for(lambda: request(origin, "/health/ready")[0] == 200, "proxied readiness")
        status, headers, subjects = request(origin, "/api/v1/subjects")
        require(status == 200 and json.loads(subjects)["subjects"], "API path prefix was lost")
        require(headers.get("cache-control") == "no-cache", "API cache header changed")
        require(request(origin, "/api/v1/subjects", {"If-None-Match": headers["etag"]})[0] == 304,
                "If-None-Match/ETag not preserved")
        for path, req_headers, expected in [
            ("/api/v1/subjects?revision=stale", {}, 409),
            ("/api/v1/subjects", {"If-Match": '"stale"'}, 409),
            ("/api/v1/missing.css", {}, 404),
            ("/api", {}, 404),
        ]:
            status, response_headers, body = request(origin, path, req_headers)
            require(status == expected and 'application/json' in response_headers.get('content-type', ''),
                    "API failure became static HTML: " + path)
            require("detail" in json.loads(body), "API error body changed")
        require(json.loads(request(origin, "/health/live")[2]) == {"status": "live"}, "API liveness route failed")
        report["checks"].append("real /api prefix/query/conditional headers/ETag/cache, JSON 404/409 and API health routing")

        old_ip = inspect(api)["NetworkSettings"]["Networks"][network_name]["IPAddress"]
        docker("stop", "--time", "15", api)
        outage_started = time.monotonic()
        outage_status, _, outage_body = request(origin, "/api/v1/subjects")
        outage_seconds = time.monotonic() - outage_started
        require(outage_status in {502, 504} and b'<div id="root"' not in outage_body,
                f"Stopped API must produce a gateway failure, got {outage_status}")
        require(outage_seconds < 12, "Upstream failure exceeded configured timeouts")
        report["outage"] = {"status": outage_status, "seconds": outage_seconds}
        require(request(origin, "/")[0] == 200 and healthy(front), "API outage broke static serving")
        remove(api)
        start("address-holder", api_image["Id"], "--no-healthcheck", command=("python", "-c", "import time; time.sleep(600)"))
        api = start("api-recreated", api_image["Id"], "--network-alias", "api", "--env-file", str(reader_env))
        new_ip = inspect(api)["NetworkSettings"]["Networks"][network_name]["IPAddress"]
        require(new_ip != old_ip, "DNS recreation test needs a changed API address")
        wait_for(lambda: healthy(api), "recreated API health")
        wait_for(lambda: request(origin, "/api/v1/subjects")[2] == subjects, "DNS recovery without frontend restart")
        require(inspect(front)["State"]["StartedAt"] == frontend_started, "Frontend was restarted")
        report["dns_recovery"] = {"old_ip": old_ip, "new_ip": new_ip, "frontend_restarted": False}
        report["checks"].append("bounded upstream outage and automatic recovery after API IP change")

        remove(api)
        stub = start("unavailable-api", api_image["Id"], "--network-alias", "api", "--no-healthcheck",
                     command=("python", "-c", UNAVAILABLE_API))
        wait_for(lambda: request(origin, "/api/l2/unavailable")[0] == 503, "upstream 503 forwarding")
        status, headers, body = request(origin, "/api/l2/unavailable")
        require(body == b'{"detail":{"code":"l2_unavailable"}}' and headers.get('etag') == '"l2-unavailable"'
                and headers.get('cache-control') == 'no-cache', "Upstream 503 body/headers changed")
        report["checks"].append("synthetic upstream 503 JSON body/cache/ETag preserved through shipped proxy")
        remove(stub)

        if args.browser:
            fixture_api = start("fixture-api", api_image["Id"], "--network-alias", "api", "--env-file", str(reader_env))
            wait_for(lambda: healthy(fixture_api), "fixture API health")
            wait_for(lambda: 'Browser Test Subject' in request(origin, "/api/v1/subjects")[2].decode(), "fixture DNS recovery")
            env = {**os.environ, "MEDUCATION_CONTAINER_URL": origin,
                   "MEDUCATION_SMOKE_FRONTEND": front, "MEDUCATION_SMOKE_RUN_ID": run_id,
                   "MEDUCATION_SMOKE_PYTHON": sys.executable}
            browser = subprocess.run(
                ["npx", "playwright", "test", "--config=playwright.containers.config.ts"],
                cwd=ROOT, env=env, text=True, capture_output=True, timeout=600, check=False,
            )
            print(browser.stdout)
            require(browser.returncode == 0, "Container learner browser suite failed: " + browser.stderr[-2000:])
            report["browser_result"] = browser.stdout
            report["checks"].append("existing learner Chromium flows against fixture API through shipped static proxy")
        docker("stop", "--time", "15", front)
        require(inspect(front)["State"]["ExitCode"] == 0, "Frontend did not shut down cleanly")
        report["checks"].append("frontend graceful SIGQUIT shutdown")
        report["result"] = "pass"
    except Exception:
        # Synthetic/canonical read-only API and Nginx only; no DB/env/config dumps.
        for container in containers:
            logs = subprocess.run(["docker", "logs", "--tail", "40", container],
                                  capture_output=True, text=True, timeout=15, check=False)
            print(f"Smoke container {container}:\n{logs.stdout[-4000:]}{logs.stderr[-4000:]}", file=sys.stderr)
        raise
    finally:
        for container in reversed(containers):
            docker("rm", "--force", container)
        resources.close()
        docker("network", "rm", network)
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Learner proxy smoke passed: {len(report['checks'])} groups on {report['image_platform']}")


if __name__ == "__main__":
    main()

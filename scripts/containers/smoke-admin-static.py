"""Audit the optional packaged admin's real static/proxy boundary with admin disabled."""

import argparse
import hashlib
import json
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from contextlib import ExitStack
from pathlib import Path

from compose_support import docker
from postgres_fixture import postgres_fixture


def request(origin, path):
    try:
        response = urllib.request.urlopen(origin + path, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, {key.lower(): value for key, value in response.headers.items()}, response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend-image", required=True)
    parser.add_argument("--api-image", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    name = "meducation-admin-static-" + uuid.uuid4().hex[:12]
    label = "meducation.admin-static=" + name
    containers = []
    resources = ExitStack()
    report = None
    docker("network", "create", "--label", label, name)
    try:
        folder = Path(resources.enter_context(tempfile.TemporaryDirectory(prefix=name)))
        reader_env = resources.enter_context(postgres_fixture(name, name, folder))
        for suffix, image, options in (
            ("api", args.api_image, ["--network-alias", "api", "--env-file", str(reader_env)]),
            ("frontend", args.frontend_image, ["--publish", "127.0.0.1::8080"]),
        ):
            container = name + "-" + suffix
            containers.append(container)
            docker("run", "--detach", "--name", container, "--label", label,
                   "--network", name, "--read-only", "--tmpfs", "/tmp", "--cap-drop", "ALL",
                   "--security-opt", "no-new-privileges:true", *options, image)
        front = containers[-1]
        info = json.loads(docker("inspect", front))[0]
        assert info["Config"]["User"] == "101:101"
        port = info["NetworkSettings"]["Ports"]["8080/tcp"][0]
        assert port["HostIp"] == "127.0.0.1"
        origin = "http://127.0.0.1:" + port["HostPort"]
        deadline = time.monotonic() + 60
        while True:
            try:
                if request(origin, "/health/ready")[0] == 200:
                    break
            except (OSError, TimeoutError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError("Admin static fixture readiness deadline")
            time.sleep(0.25)
        docker("exec", front, "nginx", "-t")
        audit = json.loads(docker("exec", front, "cat", "/opt/admin-artifacts.json"))
        for artifact in audit["files"]:
            status, _, body = request(origin, "/" + artifact["path"])
            assert status == 200 and hashlib.sha256(body).hexdigest() == artifact["sha256"]
        status, headers, body = request(origin, "/admin.html")
        assert status == 200 and headers["cache-control"] == "no-store" and b'<div id="root">' in body
        assert request(origin, "/admin.html?callback=fixture")[1]["cache-control"] == "no-store"
        for path in ("/api/admin/session", "/api/admin/draft"):
            status, headers, body = request(origin, path)
            assert status == 503 and headers["cache-control"] == "no-store"
            assert json.loads(body)["error"]["code"] == "admin_disabled"
        status, headers, _ = request(origin, "/api/v1/subjects")
        assert status == 200 and headers["cache-control"] == "no-cache"
        for path in ("/assets/missing.js", "/assets/missing.js.map", "/.vite/manifest.json", "/admin-artifacts.json"):
            assert request(origin, path)[0] == 404
        asset = next(a["path"] for a in audit["files"] if a["path"].endswith(".js"))
        assert "immutable" in request(origin, "/" + asset)[1]["cache-control"]
        report = {"result": "pass", "frontend_image": docker("image", "inspect", "--format", "{{.Id}}", args.frontend_image),
                  "api_image": docker("image", "inspect", "--format", "{{.Id}}", args.api_image),
                  "platform": docker("image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", args.frontend_image),
                  "checks": ["all packaged artifact hashes through real nginx", "admin entry/callback no-store",
                             "disabled private API remains 503/no-store; public API no-cache", "immutable hashed assets",
                             "missing assets/maps/manifests/audit never SPA fallback", "non-root/read-only tmpfs runtime"],
                  "artifacts": audit, "scope": "PostgreSQL synthetic fixture with admin disabled; no authority DB or hosted identity"}
    finally:
        for container in docker("ps", "--all", "--quiet", "--filter", "label=" + label).splitlines():
            info = json.loads(docker("inspect", container))[0]
            assert info["Config"]["Labels"].get("meducation.admin-static") == name
            assert info["Name"].lstrip("/") in containers
            docker("rm", "--force", container)
        assert json.loads(docker("network", "inspect", name))[0]["Labels"]["meducation.admin-static"] == name
        resources.close()
        docker("network", "rm", name)
        if report is not None:
            report["cleanup"] = "pass"
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()

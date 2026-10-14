"""Verify the packaged validator and real nginx limits using disposable test-only routes."""

import argparse
import copy
import http.client
import json
import tempfile
import time
import uuid
from pathlib import Path

from compose_support import docker

ROOT = Path(__file__).resolve().parents[2]
NGINX = "nginxinc/nginx-unprivileged:1.30.5-trixie@sha256:8f18dedfceea3d7feb98792810c8c9925c985890ade257f2ec1b2f492b4eaebb"
# This module is mounted only into a disposable smoke container, never packaged.
TEST_APP = '''
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from meducation_api.content_policy import ContentPolicyError, PairedContentValidator, read_json_body
app = FastAPI()
@app.exception_handler(ContentPolicyError)
async def rejected(request, error):
    return JSONResponse(error.response(), status_code=error.status)
@app.get('/health/live')
def live(): return {'status': 'live'}
@app.post('/api/admin/test-policy')
async def preview(request: Request):
    pair = await read_json_body(request)
    valid = await run_in_threadpool(PairedContentValidator().validate, pair)
    return {'policyVersion': valid.policy_version, 'warnings': valid.warnings}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="meducation-api:l4-step2")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    prefix = "meducation-policy-" + uuid.uuid4().hex[:10]
    network, api, proxy = prefix + "-net", prefix + "-api", prefix + "-proxy"
    report = {"image": args.image, "checks": [], "isolation": "unique network/containers; loopback port; test-only routes; no databases or volumes"}
    try:
        docker("network", "create", network)
        with tempfile.TemporaryDirectory(prefix=prefix) as folder:
            module = Path(folder) / "policy_http.py"
            module.write_text(TEST_APP)
            docker("run", "--detach", "--name", api, "--network", network,
                   "--network-alias", "api", "--memory", "1g", "--read-only",
                   "--tmpfs", "/tmp:rw,size=64m", "--mount",
                   f"type=bind,src={module},dst=/app/policy_http.py,readonly",
                   "--entrypoint", "python", args.image, "-m", "uvicorn",
                   "policy_http:app", "--app-dir", "/app", "--host", "0.0.0.0",
                   "--port", "8000", timeout=60)
            docker("run", "--detach", "--name", proxy, "--network", network,
                   "--publish", "127.0.0.1::8080", "--mount",
                   f"type=bind,src={ROOT / 'ops/containers/nginx.conf'},dst=/etc/nginx/nginx.conf,readonly",
                   "--mount", f"type=bind,src={ROOT / 'ops/containers/proxy.conf'},dst=/etc/nginx/meducation-proxy.conf,readonly",
                   NGINX, timeout=60)
            port = int(json.loads(docker("inspect", proxy))[0]["NetworkSettings"]["Ports"]["8080/tcp"][0]["HostPort"])

            def request(body, headers=None, *, chunked=False):
                connection = http.client.HTTPConnection("127.0.0.1", port, timeout=160)
                try:
                    connection.request("POST", "/api/admin/test-policy", body=body,
                                       headers={"Content-Type": "application/json", **(headers or {})},
                                       encode_chunked=chunked)
                    response = connection.getresponse()
                    return response.status, response.read()
                finally:
                    connection.close()

            fixture = json.loads((ROOT / "tests/fixtures/paired-authoring-cases.json").read_bytes())
            body = json.dumps(fixture["base"], ensure_ascii=False).encode()
            deadline = time.monotonic() + 30
            while True:
                try:
                    status, _ = request(body)
                    if status == 200:
                        break
                except OSError, http.client.HTTPException:
                    pass
                if time.monotonic() > deadline:
                    raise RuntimeError("Disposable policy proxy did not become ready")
                time.sleep(0.25)
            report["checks"].append("packaged Python/Node policy accepted fixture through nginx")
            invalid = copy.deepcopy(fixture["base"])
            invalid["quizzes"]["questions"][0]["stem"] = '<script>PRIVATE_SENTINEL</script>'
            status, error = request(json.dumps(invalid).encode())
            assert status == 422 and b"PRIVATE_SENTINEL" not in error
            report["checks"].append("rich-policy rejection and safe error paths pass through nginx")
            limit = 64 * 1024 * 1024
            status, _ = request(b"{}", {"Content-Length": str(limit + 1)})
            assert status == 413
            report["checks"].append("nginx rejects declared request above 64 MiB")
            # Stream exact limit as a tiny valid pair plus whitespace, without a giant host allocation.
            def chunks(extra=0):
                yield body
                remaining = limit + extra - len(body)
                while remaining:
                    count = min(1024 * 1024, remaining)
                    yield b" " * count
                    remaining -= count
            status, _ = request(chunks(), chunked=True)
            assert status == 200
            report["checks"].append("exact 64 MiB chunked body accepted by nginx and API")
            status, _ = request(chunks(1), chunked=True)
            assert status == 413
            report["checks"].append("64 MiB plus one chunked byte rejected")
            status, _ = request(body, {"Content-Encoding": "gzip"})
            assert status == 415
            report["checks"].append("compressed body denied without expansion")
            # Check packaged actual-bank acceptance independently of the test-only endpoint.
            actual_check = """
import hashlib, json, platform
from pathlib import Path
from meducation_api.content_policy import PairedContentValidator
q = Path('/app/content/questionBank.generated.json').read_text()
f = Path('/app/content/flashcardBank.generated.json').read_text()
p = PairedContentValidator().documents(q, f)
assert p.quiz_artifact == q and p.flashcard_artifact == f
print(json.dumps({'policyVersion': p.policy_version, 'warnings': p.warnings,
                  'pythonVersion': platform.python_version(),
                  'quizSha256': hashlib.sha256(q.encode()).hexdigest(),
                  'flashcardSha256': hashlib.sha256(f.encode()).hexdigest()}))
"""
            summary = json.loads(docker("exec", api, "python", "-c", actual_check, timeout=150))
            assert summary["policyVersion"] == 1
            report["actualBank"] = summary
            report["nodeVersion"] = docker("exec", api, "node", "--version")
            report["checks"].append("installed wheel validates actual banks with exact artifact bytes")
            report["imageId"] = docker("image", "inspect", "--format", "{{.Id}}", args.image)
            report["platform"] = docker("image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", args.image)
            report["result"] = "pass"
            print(json.dumps(report, indent=2))
    finally:
        for name in (proxy, api):
            try:
                docker("rm", "--force", name)
            except RuntimeError:
                pass
        try:
            docker("network", "rm", network)
        except RuntimeError:
            pass
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()

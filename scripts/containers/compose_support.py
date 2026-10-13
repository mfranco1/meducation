"""Small read-only Docker readiness helpers shared by Compose commands/smoke."""

import json
import subprocess
import time


def docker(*args, input_text=None, timeout=30):
    result = subprocess.run(
        ["docker", *args], input=input_text, capture_output=True, text=True,
        timeout=timeout, check=False,
    )
    if result.returncode:
        raise RuntimeError(f"Docker command failed ({result.returncode}): {result.stderr[-1500:]}")
    return result.stdout.strip()


def service_container(project, service, timeout=30):
    ids = docker(
        "ps", "--all", "--quiet", "--filter", f"label=com.docker.compose.project={project}",
        "--filter", f"label=com.docker.compose.service={service}",
        "--filter", "label=com.docker.compose.oneoff=False",
        timeout=timeout,
    ).splitlines()
    if len(ids) > 1:
        raise RuntimeError(f"Expected one {service} container; found {len(ids)}")
    return ids[0] if ids else None


def wait_services(project, services, timeout=90):
    deadline = time.monotonic() + timeout
    pending = set(services)
    ready = {}
    while time.monotonic() < deadline:
        for service in sorted(pending):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                container = service_container(project, service, timeout=remaining)
            except subprocess.TimeoutExpired:
                raise RuntimeError("Readiness deadline exceeded for: " + ", ".join(sorted(pending))) from None
            if not container:
                continue
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                state = json.loads(docker("inspect", "--format", "{{json .State}}", container, timeout=remaining))
            except subprocess.TimeoutExpired:
                raise RuntimeError("Readiness deadline exceeded for: " + ", ".join(sorted(pending))) from None
            if not state["Running"]:
                raise RuntimeError(f"{service} exited before readiness (exit {state['ExitCode']}); inspect its logs")
            status = state.get("Health", {}).get("Status")
            if status == "healthy":
                ready[service] = container
                pending.remove(service)
            elif status == "unhealthy":
                raise RuntimeError(f"{service} healthcheck is unhealthy; inspect its logs")
            elif status is None:
                raise RuntimeError(f"{service} has no healthcheck")
        if not pending:
            return ready
        time.sleep(min(0.25, max(0, deadline - time.monotonic())))
    raise RuntimeError("Readiness deadline exceeded for: " + ", ".join(sorted(pending)))

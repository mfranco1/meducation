"""Recreate only a labeled learner smoke frontend at its existing loopback port."""

import argparse
import json
import re

from compose_support import docker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{32}", args.run_id):
        parser.error("Expected generated smoke run ID")
    name = "meducation-l2-proxy-" + args.run_id + "-frontend"
    if args.container != name:
        parser.error("Refusing a container outside the exact generated smoke namespace")
    original = json.loads(docker("inspect", name))[0]
    label = "meducation.l2.proxy-smoke"
    networks = original["NetworkSettings"]["Networks"]
    bindings = original["NetworkSettings"]["Ports"].get("8080/tcp")
    if (original["Config"]["Labels"].get(label) != args.run_id
            or original["Config"]["User"] != "101:101" or not original["HostConfig"]["ReadonlyRootfs"]
            or len(networks) != 1 or not bindings or len(bindings) != 1
            or bindings[0]["HostIp"] != "127.0.0.1" or not bindings[0]["HostPort"].isdigit()):
        parser.error("Refusing a container that does not match the disposable frontend contract")
    network = next(iter(networks))
    details = json.loads(docker("network", "inspect", network))[0]
    if details.get("Labels", {}).get(label) != args.run_id:
        parser.error("Refusing a network outside the generated smoke namespace")
    docker("stop", "--time", "15", name)
    docker("rm", name)
    replacement = docker("create", "--name", name, "--network", network,
                         "--label", f"{label}={args.run_id}", "--read-only", "--tmpfs", "/tmp",
                         "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                         "--publish", "127.0.0.1:" + bindings[0]["HostPort"] + ":8080", original["Image"])
    docker("start", name)
    print(replacement)


if __name__ == "__main__":
    main()

"""Stop/start only the restartable PG17 fixture with its exact label and loopback binding."""

import argparse
import json
import re

from pg_container import docker, wait_ready


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--action", choices=("stop", "start"), required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"meducation-pg-content-[0-9a-f]{12}", args.container):
        parser.error("Not a named disposable fixture")
    metadata = json.loads(docker("inspect", args.container))[0]
    bindings = metadata["HostConfig"]["PortBindings"].get("5432/tcp", [])
    volumes = metadata.get("Mounts", [])
    if (
        metadata["Config"].get("Labels", {}).get("meducation.restartable-fixture")
        != args.container
        or bindings != [{"HostIp": "127.0.0.1", "HostPort": str(args.port)}]
        or not any(
            m.get("Type") == "volume"
            and m.get("Name") == args.container + "-data"
            and m.get("Destination") == "/var/lib/postgresql/data"
            for m in volumes
        )
    ):
        parser.error("Refusing a container outside the exact owned restart fixture")
    if args.action == "stop":
        docker("stop", "--time", "3", args.container)
        return
    docker("start", args.container)
    wait_ready(args.container, "meducation_test_content")


if __name__ == "__main__":
    main()

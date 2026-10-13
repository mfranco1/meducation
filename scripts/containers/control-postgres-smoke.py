"""Control only the exact owned browser-smoke API/PG containers; never routine services."""

import argparse
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from compose_support import docker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True)
    parser.add_argument(
        "--action", choices=["json", "postgres", "changed", "original"], required=True
    )
    args = parser.parse_args()
    if not re.fullmatch("[0-9a-f]{32}", args.run_id):
        parser.error("Invalid smoke run ID")
    prefix = "meducation-l2-proxy-" + args.run_id
    label = "meducation.l2.proxy-smoke"
    api = json.loads(docker("inspect", prefix + "-api"))[0]
    pg = json.loads(docker("inspect", prefix + "-pg"))[0]
    for container in (api, pg):
        if container["Config"].get("Labels", {}).get(label) != args.run_id or set(
            container["NetworkSettings"]["Networks"]
        ) != {prefix}:
            parser.error("Refusing a container outside the exact owned smoke network")
    if args.action in ("changed", "original"):
        direction = "DESC" if args.action == "changed" else "ASC"
        sql = f"""DO $$ BEGIN IF (SELECT count(*) FROM content.releases)<>2 THEN RAISE EXCEPTION 'Wrong fixture state'; END IF; END $$;
SELECT content.activate_release(gen_random_uuid(),(SELECT release_id FROM content.releases ORDER BY created_at {direction} LIMIT 1),(SELECT publication_sequence FROM content.active_publication),'local-browser-probe','Explicit fixture publication');"""
        result = subprocess.run(
            [
                "docker",
                "exec",
                "-i",
                "--env",
                "PGPASSFILE=/tmp/browser.pgpass",
                prefix + "-pg",
                "psql",
                "--host",
                "127.0.0.1",
                "--username",
                "meducation_operator",
                "--dbname",
                "meducation_verify_browser",
                "--no-password",
                "--no-psqlrc",
                "--set",
                "ON_ERROR_STOP=1",
                "--tuples-only",
                "--no-align",
            ],
            input=sql,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        if result.returncode:
            raise RuntimeError(
                "Fixture activation failed; no SQL or credentials logged"
            )
        print("Fixture publication activated")
        return
    if (
        api["Config"]["User"] != "10001:10001"
        or not api["HostConfig"]["ReadonlyRootfs"]
    ):
        parser.error("Unexpected smoke API runtime contract")
    with tempfile.TemporaryDirectory(prefix="meducation-smoke-switch-") as folder:
        env = Path(folder) / "reader.env"
        values = {
            entry.split("=", 1)[0]: entry.split("=", 1)[1]
            for entry in api["Config"]["Env"]
        }
        values["MEDUCATION_CONTENT_SOURCE"] = args.action
        env.write_text(
            "".join(
                key + "=" + value + "\n"
                for key, value in values.items()
                if key.startswith("MEDUCATION_")
            )
        )
        os.chmod(env, 0o600)
        options = []
        for mount in api["Mounts"]:
            if mount["Type"] == "bind":
                if mount["RW"]:
                    parser.error("Unexpected writable API mount")
                options += [
                    "--mount",
                    f"type=bind,src={mount['Source']},dst={mount['Destination']},readonly",
                ]
        docker("stop", "--time", "15", prefix + "-api")
        docker("rm", prefix + "-api")
        docker(
            "run",
            "--detach",
            "--name",
            prefix + "-api",
            "--network",
            prefix,
            "--network-alias",
            "api",
            "--label",
            label + "=" + args.run_id,
            "--env-file",
            str(env),
            "--read-only",
            "--tmpfs",
            "/tmp",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            *options,
            api["Image"],
        )
    print("Fixture API source switched")


if __name__ == "__main__":
    main()

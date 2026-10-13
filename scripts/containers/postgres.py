"""Local development PG17 backup/restore tools; L3 supplies production roles/parity."""

import argparse
import json
import subprocess
from pathlib import Path

from postgres_tools import PostgresTools, discard_volume


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="meducation-local")
    actions = parser.add_subparsers(dest="action", required=True)
    actions.add_parser("versions")
    sql = actions.add_parser("psql", help="Execute SQL read from stdin with ON_ERROR_STOP")
    sql.add_argument("--database", default="meducation")
    dump = actions.add_parser("dump")
    dump.add_argument("--database", default="meducation")
    dump.add_argument("--output", type=Path, required=True)
    restore = actions.add_parser("restore", help="Create a fresh verification DB; existing targets fail")
    restore.add_argument("--database", required=True)
    restore.add_argument("--input", type=Path, required=True)
    reset = actions.add_parser("discard-volume", help="Destructive: intentionally discard disposable data")
    reset.add_argument("--discard-disposable-data", action="store_true", required=True)
    args = parser.parse_args()
    try:
        if args.action == "discard-volume":
            print("Removed " + discard_volume(args.project))
            return
        tools = PostgresTools(args.project)
        if args.action == "versions":
            print(json.dumps(tools.versions, indent=2))
        elif args.action == "psql":
            import sys
            print(tools.sql(args.database, sys.stdin.read()), end="")
        elif args.action == "dump":
            print("Saved " + str(tools.dump(args.database, args.output)))
        elif args.action == "restore":
            tools.restore(args.input, args.database)
            print("Restored fresh verification database " + args.database)
    except (RuntimeError, ValueError, OSError, subprocess.TimeoutExpired) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()

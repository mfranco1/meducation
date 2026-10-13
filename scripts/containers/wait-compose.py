"""Wait for the selected local Compose service healthchecks without starting anything."""

import argparse
import re

from compose_support import wait_services

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("services", nargs="+", choices=["api", "frontend", "postgres"])
parser.add_argument("--project", default="meducation-local")
parser.add_argument("--timeout", type=int, default=90)
args = parser.parse_args()
if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", args.project):
    parser.error("Invalid Compose project name")
if not 1 <= args.timeout <= 600:
    parser.error("Timeout must be between 1 and 600 seconds")
wait_services(args.project, args.services, args.timeout)
print("Healthy: " + ", ".join(args.services))

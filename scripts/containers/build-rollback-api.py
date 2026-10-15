"""Build a concrete retained revision for isolated application rollback acceptance."""

import argparse
import io
import subprocess
import tarfile
import tempfile
from pathlib import Path

from compose_support import docker

ROOT = Path(__file__).resolve().parents[2]
PRIOR_REF = "bb8f354971cf5914eaad50feb24671b833ae679c"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", default="meducation-api:l5-rollback-prior")
    args = parser.parse_args()
    archive = subprocess.check_output(["git", "archive", PRIOR_REF], cwd=ROOT)
    with tempfile.TemporaryDirectory(prefix="meducation-rollback-build-") as folder:
        with tarfile.open(fileobj=io.BytesIO(archive)) as source:
            source.extractall(folder, filter="data")
        # Building the archived Dockerfile preserves the historical pinned inputs.
        docker(
            "build",
            "--file",
            str(Path(folder) / "backend/Dockerfile"),
            "--tag",
            args.tag,
            folder,
            timeout=900,
        )
    print("Retained API build passed: " + PRIOR_REF)


if __name__ == "__main__":
    main()

"""Serve explicit synthetic browser inputs from an owned, disposable PostgreSQL DB.

Never reads authority configuration, reuses a routine database, or serves content
from files. Inputs seed a fresh database before the test-only API starts.
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from pg_container import docker, role_password_env, start_postgres
from sqlalchemy import URL

ROOT = Path(__file__).resolve().parents[2]
LABEL = "meducation.browser-fixture"


def loopback_origin(value):
    parsed = urlsplit(value)
    if (
        parsed.scheme != "http"
        or parsed.hostname != "127.0.0.1"
        or not parsed.port
        or parsed.username
        or parsed.password
        or parsed.path
        or parsed.query
        or parsed.fragment
    ):
        raise argparse.ArgumentTypeError(
            "Browser fixture origin must be an explicit HTTP loopback origin."
        )
    return value


def stop(signum, frame):
    raise KeyboardInterrupt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-port", type=int, required=True)
    parser.add_argument("--origin", type=loopback_origin, required=True)
    parser.add_argument("--quiz-file", type=Path)
    parser.add_argument("--flashcard-file", type=Path)
    parser.add_argument("--pair-file", type=Path)
    args = parser.parse_args()
    if not 1024 <= args.api_port <= 65535:
        parser.error("API port must be between 1024 and 65535.")
    if args.pair_file:
        if args.quiz_file or args.flashcard_file:
            parser.error("Use a paired fixture or two individual fixtures, not both.")
        inputs = [args.pair_file]
    else:
        if not args.quiz_file or not args.flashcard_file:
            parser.error("Supply --pair-file or both --quiz-file and --flashcard-file.")
        inputs = [args.quiz_file, args.flashcard_file]
    # Explicit small fixtures only; refuse the routine corpus and ignored exports.
    sources = [path.resolve() for path in inputs]
    fixture_roots = [
        (ROOT / name).resolve() for name in ("tests/fixtures",)
    ]
    if any(
        not any(path.is_relative_to(root) for root in fixture_roots) for path in sources
    ):
        parser.error("Browser seed inputs must be explicit repository test fixtures.")
    if args.pair_file:
        pair = {"base": json.loads(sources[0].read_text())["base"]}
    else:
        pair = {
            "base": dict(
                zip(
                    ("quizzes", "flashcards"),
                    [json.loads(p.read_text()) for p in sources],
                    strict=True,
                )
            )
        }
    name = "meducation-browser-" + uuid.uuid4().hex[:12]
    child = None
    attempted = False
    signal.signal(signal.SIGTERM, stop)
    try:
        with tempfile.TemporaryDirectory(prefix=name) as directory:
            folder = Path(directory)
            (folder / "origin.txt").write_text(args.origin)
            (folder / "pair.json").write_text(json.dumps(pair))
            attempted = True
            password, port = start_postgres(
                name,
                "meducation_test_browser",
                folder,
                "--label",
                LABEL + "=" + name,
                "--publish",
                "127.0.0.1::5432",
                "--tmpfs",
                "/var/lib/postgresql/data:rw,size=512m",
            )
            fixture_env = {
                k: v for k, v in os.environ.items() if not k.startswith("MEDUCATION_")
            }
            fixture_env.update(
                {
                    "FIXTURE_DATABASE_URL": URL.create(
                        "postgresql+psycopg",
                        username="meducation_bootstrap",
                        password=password,
                        host="127.0.0.1",
                        port=port,
                        database="meducation_test_browser",
                        query={"sslmode": "disable"},
                    ).render_as_string(hide_password=False),
                    "MEDUCATION_FIXTURE_DIRECTORY": str(folder),
                    "MEDUCATION_FIXTURE_PORT": str(args.api_port),
                }
            )
            fixture_env.update(role_password_env())
            child = subprocess.Popen(
                [
                    sys.executable,
                    str(ROOT / "scripts/testing/editor_http.py"),
                ],
                cwd=ROOT,
                env=fixture_env,
            )
            result = child.wait()
            if result:
                raise RuntimeError(
                    "Disposable PostgreSQL browser API failed; there is no JSON fallback."
                )
    finally:
        if child is not None and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
        if attempted:
            for identifier in docker(
                "ps", "--all", "--quiet", "--filter", "label=" + LABEL + "=" + name
            ).splitlines():
                owned = json.loads(docker("inspect", identifier))[0]
                if (
                    owned["Name"] != "/" + name
                    or owned["Config"]["Labels"].get(LABEL) != name
                ):
                    raise RuntimeError("Refusing to remove an unowned browser fixture.")
                docker("rm", "--force", identifier)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass

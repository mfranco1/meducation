"""Explicit owner/operator jobs with separate private credentials; never used by API."""

import os
import sys
from pathlib import Path

from dotenv import dotenv_values
from meducation_api.db.cli import main

ROOT = Path(__file__).resolve().parents[2]

if __name__ == "__main__":
    config = ROOT / "var/local-authority/operator.env"
    if not config.exists():
        raise SystemExit("Initialize the designated local authority first.")
    os.environ.update({k: v for k, v in dotenv_values(config).items() if v is not None})
    if {"publish-draft", "draft-outline", "stage-quizzes"} & set(sys.argv):  # the editor's own connection
        editor = dotenv_values(ROOT / "var/local-authority/runtime.env").get("MEDUCATION_ADMIN_EDITOR_DATABASE_URL")
        if editor:
            os.environ["MEDUCATION_ADMIN_EDITOR_DATABASE_URL"] = editor
    main()

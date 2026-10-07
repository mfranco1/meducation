# Meducation content API

The FastAPI service reads `src/content/questionBank.generated.json` as the
canonical schema-v4 quiz bank and `src/content/flashcardBank.generated.json` as
the canonical flashcard bank. Flashcard decks reference the quiz bank's shared
subjects directly. It serves read-only content; attempts, checkpoints, and scoring remain
in the browser.

From the repository root, create the isolated environment if it does not exist:

```sh
python3.14 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.lock
.venv/bin/python -m pip install --no-deps -e backend
.venv/bin/python -m uvicorn meducation_api.main:app --reload --host 127.0.0.1 --port 8000
```

For configuration overrides, copy `backend/.env.example` to `backend/.env` and
edit it there. The default bank path already points to the canonical repository
file. `MEDUCATION_FLASHCARD_BANK_PATH` overrides the flashcard file path.

Run the frontend separately using [frontend setup](../README.md#install-and-run).
Production API-mode hosting must route `/api` to FastAPI. Set
`MEDUCATION_BANK_PATH` only when the canonical file is stored at a different
path. The frontend guide also owns [local-content mode](../README.md#local-content-mode)
and [local editor setup](../README.md#local-content-editor).

On startup the service validates and indexes both banks together, including
flashcard references to shared subjects. The flashcard API exposes subject
inventory, a selected subject's deck summaries, and one deck's
ordered cards under `/api/v1/flashcards`. Flashcard responses use a separate
revision that also changes when shared subject records change. Restart the
service after replacing either canonical file. The API never writes or modifies
bank content.
Interactive API documentation is available at `/docs` in development.

On Windows, activate `.venv\Scripts\Activate.ps1` and use `python -m pip ...`
and `python -m uvicorn ...` from the repository root.

Python installation may generate `backend/src/meducation_api.egg-info/` metadata.
It is ignored build output and should not be committed. The package source,
`pyproject.toml`, and requirements locks are tracked; installing the package
regenerates its metadata.

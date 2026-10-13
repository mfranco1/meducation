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

## JSON API container

From the repository root, build the production API image:

```sh
docker build --pull -f backend/Dockerfile -t meducation-api:l2-step2 .
```

The multi-stage image installs a non-editable wheel and the locked runtime
dependencies under pinned Python 3.14.8. It includes byte-identical copies of
both canonical banks at `/app/content/` with explicit path settings, runs as
UID/GID 10001, and has a bounded `/health/ready` healthcheck. The builder's
tools, host `.env` files and private source material are excluded from runtime.
See [build inputs and maintenance](../ops/containers/README.md) for image pins,
context rules and lock updates.

Run an isolated local API on loopback port 8800:

```sh
docker run --rm --name meducation-api-local --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --publish 127.0.0.1:8800:8000 meducation-api:l2-step2
```

Inspect `/health/live` and `/health/ready` at `http://127.0.0.1:8800`, and stop
with Ctrl+C or `docker stop --time 15 meducation-api-local`. The process uses
one Uvicorn worker without reload. Local CORS defaults allow only
`http://127.0.0.1:4173` and `http://localhost:4173`; override
`MEDUCATION_ALLOWED_ORIGINS` explicitly when needed. This standalone port does
not change the existing Vite proxy to port 8000. L2's later frontend/Compose
steps provide the same-origin reverse proxy and optional Postgres service.

Exercise the actual image with the repeatable API smoke command:

```sh
.venv/bin/python scripts/containers/smoke-api.py --image meducation-api:l2-step2
```

The smoke uses unique disposable containers and an automatically allocated
loopback port. It checks canonical file hashes and representative API content,
locked dependencies, non-root/read-only execution, health, cache/conflict/error
responses, explicit CORS and graceful shutdown. Synthetic invalid-bank mounts
exercise startup rejection without changing canonical files. It removes only
its own containers and requires no database or host source mount for successful
startup. Add `--report /absolute/path/report.json` to retain machine evidence.

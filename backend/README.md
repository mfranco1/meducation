# Meducation API

FastAPI service that publishes the active paired quiz/flashcard release from PostgreSQL, hosts the authenticated editor services under `/api/admin`, and ships the `meducation-db` job CLI. It reads only PostgreSQL; workers never migrate or import. Learner progress is not stored here.

## Setup

From the repository root:

```sh
python3.14 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.lock
.venv/bin/python -m pip install --no-deps -e backend
npm run build:content-policy
```

Copy `backend/.env.example` to ignored `backend/.env`. Set a reader-role `MEDUCATION_DATABASE_URL` (and `MEDUCATION_DATABASE_ENVIRONMENT=local` for non-TLS loopback use) for an initialized PostgreSQL 17 schema with an active publication. The API refuses to start without them.

```sh
.venv/bin/python -m uvicorn meducation_api.main:app --reload --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Interactive docs are at `/docs` in development. On Windows use `.venv\Scripts\Activate.ps1`. Start the frontend as described in the [root README](../README.md).

Database setup, jobs (`bootstrap-local`, `upgrade`, import, activate, export, recovery), roles, editor login, backups and containers are in [docs/operations.md](../docs/operations.md).

## Locks

Regenerate intentionally with Python 3.14:

```sh
.venv/bin/pip-compile --output-file=backend/requirements.lock backend/pyproject.toml
.venv/bin/pip-compile --extra=dev --output-file=backend/requirements-dev.lock backend/pyproject.toml
```

## Tests

```sh
.venv/bin/ruff check backend/src backend/tests
.venv/bin/mypy backend/src
.venv/bin/python -m pytest backend/tests -q
.venv/bin/python scripts/containers/test-postgres-content.py   # real PostgreSQL 17 cases in a disposable container
```

Pytest skips the PostgreSQL cases unless an isolated test database is provided; run the script above for that gate. More in [docs/testing.md](../docs/testing.md).

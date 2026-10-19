# Meducation API

FastAPI service that publishes the active paired quiz/flashcard release from PostgreSQL, hosts the authenticated editor services under `/api/admin`, and ships the `meducation-db` job CLI. It reads only PostgreSQL; workers never migrate. Learner progress is not stored here.

Setup, configuration, running and database jobs are in [docs/operations.md](../docs/operations.md); checks are in [docs/testing.md](../docs/testing.md). Interactive API docs are at `/docs` in development.

## Locks

Regenerate intentionally with Python 3.14:

```sh
.venv/bin/pip-compile --output-file=backend/requirements.lock backend/pyproject.toml
.venv/bin/pip-compile --extra=dev --output-file=backend/requirements-dev.lock backend/pyproject.toml
```

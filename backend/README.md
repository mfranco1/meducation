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

## L3 database toolchain and explicit jobs

The database toolchain and content schema are available. File import/export and
learner adapters remain later L3 steps. Keep `MEDUCATION_CONTENT_SOURCE=json` for the
working learner API. Explicit `postgres` mode currently refuses startup; it never
falls back to JSON or automatically migrates/imports content.

Install the updated development lock using the setup commands above. Python 3.14
uses locked Psycopg binary 3.3.6, SQLAlchemy 2.1.4 and Alembic 1.20.0. Regenerate
the locks intentionally with Python 3.14 and pip-tools, retaining existing pins:

```sh
.venv/bin/pip-compile --output-file=backend/requirements.lock backend/pyproject.toml
.venv/bin/pip-compile --extra=dev --output-file=backend/requirements-dev.lock backend/pyproject.toml
```

An explicit local bootstrap job creates/reconciles only the `meducation_*` roles,
owns schema `content` with the NOLOGIN owner, restricts PUBLIC schema/database
permissions, and grants backup access to future owner-created content objects.
It also updates the four login passwords from the configured values. It refuses
unexpected role memberships/schema ownership rather than taking over other data.
Run it only against the intended local development database. Public learner
reader access is granted to selected finalized-release views by migration `0001_content`; reader
and operator roles receive no blanket table/write/function access at bootstrap.

Start local PG17 using the [container runbook](../docs/local-containers.md), with
the optional loopback port override for host-based jobs. Configure the commented
examples in ignored `backend/.env`: explicit local DB environment, bootstrap
connection, and four distinct passwords of at least 16 characters. Encode URL
passwords; keep them out of command arguments and logs. Bootstrap credentials are
never passed to the API. Jobs do not substitute runtime credentials for missing
migration credentials.

```sh
.venv/bin/meducation-db bootstrap-local
.venv/bin/meducation-db head
.venv/bin/meducation-db upgrade
```

`head` reports `0001_content`; `upgrade` applies the packaged transactional content
schema and is safe to repeat. The installed package contains Alembic revisions
and SQL resources under `meducation_api/migrations`, so the same explicit job
runs from the API wheel/image without a source checkout. It creates an empty
draft and unpublished pointer; it does not import authored content. Destructive
downgrade is refused. Use a disposable database for schema experiments and a
compatible app/schema or separate-database restoration for recovery.

`db/operations.py` provides private bound transaction calls for paired release
storage/finalization, activation, draft save/reset and independently committed ID
reservations. Configure the separate `meducation_operator` URL only for operator
jobs; never pass it to the learner API. Operational roles cannot write tables
directly. These are primitives, not file-import commands or an admin gateway.
See the [schema decision](../docs/decisions/0005-paired-content-releases-and-postgres-schema.md)
for replay, actor, allocation and privileged-maintenance boundaries.

Normal pytest skips the 58 real-Postgres cases without an explicitly isolated
test target. Run `.venv/bin/python scripts/containers/test-postgres-content.py`
from the root to create a unique tmpfs PG17 test container, bootstrap/migrate and
exercise those cases. It cleans up its container and never uses the routine DB.

Runtime uses only `meducation_reader` and one SQLAlchemy pool of size 2 with no
overflow. Operator jobs use direct, unpooled connections; migrations SET ROLE to
the NOLOGIN owner inside a transaction. Hosted configuration requires explicit
`sslmode=verify-full` and forces `gssencmode=disable`; local non-TLS configuration requires a loopback or the
Compose `postgres` hostname and `MEDUCATION_DATABASE_ENVIRONMENT=local`.
One-time schema/head/active-release checks dispose connections on startup failure;
recurring health routes do not query Postgres. Successful DB learner startup is
pending explicit paired file import/activation and learner adapters.

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
not change the existing Vite proxy to port 8000. The [container stack](../docs/local-containers.md) provides the same-origin
reverse proxy and an independent optional Postgres service with PG17 recovery
tools. Application schema/roles/DB reads remain L3 work.

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

# Operations

How to run, back up, restore and package the local system. PostgreSQL is the only writable content authority and the only runtime content source. Learner progress stays in the browser.

Hosted deployment is being prepared. It will use managed Postgres and managed identity; nothing here describes a hosted setup, and the synthetic local identity below is never enabled in production.

## Prerequisites

- Node 22 and npm; Python 3.14; Docker (PostgreSQL 17 runs in a container).
- Frontend: `npm ci`. Backend (repository root):

```sh
python3.14 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.lock
.venv/bin/python -m pip install --no-deps -e backend
npm run build:content-policy   # packages the shared authoring policy into the wheel resources
```

## Configuration

Frontend build-time settings are in `.env.example` (`VITE_CONTENT_MAX_RETRIES`, `VITE_CONTENT_RETRY_BASE_DELAY_MS`, `VITE_CONTENT_RETRY_MAX_DELAY_MS`, `VITE_BUILD_ADMIN`, `VITE_CONTENT_IMAGE_ORIGINS`). `VITE_*` values are public; never put secrets in them.

Backend settings use the `MEDUCATION_` prefix; copy `backend/.env.example` to ignored `backend/.env`.

| Setting | Purpose |
| --- | --- |
| `MEDUCATION_DATABASE_ENVIRONMENT` | `production` (default, verified TLS required) or `local` (loopback/Compose non-TLS) |
| `MEDUCATION_DATABASE_URL` | API reader (`meducation_reader`); required to start the API |
| `MEDUCATION_MIGRATION_DATABASE_URL` | jobs: `meducation_migrator` (upgrade, restore-permissions, ID sequences) |
| `MEDUCATION_OPERATOR_DATABASE_URL` | jobs: `meducation_operator` (activate, export) |
| `MEDUCATION_BOOTSTRAP_DATABASE_URL` | local role bootstrap only |
| `MEDUCATION_POSTGRES_{MIGRATOR,READER,BACKUP,OPERATOR}_PASSWORD` | distinct role passwords, 16+ characters |
| `MEDUCATION_POSTGRES_{SESSION,EDITOR}_PASSWORD` | optional pair that enables the editor roles |
| `MEDUCATION_ALLOWED_ORIGINS` | CORS origins for public reads |
| `MEDUCATION_ADMIN_*` | editor identity and session configuration (below) |

Rules: URLs use `postgresql+psycopg://` with URL-encoded passwords. API workers receive only the reader URL (plus session/editor URLs when admin is enabled); job credentials are never given to workers, and a job never substitutes runtime credentials. Roles: `meducation_owner` (NOLOGIN DDL owner), `meducation_migrator`, `meducation_operator`, `meducation_reader`, `meducation_backup`, `meducation_session`, `meducation_editor`, `meducation_bootstrap` (local only). Changing a password in an env file does not rotate an existing role.

## Local PostgreSQL and the API

Compose project `meducation-local` provides an independent PostgreSQL preview; the `db` profile starts `postgres`.

```sh
cp ops/containers/.env.example ops/containers/.env   # set MEDUCATION_POSTGRES_BOOTSTRAP_PASSWORD; add reader/migrator URLs
docker compose --env-file ops/containers/.env -f compose.yaml -f ops/containers/compose.postgres.yaml \
  -f ops/containers/compose.db-port.yaml --profile db up -d postgres   # db-port override publishes 127.0.0.1:5433
```

Initialize with explicit jobs (they never run at API startup), using `backend/.env` for credentials:

```sh
.venv/bin/meducation-db bootstrap-local   # roles and schemas; local environment only
.venv/bin/meducation-db upgrade           # packaged migrations; safe to repeat
.venv/bin/meducation-db head              # packaged schema head
```

Start the services:

```sh
.venv/bin/python -m uvicorn meducation_api.main:app --reload --host 127.0.0.1 --port 8000 --no-proxy-headers
npm run dev                                # learner at http://localhost:5173, /api proxied to port 8000
```

A new database has no content; restore an authority dump (below) before starting the API. The API fails startup without a reader URL, initialized schema and an active publication. Health: `/health/live`, `/health/ready` (initialization only; neither queries Postgres after startup).

## Database CLI (`meducation-db`)

Entry point `meducation_api.db.cli`; also runs as `python -m meducation_api.db.cli`.

- Schema and roles: `bootstrap-local`, `head`, `upgrade`, `restore-permissions`, `invalidate-restored-sessions`.
- Releases: `publish-draft --actor` publishes the draft exactly as the editor's **Publish** does, using the editor connection (`MEDUCATION_ADMIN_EDITOR_DATABASE_URL`); it needs no running API. Locally: `.venv/bin/python scripts/local-authoring/job.py publish-draft --actor maintainer:<reason>`. `activate --release-id --expected-sequence --operation-id --actor --reason`; `export-release --release-id --output NEW_DIR` (refuses existing directories).
- Draft IDs: `advance-id-sequences --by N` moves the subject, topic, quiz and question ID sequences N past the largest ID in any release or the draft (migrator credentials). Run it after restoring an older backup.
- Export checks: `validate-export` and `audit-export` take `--directory`, `--repository`, `--report`. They verify captured bytes, hashes and policy and refuse to overwrite reports. Digests prove internal consistency, not live currency; export fresh from the target when currency matters. `npm run validate:content -- <quiz-file> <flashcard-file>` checks an explicitly selected pair the same way.

There is no file import: a new database receives its content from a `pg_restore` of an authority dump (see Backup and restore), and ordinary changes go through the editor. An export is never a way to replace database-only work with an older snapshot.

## Local authority (maintainer machine)

The designated authority is database `meducation_authority` in container `meducation-authority-postgres` (volume `meducation-authority-data`, PostgreSQL 17, loopback port 5433), separate from the Compose preview. Do not remove the volume. Private credentials live in ignored `var/local-authority/` (`runtime.env` for the API, `operator.env` for jobs and backup; mode 0600 in a 0700 directory). Database dumps do not contain these files or the auth keys; retain them separately.

```sh
docker start meducation-authority-postgres
.venv/bin/python scripts/local-authoring/serve.py            # API on 127.0.0.1:8001 with local development identity
MEDUCATION_API_PORT=8001 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/admin.html`. `.venv/bin/python scripts/local-authoring/job.py <meducation-db action>` runs CLI jobs with the operator credentials.

## Editor login and sessions

- `/admin.html` is built only with `npm run build:admin` (or `VITE_BUILD_ADMIN=true`) and served in development. Build flags and static assets grant no access; the API authorizes every `/api/admin` request.
- Authentication is an OIDC authorization-code flow with S256 PKCE, handled by the backend (Authlib, joserfc). Sessions are opaque, stored hashed in the `admin_auth` schema, expire after 30 idle minutes or 8 absolute hours, and require a factor within 15 minutes for publish, discard, activate and export. Writes need exact Origin and a session CSRF header and are never replayed after reauthentication.
- Only a synthetic loopback issuer exists. `serve.py` provides it: sign in, then confirm "Continue as local editor (development only)". It simulates identity and fresh-factor assurance, provides no real MFA, and binds only `127.0.0.1`. Never expose it through a tunnel. Production configuration with admin enabled refuses to start.
- Settings (`MEDUCATION_ADMIN_*`): `ENABLED` (default false), `ENVIRONMENT`, `ADAPTER`, `ORIGIN`, `ISSUER`, `AUTHORIZATION_ENDPOINT`, `TOKEN_ENDPOINT`, `JWKS_URI`, `CLIENT_ID`, `CLIENT_SECRET`, `EDITOR_SUBJECT` (exact issuer subject), `EPOCH` (external revocation generation), `ENCRYPTION_KEY` (Fernet), `SESSION_DATABASE_URL`, `EDITOR_DATABASE_URL`. Changing the allowlist or epoch invalidates all sessions; `SessionStore.revoke_all()` and disabling admin are the emergency controls.
- Explicit diagnostics: signed-in `POST /api/admin/diagnostics` with `{}` and the CSRF token returns bounded reader/schema/publication/session/editor status without URLs, SQL or content.

## Authoring and publication

- The editor reads and writes individual draft records ([record API](content-management.md#record-api-and-publication)). Each write is validated, versioned and logged in `content.draft_changes`; it never publishes. New subject, topic, quiz and question IDs come from sequences (`content.draft_subject_ids`, `draft_topic_ids`, `draft_quiz_ids`, `draft_question_ids`); decks and cards use `d-`/`f-` plus a UUID.
- **Publish** validates the full pair, stores an immutable release through `content.store_release`, activates it and records the published change ID, in one transaction. **Discard** resets the draft to the active release. Retained releases at the current content schema can be activated again; activation keeps the draft. Releases from an earlier content schema stay as history: they cannot be activated, loaded into the draft or exported. The API does not start until a release at the current schema is active, so after a schema upgrade publish with `publish-draft` (below), then start the API.
- **Export paired ZIP** exports the draft or a retained release (deterministic, 128 MiB cap). It is not a backup.

## Backup and restore

```sh
.venv/bin/python scripts/local-authoring/backup.py         # new 0600 full dump + checksum sidecar in var/backups/postgres/
.venv/bin/python scripts/local-authoring/verify-backup.py  # offline restore rehearsal into a disposable database
```

`backup.py` dumps `content` and `admin_auth` as PG17 custom format, validates the table of contents and never replaces earlier archives. Run it after meaningful authoring sessions and at least daily while editing. Copies live outside the Docker volume but on this machine only; they do not survive loss of the host. `runtime.env` and `operator.env` are not in the dump.

`verify-backup.py` requires writer access to be retired first, restores into a `meducation_verify_*` database, checks tables, sequences, grants and exports, quarantines sessions, advances the ID sequences, and removes only its own database. It never touches the authority.

Real recovery:

1. Stop writers; retire writer CONNECT and drain connections. Keep the damaged database.
2. Restore the dump into a fresh empty database from `template0` with matching PG17 tools (`pg_restore --single-transaction --exit-on-error --no-owner --no-acl`), after bootstrapping roles. A fresh hosted database is initialized the same way from a dump of the authority.
3. Point job credentials at the target and run `restore-permissions`, then `invalidate-restored-sessions` (revokes sessions and clears login transactions).
4. Rotate `MEDUCATION_ADMIN_EPOCH`. Run `advance-id-sequences --by N` with N larger than the number of records that could have been created after the backup (for example 10000), so IDs learners may have seen are not reused.
5. Compare content, then switch reader/session/editor connections together, restart workers and verify learner reads and a fresh editor login. Keep the original until verified.

Development dump and restore use plain Postgres tools in the Compose container (add the same `--env-file` and `-f` flags as the start command):

```sh
docker compose --profile db exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --host 127.0.0.1 --username "$POSTGRES_USER" --format=custom "$POSTGRES_DB"' > meducation.dump
docker compose --profile db exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --host 127.0.0.1 --username "$POSTGRES_USER" --dbname postgres -c "CREATE DATABASE meducation_verify"'
docker compose --profile db exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --host 127.0.0.1 --username "$POSTGRES_USER" --dbname meducation_verify --no-owner --no-acl --exit-on-error' < meducation.dump
```

Restore into a fresh database, never over the original. This is not a production backup design.

Learner progress backups are separate and browser-local ([product](product.md#progress-backup-restore-and-reset)). Private source material (`tn-pdfs/`, `content/`) is ignored by Git and needs its own backup.

## Containers

```sh
docker compose build api frontend
docker build --target admin -t meducation-admin:local .      # optional packaged editor assets
docker compose --env-file ops/containers/.env -f compose.yaml -f ops/containers/compose.postgres.yaml \
  --profile db up -d api frontend                            # learner at http://127.0.0.1:4173
```

- Images: API (installed wheel, user 10001, one Uvicorn process, no content corpus), learner and admin (non-root Nginx 101 on port 8080, read-only filesystem). The default `learner` target returns 404 for `/admin.html`; `admin` serves it `no-store`. Admin assets still need an authenticated API.
- Base images are pinned by tag and index digest in `backend/Dockerfile` and `Dockerfile` (Python 3.14, Postgres 17, Node 22, Nginx unprivileged). Update tag and digest together and rebuild. Never change the Postgres major over an existing volume. Python build tooling is hash-pinned in `backend/requirements-build.lock`.
- Nginx (`ops/containers/nginx.conf`, `proxy.conf`) proxies `/api` to `api:8000`, keeps API paths out of the SPA fallback, caps public bodies at 1 MiB and private authoring at 64 MiB (the API itself limits draft bodies to 1 MiB, 16 MiB for bulk), and logs only fixed route families. Private responses are `no-store`.
- Runtime pools: reader, session and editor each at most two connections; migrations and jobs use direct unpooled connections.
- Container smoke: `npm run test:containers` (`scripts/containers/smoke.py`) builds the API and learner images, starts an isolated Compose project with a disposable Postgres seeded from the synthetic `e2e/fixtures` banks, checks the learner page, `/api/v1/subjects` through Nginx, the health routes and the 404 for `/admin.html`, then removes the project and volume. CI runs it on amd64. The learner build fails inside the Dockerfile if it ships admin or content-bank modules (`scripts/containers/check-learner-artifacts.mjs`).

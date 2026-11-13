# Operations

How to run, back up, restore and package the local system. No hosted setup exists yet; the synthetic local identity below is never enabled in production.

## Prerequisites

- Node 24 and npm; Python 3.14; Docker (PostgreSQL 17 runs in a container).
- Frontend: `npm ci`. Backend (repository root):

```sh
python3.14 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.lock
.venv/bin/python -m pip install --no-deps -e backend
npm run build:content-policy   # packages the shared authoring policy into the wheel resources
```

### Dependency notes

- `parse5` is pinned exactly because `markdownValidation.ts` uses it directly. Raise the pin when `hast-util-raw` or `rehype-raw` needs a newer one.
- `src/shared/ui/content/katex.css` is KaTeX's minified CSS reduced to woff2 font sources. Regenerate it on every KaTeX upgrade.
- Both tsconfigs set `"types": ["node"]`. Add a package there only when code needs its globals.
- Vite config imports use explicit `.ts` extensions.
- MUI no longer has system props. Put style props in `sx`. `Typography` still accepts a `color` prop, but only palette names such as `textSecondary`; a dotted value like `text.secondary` typechecks and is ignored.

## Configuration

Frontend build-time settings are listed in `.env.example`. `VITE_*` values are public; never put secrets in them. Backend settings use the `MEDUCATION_` prefix and are listed in `backend/.env.example`; copy it to ignored `backend/.env`.

- `MEDUCATION_DATABASE_ENVIRONMENT` is `production` by default (verified TLS required); `local` permits loopback and Compose connections without TLS.
- Each connection has its own role: `MEDUCATION_DATABASE_URL` (reader, required to start the API), `MEDUCATION_MIGRATION_DATABASE_URL` (migrator jobs), `MEDUCATION_OPERATOR_DATABASE_URL` (activate, export), `MEDUCATION_BOOTSTRAP_DATABASE_URL` (local role bootstrap only), and the admin session and editor URLs.
- URLs use `postgresql+psycopg://` with URL-encoded passwords; hosted URLs require `sslmode=verify-full`.
- API workers receive only the reader URL (plus session and editor URLs when admin is enabled). Job credentials are never given to workers, and a job never substitutes runtime credentials.
- Changing a password in an env file does not rotate an existing role. Passwords live in ignored env files and are never passed on command lines.

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

A new database has no content; restore an authority dump (below) before starting the API. The API fails startup without a reader URL, initialized schema and an active publication. Health: `/health/live`, `/health/ready`.

## Database CLI (`meducation-db`)

Entry point `meducation_api.db.cli`. Run `meducation-db <command> --help` for flags.

- Schema and roles: `bootstrap-local`, `head`, `upgrade`, `restore-permissions`, `invalidate-restored-sessions`.
- Releases: `publish-draft` publishes the draft exactly as the editor's **Publish** does, over the editor connection, with no running API. `activate` switches to a retained release. `export-release` writes one to a new directory.
- Staging: `draft-outline` (read-only), `stage-quizzes` and `split-quiz` serve the [write-quizzes skill](../.agents/skills/write-quizzes/SKILL.md). They use the editor connection and never publish.
- `advance-id-sequences --by N` moves the ID sequences N past the largest ID in any release or the draft. Run it after restoring an older backup.
- `validate-export` and `audit-export` verify an export's bytes, hashes and policy. Digests prove internal consistency, not live currency; export fresh from the target when currency matters.

Jobs use direct unpooled connections. A managed Postgres pooler (transaction pooling) may serve runtime connections only after testing session settings and prepared statements.

There is no file import: a new database receives its content from a `pg_restore` of an authority dump (see Backup and restore), and ordinary changes go through the editor.

## Local authority (maintainer machine)

The designated authority is database `meducation_authority` in container `meducation-authority-postgres` (volume `meducation-authority-data`, PostgreSQL 17, loopback port 5433), separate from the Compose preview. Do not remove the volume. Private credentials live in ignored `var/local-authority/` (`runtime.env` for the API, `operator.env` for jobs and backup). Database dumps do not contain these files or the auth keys; retain them separately.

```sh
docker start meducation-authority-postgres
.venv/bin/python scripts/local-authoring/serve.py            # API on 127.0.0.1:8001 with local development identity
MEDUCATION_API_PORT=8001 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/admin.html`. `.venv/bin/python scripts/local-authoring/job.py <meducation-db action>` runs CLI jobs with the operator credentials, for example `job.py publish-draft --actor maintainer:<reason>`.

## Editor login and sessions

- `/admin.html` is built only with `npm run build:admin` and served in development. The API authorizes every `/api/admin` request.
- Authentication is an OIDC authorization-code flow with PKCE, handled by the backend. Sessions are opaque and stored hashed in the `admin_auth` schema, with idle and absolute expiry. Publish, discard, activate and export need a recent factor.
- Only a synthetic loopback issuer exists. `serve.py` provides it: sign in, then confirm "Continue as local editor (development only)". It provides no real MFA and binds only `127.0.0.1`. Never expose it through a tunnel. Production configuration with admin enabled refuses to start.
- Settings are the `MEDUCATION_ADMIN_*` values in `backend/.env.example`. Changing the editor subject or `MEDUCATION_ADMIN_EPOCH` invalidates all sessions. `meducation-db invalidate-restored-sessions` and disabling admin are the emergency controls.

## Backup and restore

```sh
.venv/bin/python scripts/local-authoring/backup.py   # new 0600 full dump + checksum sidecar in var/backups/postgres/
```

`backup.py` dumps `content` and `admin_auth` as PG17 custom format and never replaces earlier archives. Run it after meaningful authoring sessions and at least daily while editing. Copies live outside the Docker volume but on this machine only; they do not survive loss of the host.

Real recovery:

1. Stop writers; retire writer CONNECT and drain connections. Keep the damaged database.
2. Restore the dump into a fresh empty database from `template0` with matching PG17 tools (`pg_restore --single-transaction --exit-on-error --no-owner --no-acl`), after bootstrapping roles. A fresh hosted database is initialized the same way from a dump of the authority.
3. Point job credentials at the target and run `restore-permissions`, then `invalidate-restored-sessions`.
4. Rotate `MEDUCATION_ADMIN_EPOCH`. Run `advance-id-sequences --by N` with N larger than the number of records that could have been created after the backup (for example 10000), so IDs learners may have seen are not reused.
5. Compare content, then switch reader, session and editor connections together, restart workers and verify learner reads and a fresh editor login. Keep the original until verified.

Host Postgres clients may be older than 17; run `psql`, `pg_dump` and `pg_restore` from the pinned PG17 container.

Learner progress backups are separate and browser-local ([product](product.md#progress-backup-restore-and-reset)). Private source material (`tn-pdfs/`, `content/`) is ignored by Git and needs its own backup.

## Containers

```sh
docker compose build api frontend
docker build --target admin -t meducation-admin:local .      # optional packaged editor assets
docker compose --env-file ops/containers/.env -f compose.yaml -f ops/containers/compose.postgres.yaml \
  --profile db up -d api frontend                            # learner at http://127.0.0.1:4173
```

- Images run as non-root. The default `learner` target returns 404 for `/admin.html`; the `admin` target serves it. Admin assets still need an authenticated API.
- Base images are pinned by tag and digest in `backend/Dockerfile` and `Dockerfile`. Update tag and digest together and rebuild. Never change the Postgres major over an existing volume.
- Nginx (`ops/containers/nginx.conf`, `proxy.conf`) proxies `/api` to the API and keeps API paths out of the SPA fallback.
- The learner build fails inside the Dockerfile if it ships admin or content-bank modules. CI builds the learner image and checks the `/admin.html` 404 and security headers ([testing](testing.md)).

## Logs and alerts

Everything logs to stdout as one JSON object per line with a `level` (`info` or `error`): `request_complete`, `app_started` and `startup_failed` from the API (`observability.py`) and `proxy_request` from Nginx for failed requests. Logs never contain request data, exception messages, SQL or local variables. To trace a learner report, search the logs for the reference ID shown on the error (the first 8 characters of `request_id`).

On the host, set `MEDUCATION_RELEASE` to the commit SHA, add an uptime check on `/health/ready`, alert on `level=error` events and keep 7 to 14 days of logs.

## Production security

The learner image sets security headers on every static response (`ops/containers/security-headers.conf`). If `VITE_CONTENT_IMAGE_ORIGINS` is set, add the same origins to `img-src`. The API serves `/openapi.json`, `/docs` and `/redoc` only in local mode.

Before a hosted launch, confirm on the platform:

- HTTPS only, with HTTP redirected and `Strict-Transport-Security` set at the TLS terminator.
- One origin serves the site and `/api`. Only the frontend is public; the API is reachable only through it. `MEDUCATION_ALLOWED_ORIGINS` is that origin.
- Per-IP rate limiting or the platform's edge protection is on for the public origin.
- The API runtime has only the reader URL (`sslmode=verify-full`). Admin stays disabled (`MEDUCATION_ADMIN_ENABLED` unset). Migrator, operator and bootstrap credentials are used by jobs only.
- Secrets live in the platform secret store, never in images or the repository.
- Point-in-time recovery and budget alerts are on for the managed database.
- If the repository is private, GitHub Actions has a budget (Settings, Billing). The Free plan includes 2,000 Linux minutes a month; a typical CI run uses about 15.
- Dependencies and base images are current: `npm audit --omit=dev`, `pip-audit -r backend/requirements.lock`, and the latest patch tags for the pinned images.

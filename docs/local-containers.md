# Local production containers

L2 supplies the existing JSON API, production learner/static-server image and
Compose stack with optional local PostgreSQL. Database backup/restore tools follow in the
[implementation tracker](work/ongoing/L2-containers-local-services-plan.md).
Host-based Vite remains the routine UI development path.

## Build

A reachable Docker engine is required. From a fresh checkout at the repository root:

```sh
docker build --pull -f backend/Dockerfile -t meducation-api:l2-step2 .
docker build --pull -t meducation-learner:l2-step3 .
```

For the Compose stack, build its local image tags instead:

```sh
docker compose build --pull api frontend
```

Both Dockerfiles pin multi-platform base indexes; native architecture selection
works without an AMD64 override on Apple Silicon. See [build-input pins and
maintenance](../ops/containers/README.md). The learner uses `npm ci`, typechecks,
and builds API mode with both admin flags disabled. Host `.env` files are excluded.
Its default automatic retry policy is retained. Hidden source maps and a Vite
manifest let the build audit emitted modules; these files are removed before
runtime. The audit record stays outside the public document root.

## Compose startup and optional database

The default project is `meducation-local`. JSON-only operation requires no DB
credentials and starts only the API and learner:

```sh
docker compose up --detach
.venv/bin/python scripts/containers/wait-compose.py api frontend
```

Open `http://127.0.0.1:4173/`. The API has no published host port; only the
frontend binds loopback. To choose another frontend port, set
`MEDUCATION_FRONTEND_PORT` in an ignored env file or the shell. The readiness
command is read-only, has a 90-second deadline and supports `--timeout` and
`--project` for explicit alternatives. It fails visibly on exited/unhealthy
containers or expired deadlines. Frontend creation waits for API health;
Postgres is independent of both app services.

To enable local Postgres, create development-only configuration:

```sh
cp ops/containers/.env.example ops/containers/.env
chmod 600 ops/containers/.env
```

Edit the password placeholder in that file, then start and verify the profile:

```sh
docker compose --env-file ops/containers/.env --profile db config --quiet
docker compose --env-file ops/containers/.env --profile db up --detach
.venv/bin/python scripts/containers/wait-compose.py api frontend postgres
```

Use the same `--env-file` for subsequent Compose operations on that stack.
Do not print resolved `config` or `config --environment`: these contain the
password. `config --quiet` validates syntax; password presence is enforced when
Postgres starts, so an inactive profile does not block JSON-only operation.
Missing/empty passwords fail with configuration guidance. The only supplied
login is the disposable development bootstrap user `meducation_bootstrap`,
with database `meducation`; app services receive no DB credentials.

The service pins PostgreSQL 17.11 and mounts the named volume
`meducation-local_postgres-data` at `/var/lib/postgresql/data`. It enables SCRAM
for TCP clients on fresh initialization and exposes no host database port by
default. API content still comes from packaged JSON: this profile supplies an
independent local database, and L3 adds schema, roles, migrations and DB reads.
The `pg_isready` healthcheck establishes startup reachability, not successful
authentication or L3 content/schema readiness. The Compose smoke performs a
separate authenticated TCP SQL check and verifies rejection without a password.

For explicit host database access, add the loopback-only override:

```sh
docker compose --env-file ops/containers/.env --profile db \
  -f compose.yaml -f ops/containers/compose.db-port.yaml up --detach
```

This binds `127.0.0.1:5433:5432`; set `MEDUCATION_POSTGRES_PORT` in the same env
file to change the host port. Include the same override for subsequent commands
when managing that variant. Containers use hostname `postgres`; host clients use
the selected loopback port. Keep PG17 tools for this server; the observed host
PG14 dump tool is unsuitable. Tool wrappers/rehearsal follow in Step 5.

Stop/restart/recreate keep the named data volume:

```sh
docker compose --env-file ops/containers/.env --profile db stop
docker compose --env-file ops/containers/.env --profile db start
.venv/bin/python scripts/containers/wait-compose.py api frontend postgres
docker compose --env-file ops/containers/.env --profile db up --detach --force-recreate
.venv/bin/python scripts/containers/wait-compose.py api frontend postgres
```

For container/network removal while retaining the data volume:

```sh
docker compose --env-file ops/containers/.env --profile db down
```

The official image initializes only an empty volume. Editing env credentials,
init arguments or a later SQL initialization file does not update existing
roles/authentication/schema. Use deliberate operations/migrations; recreation
is not a credential rotation or major-version upgrade. A named volume is not
a backup. Backups will live outside it under ignored `var/backups/postgres/`;
off-volume storage is not automatically off-device storage.

Destructive deletion is a separate explicit operator action. Before removing
`meducation-local_postgres-data`, stop the project, verify its exact
`com.docker.compose.project=meducation-local` and
`com.docker.compose.volume=postgres-data` labels, and verify an off-volume backup
or intentionally discard only disposable development data. Routine commands
never use `down --volumes` or global prune. Step 5 supplies the tested backup/reset
runbook before any content-authority cutover.

## Start a standalone preview

Create this preview network once, then start the two named containers:

```sh
docker network create meducation-preview
docker run --detach --name meducation-api-preview --network meducation-preview \
  --network-alias api --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true meducation-api:l2-step2
docker run --detach --name meducation-learner-preview --network meducation-preview \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  --publish 127.0.0.1:4173:8080 meducation-learner:l2-step3
```

Open `http://127.0.0.1:4173/`. If this port is occupied, choose a different
loopback host port explicitly; the internal frontend/API ports remain 8080/8000.
The API needs no host port, database or source mount. It reads both packaged banks
and fails initialization when either bank is invalid or their subjects disagree.
Replacing content requires a reviewed rebuild/recreation of the API image.

Inspect readiness and logs:

```sh
docker inspect --format '{{.State.Health.Status}}' meducation-api-preview
docker inspect --format '{{.State.Health.Status}}' meducation-learner-preview
docker logs meducation-api-preview
docker logs meducation-learner-preview
```

Container start does not mean readiness. Both images have bounded healthchecks.
The smoke command below waits with deadlines; manual preview users can inspect
these health states and the HTTP routes. `/health/frontend` reports static-server
availability independently of the API. `/health/live` and `/health/ready` forward
to the corresponding API routes. A healthy frontend can therefore still report
an API failure. `/api` and `/api/` preserve the original prefix, query strings,
conditional headers, cache headers, error status and body.

Nginx runs as UID/GID 101. Its writable temporary paths live under `/tmp`;
the document root is read-only. HTML, branding and other stable files revalidate;
hashed `/assets/` files have immutable caching. Missing assets, admin entry and
hidden build files return 404, while extensionless learner routes can use the
learner entry. API errors never use the learner fallback. The proxy uses Docker
DNS and a shared upstream zone to recover after API address changes without
restarting the frontend; its connection/send/read timeouts are bounded. See
[Nginx upstream resolution](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server).

Browser progress belongs to the exact origin. `localhost:5173`,
`127.0.0.1:4173` and another host port have different browser storage. Use the
[local progress backup utility](progress-backup.md) for deliberate transfer.
Stopping/rebuilding these stateless services does not itself move or erase
browser progress.

## Stop and recreate

Stop/start retains the named containers:

```sh
docker stop --time 15 meducation-learner-preview meducation-api-preview
docker start meducation-api-preview meducation-learner-preview
```

For replacement after rebuilding, stop the containers, then remove just these
preview resources and repeat the creation commands:

```sh
docker rm meducation-learner-preview meducation-api-preview
docker network rm meducation-preview
```

No volume deletion, global prune or database reset belongs to this routine.
The database backup/reset rehearsal follows in Step 5.

## Verify the images

After installing host npm dependencies and Chromium as described in
[testing](testing.md), run sequentially:

```sh
.venv/bin/python scripts/containers/smoke-api.py
.venv/bin/python scripts/containers/smoke-learner.py --browser
.venv/bin/python scripts/containers/smoke-compose.py
```

Both scripts use unique disposable containers. The learner smoke also creates a
unique Docker network and an allocated loopback port. It verifies shipped file
hashes, cache/error/health behavior, static availability without the API, changed-IP
DNS recovery and a synthetic upstream 503. Its optional Chromium suite runs the
existing learner workflows against read-only fixture bank mounts through the
actual shipped proxy; the successful canonical API checks use the packaged banks.
The fixtures are not baked into either runtime image. Test resources are removed
on success/failure; the built images remain available.

The dedicated Playwright config starts no Vite or host API. The smoke supplies
`MEDUCATION_CONTAINER_URL`; manual externally started fixture stacks can set it
and run `npm run test:e2e:containers`. Browser output is isolated under
`test-results-containers/`. Add `--report /absolute/path/report.json` to either
Python command to retain a successful machine report. Failures retain browser
traces and cannot produce a passing report.

Build the Compose image tags before its smoke. It creates a unique test project
with temporary credentials and a disposable named volume, verifies both profile
configurations, actual TCP authentication, loopback ports and a sentinel across
Postgres restart/recreation, then drops its synthetic database. Cleanup removes
only its own exact volume after project/volume label verification. It does not
start the developer's default project or touch its database. Add `--report` to
retain successful machine evidence. These tests do not establish DB content
parity, backup/restore or hosted behavior.

Native ARM64 results do not certify native AMD64, real mobile/assistive-technology,
database or hosted behavior. L1's Firefox deferral and other release acceptance
remain in the [browser checklist](work/ongoing/L0-browser-acceptance.md).

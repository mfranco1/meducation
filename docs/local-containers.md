# Local containers

For the designated authority, use [local authoring](local-authoring.md). The
Compose project described here is an independent PostgreSQL preview; it does not
configure, recreate or recover the authority database. PostgreSQL is the only
runtime content source. The images contain no repository quiz/flashcard corpus.

Learner attempts, checkpoints, scores and progress backups remain browser-local.
Content recovery requires retained full database dumps, session quarantine and
protected allocation-journal reconciliation; see [the recovery runbook](L4-authoritative-recovery.md).

## Build

From the repository root with Docker running:

```sh
docker compose build api frontend
docker build --target admin -t meducation-admin:local .
```

The API is an installed wheel running as `10001:10001`; Nginx runs as `101:101`.
Both support read-only filesystems with temporary runtime directories. Learner and
optional admin artifact audits reject bank/test modules and private build metadata.
Admin assets do not grant API authorization. Images retain the ordinary public
read retry policy. Test-only routes and synthetic identity are mounted only into
isolated verification containers.

## Compose startup and database configuration

Copy `ops/containers/.env.example` to ignored `ops/containers/.env`. Configure
separate bootstrap, migrator, reader and operator credentials for an independent
local PostgreSQL 17 target. Never copy authority credentials into synthetic tests.
The base API requires `MEDUCATION_DATABASE_URL` with the reader role. Explicit
local non-TLS use also requires `MEDUCATION_DATABASE_ENVIRONMENT=local`; production
defaults require verified TLS. Empty API configuration permits DB-only setup but
cannot start a ready API. No file fallback exists.

Initialize roles, migrate and explicitly import/activate a reviewed paired seed
using the [database job procedure](../backend/README.md#l3-database-toolchain-and-explicit-jobs).
Workers do not perform those jobs. Start the local database before the jobs:

```sh
docker compose --env-file ops/containers/.env --profile db up -d postgres
```

After initialization, start the reader-backed API and learner using the local DB
extension (it adds the database health dependency and migrator job):

```sh
docker compose --env-file ops/containers/.env -f compose.yaml -f ops/containers/compose.postgres.yaml --profile db up -d api frontend
```

The frontend binds loopback port 4173 by default. API and database ports remain
private. For a deliberate loopback database connection, add
`-f ops/containers/compose.db-port.yaml` and configure `MEDUCATION_POSTGRES_PORT`.
Validate configuration with `config --quiet`; resolved configuration can contain
secrets and must not be printed or committed.

## Stop and recreate

Use the same env/project/files for subsequent operations:

```sh
docker compose --env-file ops/containers/.env stop
docker compose --env-file ops/containers/.env down
docker compose --env-file ops/containers/.env --profile db up -d postgres
```

Normal stop/down/recreation preserves the named PostgreSQL volume. Removing the
volume, destructive reset, Docker storage reset or disk loss can remove data.
Retain verified full dumps outside the volume. PostgreSQL-major upgrades require
a deliberate migration; changing the image tag over existing storage is insufficient.

## Verify the images

After building, run the isolated checks sequentially:

```sh
.venv/bin/python scripts/containers/smoke-api.py --image meducation-api:local
.venv/bin/python scripts/containers/smoke-learner.py --api-image meducation-api:local --frontend-image meducation-learner:local
.venv/bin/python scripts/containers/smoke-compose.py
.venv/bin/python scripts/containers/smoke-authoring-policy.py --image meducation-api:local
.venv/bin/python scripts/containers/smoke-postgres-learner.py --api-image meducation-api:local --frontend-image meducation-learner:local --output /tmp/meducation-pg-browser.json
```

These tests use explicit small synthetic seeds, generated credentials and owned
networks/containers. The Compose volume rehearsal checks data across restart and
recreation and deletes only its verified disposable volume. No test uses the
current authority or its credentials. The packaged API audit checks wheel/dependency
integrity, absence of corpus/file repositories, exact content/provenance, conditional
responses, CORS, graceful shutdown and fail-closed redacted startup. Proxy checks
retain artifact/cache/error policies and API address-change recovery. Learner
browser checks retain active study and scores across PostgreSQL API recreation.
Current-content acceptance separately selects a protected fresh export; fixtures
do not certify live database currency.

## PG17 local tools and recovery rehearsal

These commands use the healthy running `postgres` service's PG17 clients and
**development bootstrap** access. They do not implement production backup roles.
No database URLs or passwords go in command arguments. Each client creates a
0600 pgpass file on the container's temporary filesystem, escapes colons and
backslashes, and removes it on exit. Client errors omit SQL/credential diagnostics.
The wrapper verifies all three client majors and the authenticated server major
before operating. Use `--project NAME` before the subcommand for another explicit
Compose project; the default is `meducation-local`.

```sh
.venv/bin/python scripts/containers/postgres.py versions
printf 'SELECT current_database();\n' | .venv/bin/python scripts/containers/postgres.py psql
.venv/bin/python scripts/containers/postgres.py dump \
  --output var/backups/postgres/meducation.dump
.venv/bin/python scripts/containers/postgres.py restore \
  --input var/backups/postgres/meducation.dump --database meducation_verify
```

Dump uses custom format, `--no-owner --no-acl`, a 0600 temporary file in the
output directory, fsync and archive-list validation before atomic replacement.
A successful dump replaces the explicitly selected output; use dated names for
retention. Failure leaves any previous backup untouched and removes temporary
output. Parent directories created by the tool use 0700; protect existing backup
directories yourself. Keep backups outside the DB volume. Copy verified backups
to protected off-device storage for device-loss recovery; local ignored files
alone do not provide that protection.

Restore accepts a trusted local archive and **creates** the requested database
from template0. An existing target fails without cleaning/dropping it. Reserved
databases and `meducation` are rejected. It uses `--exit-on-error
--single-transaction --no-owner --no-acl`; failed transactional restore leaves
the newly created target empty for inspection. It never automatically drops a
database. Inspect the restored data before treating a backup as verified; then
remove only your explicit verification database:

```sh
printf "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';\n" | \
  .venv/bin/python scripts/containers/postgres.py psql --database meducation_verify
printf 'DROP DATABASE meducation_verify;\n' | .venv/bin/python scripts/containers/postgres.py psql --database postgres
```

Run `.venv/bin/python scripts/containers/smoke-postgres-tools.py` for a repeatable
isolated rehearsal. It starts only Postgres in a generated project, dumps synthetic
text/JSON/order/sequence data, compares the restored rows, tests failed dump and
truncated restore, and verifies credential cleanup and reset refusals. It drops
only its synthetic databases and exact labeled volume; developer projects are
untouched. `--report PATH` retains successful evidence without credentials.

L3 must supply reader/migrator/backup roles and explicit ownership/default grants,
migrations/head checks, and exact canonical-bank ID/text/order/provenance/API
parity on restore. Bootstrap superuser recovery is an L2 tooling test, not the
production backup design. Learner progress remains browser-local; use L1 progress
backups separately. See the [toolchain contract](decisions/0003-local-postgres-toolchain.md),
[PG17 restore transactions](https://www.postgresql.org/docs/17/app-pgrestore.html)
and [password-file rules](https://www.postgresql.org/docs/17/libpq-pgpass.html).

## L3 explicit database jobs and toolchain verification

L3 Steps 2–3 supply locked database dependencies, local role/bootstrap commands,
packaged migration head `0006_allocation_fence`, controlled content transactions and DB-mode
initialization/cleanup. Step 4 supplies host-side paired file import/export; Step 5 supplies the paired learner reader adapters.
Compose and all runtime services are PostgreSQL-only. Follow
[backend job setup](../backend/README.md#l3-database-toolchain-and-explicit-jobs)
for ignored host configuration and explicit local bootstrap. Bootstrap updates
the four configured application passwords and restricts PUBLIC privileges on the
selected local database; it is never an automatic init-directory/worker action.

After configuring reader and migrator service-host connections in ignored
`ops/containers/.env`, validate the DB-mode override without printing secrets:

```sh
docker compose --env-file ops/containers/.env -f compose.yaml -f ops/containers/compose.postgres.yaml --profile db --profile db-jobs config --quiet
docker compose --env-file ops/containers/.env -f compose.yaml -f ops/containers/compose.postgres.yaml --profile db up -d postgres
docker compose --env-file ops/containers/.env -f compose.yaml -f ops/containers/compose.postgres.yaml --profile db-jobs run --rm --no-deps migrate
```

The migration job applies head `0006_allocation_fence` (including the preserved
`0001_content` foundation) and can be repeated. Run this controlled
job explicitly before the API. It receives only the migrator URL, while the API
receives only the reader URL and waits for Postgres startup health. Import and
activation are separate explicit [operator commands](../backend/README.md#paired-content-import-activation-and-export). A successful `pg_isready` check
alone cannot start an uninitialized DB learner API. After explicit paired import/activation, start the reader-backed services with
the same override:

```sh
docker compose --env-file ops/containers/.env -f compose.yaml -f ops/containers/compose.postgres.yaml --profile db up -d api frontend
```

The API initializes schema/head/active release once and uses one bounded reader
pool for both adapters. Health endpoints perform no recurring SQL. Each content
response pins one release; later publication is visible on the next request
without restarting the process. Outages return a sanitized 503 rather than cached
catalogs or a JSON fallback. JSON mode is retired; current content is never reconstructed from an implicit repository file.

Verify the installed API wheel, binary driver/libpq, packaged Alembic environment,
real empty/repeated schema migration, an independent synthetic toolchain migration,
backup grants, role permissions,
transaction rollback and fail-closed startup against isolated PG17:

```sh
docker build -f backend/Dockerfile -t meducation-api:l3-step5 .
.venv/bin/python scripts/containers/smoke-db-toolchain.py --image meducation-api:l3-step5 --output test-results/l3-step5-db-toolchain.json
```

This smoke uses uniquely named containers/network, synthetic data and a tmpfs
database with no host port or persistent volume. Temporary credential files are
mode 0600 and cleaned with the containers/network. It never connects to the
routine Compose database or modifies authored banks. The native acceptance
runner now includes this check on its existing AMD64/ARM64 CI jobs; an ARM64
result does not establish AMD64 acceptance. Its synthetic revision uses a separate
Alembic marker and is not actual-bank import/parity evidence.

Run the schema/operation integration suite separately:

```sh
.venv/bin/python scripts/containers/test-postgres-content.py --output test-results/l3-step5-postgres.json
```

This launches a unique tmpfs PG17 container with a temporary random loopback port
and synthetic credentials. Tests reset only its explicitly named test database
schema. The 80 fixture cases cover SQL validation, paired finalization, role
isolation, immutability, audit/replay, publication rollback, private drafts and
concurrent durable allocations. Both native acceptance jobs now invoke this
suite alongside the installed-image smoke. Step 4 adds file/CLI roundtrip,
captured-input, concurrent import, output refusal/cleanup and corrupt-row cases. Step 5 adds all learner endpoint
contracts, pinned publication/body races, cache eviction/reactivation and
catalog/body/reconnect outage cleanup.
Validation/import runs from the host checkout with Node dependencies; the API
image receives no Node runtime or operator credentials. Actual-bank reconstruction/API parity
and backup-role recovery remain later L3 gates.

Step 6 supplies an [actual-bank parity and fresh restore rehearsal](../backend/README.md#actual-bank-parity-and-isolated-recovery-acceptance)
and Postgres-mode proxy/browser acceptance. Follow those exact isolated commands;
L2's bootstrap-only Compose dump remains a separate development tool. Restore
uses backup/migrator roles, owner object creation and deliberate ACL reapplication.
A successful local report does not establish off-device retention or native AMD64
CI. Both native jobs passed in [run 38427563502](https://github.com/mfranco1/meducation/actions/runs/38427563502); future input changes need new acceptance evidence.

## Separate destructive reset

For a database containing anything to retain, first dump it off-volume, restore
it to a fresh target and compare the actual data. Preserve that verified backup
and any role definitions before stopping the project. Inspect the exact volume:

```sh
docker compose --env-file ops/containers/.env --profile db down
docker volume inspect --format '{{.Name}} {{json .Labels}}' meducation-local_postgres-data
```

The name must be `meducation-local_postgres-data`, with project label
`meducation-local` and Compose volume label `postgres-data`. After verifying the
backup, remove only that exact volume with `docker volume rm
meducation-local_postgres-data`. The wrapper deliberately does not accept a mere
backup path as proof that recovery was verified.

If you intentionally discard **only disposable development data**, use the
explicit command after `down`:

```sh
.venv/bin/python scripts/containers/postgres.py discard-volume --discard-disposable-data
```

It verifies the resolved project volume name and both labels and refuses any
volume still referenced by a container. It never removes backup files or canonical
content. Next startup initializes an empty volume; roles, migrations and reviewed publication must be restored explicitly.
This action is distinct from normal stop/start/recreation. No reset command is
part of routine startup.

For a port conflict, inspect `docker compose ... ps` and the loopback listener,
then choose an unused explicit env-file port and recreate the affected service.
For stale containers, use the same project/env/override flags and scoped
`docker compose ... down` then `up`; keep the volume. Check scoped `logs --tail
100 postgres` for startup failures without printing resolved configuration.
Do not change credentials to try to migrate an existing volume. Update readable
image tags and digests together after upstream review and rerun native builds
and recovery checks. A new Postgres major requires an explicit upgrade or
fresh-volume restore plan; never mount the PG17 data directory under a new major.

## Native container acceptance and CI

Run the complete gate after installing the host npm/backend verification tools
and Chromium. It builds both images twice with `--pull --no-cache`, then checks
each build's actual packages/content/artifacts/runtime. The second learner run
also executes browser tests through the shipped proxy, including the L1 paired
backup suite and progress persistence across frontend recreation at the same
loopback origin. No host Vite/API server or personal profile is used.

```sh
.venv/bin/python scripts/containers/acceptance.py --expected-architecture arm64
```

Use `amd64` on a native AMD64 machine. The runner checks host, Docker engine and
built image architectures; a QEMU run does not satisfy this gate. It finishes
with isolated Compose startup/recreation and PG17 dump/restore rehearsals.
Routine developer databases are untouched. The recreation helper accepts only
the exact generated smoke frontend name, label, network and loopback binding.

Evidence and command logs live under ignored `test-results/container-acceptance/`;
Playwright traces use `test-results-containers/` separately so browser cleanup
cannot erase the build evidence. `acceptance.json` records source commit, dirty
file list, input hashes, platform/tool versions, both image IDs and command
results. Build/package logs and failure traces contain only build metadata and
synthetic test data. Reproducibility means repeatable pinned/locked inputs and
verified output behavior; image digests are not promised byte-identical.

The [Checks workflow](../.github/workflows/checks.yml) keeps host jobs and adds
separate native `ubuntu-24.04` AMD64 and `ubuntu-24.04-arm` ARM64 jobs, with
bounded execution, read-only repository permission and scoped evidence/trace
artifacts retained for 14 days. [GitHub runner architecture reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
A configured job is not execution evidence: both platforms must actually pass
before L2 closes. Runner availability/eligibility and hosted execution remain
unverified until the workflow runs for this revision.

L2 acceptance closed on 2026-10-13 after local verification and the user's
confirmation that all jobs passed in [GitHub Actions run 38371220116](https://github.com/mfranco1/meducation/actions/runs/38371220116).
The completed tracker records native ARM64 machine evidence and user-confirmed
native AMD64/ARM64 CI. This does not close L3 DB-content/role/parity work or the
remaining L1 browser/device/lifecycle release checks.

## L4 private paired-service verification

Rebuild the API image after the Step 4 migration/service changes. The packaged
head is `0006_allocation_fence`; default Compose requires a PostgreSQL reader. Private sessions require the separate local
synthetic configuration in the [session runbook](L4-admin-session-boundary.md).
The session/editor credentials must refer to the same PostgreSQL database.
[Paired services](L4-paired-editor-services.md) add no startup migration or cutover.

```sh
docker build -f backend/Dockerfile -t meducation-api:l4-step4 .
.venv/bin/python scripts/containers/test-postgres-content.py --output /private/tmp/l4-postgres.json
.venv/bin/python scripts/containers/smoke-db-toolchain.py --image meducation-api:l4-step4 --output /private/tmp/l4-toolchain.json
.venv/bin/python scripts/containers/smoke-authoring-policy.py --image meducation-api:l4-step4 --report /private/tmp/l4-policy.json
.venv/bin/python scripts/containers/verify-postgres-release.py --small-fixture --output /private/tmp/l4-recovery.json
```

These checks use isolated synthetic databases and containers, without
changing routine volumes. Native ARM64 image evidence does not certify AMD64 CI,
provider acceptance, browser editor integration or durable authored recovery.

[Step 5 HTTP editor](L4-http-editor.md) supplies the private browser gateway.
Packaged head is `0005_reserved_parents`; migration/bootstrap remain explicit
operator jobs and no authority cutover is implied.

L4's [recovery preparation](L4-authoritative-recovery.md) extends the actual-bank
rehearsal with authored paired history, editor reservations, exact effective ACL
parity and restored-session quarantine. The generic bootstrap-based `postgres.py`
restore helper does not perform these L4 gates. Independent retained copies and
allocation recovery remain pending before the separately authorized cutover.

Rebuild the installed API image before using migration `0006_allocation_fence`;
startup only checks the packaged schema and never migrates. Range/recovery jobs
use explicit migrator credentials and private journal paths. Their `--rehearsal`
mode is restricted to loopback test/verification databases; ordinary Compose
bootstrap dump/restore commands do not establish authoritative allocation recovery.

## L5 diagnostics and safe logging

Rebuild both API and frontend images after changing operational middleware or
`ops/containers/nginx.conf`. The API keeps one worker and disables forwarded-header
trust. Liveness/readiness do no recurring SQL; ready can remain 200 during a DB
outage. The authenticated, explicit POST `/api/admin/diagnostics` shares existing
reader/session/editor pools, reusing the guard's session connection. See the
[operations runbook](L5-local-operations.md) for the local-only identity gate,
bounded outcomes, aggregate six-connection worker budget and failure diagnosis.

Nginx structured access events use fixed route families, generated correlation,
status, duration and safe categories. The HTTP error channel discards native
request-context messages; master startup messages remain on stderr. The API logs
fixed route templates and dependency failure/recovery events without raw URLs,
parameters, cookies, text, SQL or exception traces. Keep these log controls when
changing proxy/server launch commands. Their protection includes failure paths.

Run `smoke-admin-http.py --image <fresh-api-image>` after a fresh HTTP admin build,
with no concurrent `dist` builds/browser suites. It tests explicit protected
diagnostics, then injected canaries against API exceptions, native rejected
methods/body limits and a test-only refused Nginx upstream. No raw logs are saved
in its report. `test-postgres-content.py` covers authorization, concurrent bounded
pool cleanup and failures; its separate `--restartable --keyword l5` stage covers
actual stop/start and DB-dependent diagnostic authorization. All fixtures are
disposable and never target routine authority volumes. Native changed-source
AMD64/ARM64 acceptance remains a later L5 gate.

## L5 provisional load smoke

Native acceptance also runs five negative harness contracts and
`scripts/containers/load-postgres.py --rounds 1 --output test-results/container-acceptance/postgres-load.json`
against the newly built API image. The smoke uses an owned disposable PG17 volume,
one worker, two reader connections and twenty simultaneous mixed quiz/flashcard
launches per round. It checks cold/warm launch correctness, both publication
boundaries, actual database stop/start recovery and connection cleanup. The
subprocess budget is 600 seconds; each measured round retains its stricter
60-second assertion. Longer samples remain an explicit operator command in the
[L5 operations runbook](L5-local-operations.md#twenty-learner-api-launch-characterization).
This adds a gate to future native AMD64/ARM64 jobs; local execution does not certify
that those changed-source jobs have passed.

## L5 operational rollback images

The native recovery stage builds `meducation-api:l5-rollback-prior` from commit
`bb8f354971cf5914eaad50feb24671b833ae679c` using
`.venv/bin/python scripts/containers/build-rollback-api.py`. The containers job
fetches full Git history so that exact source object is available. The retained
and current installed images must have matching packaged schema heads; the
recovery script verifies Python/SQL fingerprints, retained activation, unchanged
authoring state across image swaps, refused incompatible startup and successful
roll-forward. It also retires source application connections before restored
allocation admission. These are disposable fixtures; see the
[operations runbook](L5-local-operations.md#distinct-recovery-and-rollback-drills)
for full commands and the separate retained-backup/provider obligations. These
new inputs require another native AMD64/ARM64 run before overall L5 acceptance.

## Optional HTTP admin image

The root Dockerfile's explicit `admin` target packages HTTP authoring assets and
serves `/admin.html` with `Cache-Control: no-store`. Default builds and Compose
still select the final `learner` target and reject that path. Both targets use the
same non-root static runtime, bounded API proxy and cache policy. Source maps and
build manifests are audited then removed; audit JSON is outside the web root.
This packages a serving path; it does not enable private API identity. Follow the
[build/serving and smoke recipe](L6-deployment-handoff.md#build-and-serve-the-local-artifacts).

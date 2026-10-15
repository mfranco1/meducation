# Meducation content API

For the initialized local authority, use the [local authoring launcher and jobs](../docs/local-authoring.md).

Use PostgreSQL published-only learner delivery and authenticated paired HTTP authoring for the designated authoritative target. JSON service mode and routine file authoring are retired; JSON remains a request/export/recovery format. Explicit migrator jobs own schema/ACL/session/allocation recovery; workers never migrate or import. Restore into a separate target, quarantine sessions and protected allocation, rotate external auth epoch, reconcile complete independent journals, then restart compatible workers/caches. Hosted identity remains disabled until its separate acceptance gate passes. See [the recovery runbook](../docs/L4-authoritative-recovery.md).

The API reads only PostgreSQL. Flashcard decks reference shared quiz-bank
subjects directly. Attempts, checkpoints and scoring remain browser-local.
Small synthetic inputs may seed disposable test databases; they cannot configure
a file-backed production service.

From the repository root, create the isolated environment if it does not exist:

```sh
python3.14 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.lock
.venv/bin/python -m pip install --no-deps -e backend
.venv/bin/python -m uvicorn meducation_api.main:app --reload --host 127.0.0.1 --port 8000 --no-proxy-headers
```

For configuration overrides, copy `backend/.env.example` to ignored
`backend/.env`. Set a reader-role `MEDUCATION_DATABASE_URL` for an initialized
PostgreSQL 17 schema and active paired publication before starting the API. Local
non-TLS connections also require explicit `MEDUCATION_DATABASE_ENVIRONMENT=local`.
The default environment is production, which requires verified TLS. A missing
reader connection fails API startup; operator-only jobs can still load settings
without a reader URL. Explicit `MEDUCATION_CONTENT_SOURCE=json` is rejected;
remove legacy bank-path settings, which have no runtime consumers.

Run the frontend separately using [frontend setup](../README.md#install-and-run).
Production hosting must route `/api` to FastAPI. See
[local editor setup](../README.md#local-content-editor) for authenticated authoring.

On startup the service checks schema/publication readiness, without migrating or
importing. Every content request pins the current immutable PostgreSQL publication.
The flashcard API exposes shared-subject inventory, deck summaries and ordered
card bodies under `/api/v1/flashcards`. Its revision also changes when shared
subject records change. Private paired HTTP services own controlled writes.
Interactive API documentation is available at `/docs` in development.

On Windows, activate `.venv\Scripts\Activate.ps1` and use `python -m pip ...`
and `python -m uvicorn ...` from the repository root.

Python installation may generate `backend/src/meducation_api.egg-info/` metadata.
It is ignored build output and should not be committed. The package source,
`pyproject.toml`, and requirements locks are tracked; installing the package
regenerates its metadata.

## L3 database toolchain and explicit jobs

The database toolchain, paired import/export and PostgreSQL learner adapters are
available. Explicit jobs own migration and reviewed recovery imports. Workers
require an initialized schema and active pair, never import or migrate at startup,
and cannot fall back to JSON.

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

`head` reports `0005_reserved_parents`; `upgrade` applies the packaged transactional
content schema and private authored-publication extension and is safe to repeat. The installed package contains Alembic revisions
and SQL resources under `meducation_api/migrations`, so the same explicit job
runs from the API wheel/image without a source checkout. It creates an empty
draft and unpublished pointer; it does not import authored content. Destructive
downgrade is refused. Use a disposable database for schema experiments and a
compatible app/schema or separate-database restoration for recovery.

`db/operations.py` provides private bound transaction calls for paired release
storage/finalization, activation, draft save/reset and independently committed ID
reservations. Configure the separate `meducation_operator` URL only for operator
jobs; never pass it to the learner API. Operational roles cannot write tables
directly. The operator CLI composes these primitives for file import, activation and export;
no admin gateway is exposed.
See the [schema decision](../docs/decisions/0005-paired-content-releases-and-postgres-schema.md)
for replay, actor, allocation and privileged-maintenance boundaries.

Normal pytest skips the 78 real-Postgres cases without an explicitly isolated
test target. Run `.venv/bin/python scripts/containers/test-postgres-content.py`
from the root to create a unique tmpfs PG17 test container, bootstrap/migrate and
exercise those cases. It cleans up its container and never uses the routine DB.

The container starts one explicit API worker. Runtime has a reader pool and, when
private admin authentication is enabled, separate session and editor pools. Each
pool has size 2, zero overflow and a five-second checkout wait; the aggregate is
at most six runtime connections per enabled API process (two without admin).
Connection establishment has a five-second driver timeout. Increasing the worker
or instance count multiplies these limits and needs separate capacity verification.
Operator jobs use direct, unpooled connections; migrations SET ROLE to
the NOLOGIN owner inside a transaction. Hosted configuration requires explicit
`sslmode=verify-full` and forces `gssencmode=disable`; local non-TLS configuration requires a loopback or the
Compose `postgres` hostname and `MEDUCATION_DATABASE_ENVIRONMENT=local`.
One-time schema/head/active-release checks dispose connections on startup failure;
recurring health routes do not query Postgres. Successful DB learner startup is
available after explicit bootstrap, migration, paired import and activation.

Runtime pools use request-driven checkout pre-ping to replace stale idle sockets;
there are no timer-driven SQL pings. A transaction interrupted after checkout
still fails and is not replayed automatically, particularly for uncertain writes.
Reader startup and request transactions set a ten-second statement timeout and
three-second lock timeout locally. Failed requests release/roll back their
connection and return the existing safe `content_unavailable` response. These
limits bound SQL waits, not an absolute request deadline through a network
blackhole. See [SQLAlchemy's disconnect handling](https://docs.sqlalchemy.org/en/21/core/pooling.html#disconnect-handling-pessimistic).

Run the isolated restart acceptance with:

```sh
.venv/bin/python scripts/containers/test-postgres-content.py --restartable --keyword l5 --output /tmp/meducation-resilience.json
```

This uses a uniquely labeled temporary volume and fixed loopback port so data
survives fixture stop/start. The controller checks the exact container label,
volume and port before either action; cleanup removes only its owned fixture.
It tests stale reader/session/editor sockets, reader lock timeout cleanup and
actual database restart recovery, including query-free health routes during the
outage. Native container CI runs this separately from the default tmpfs suite.
Local restart evidence does not establish hosted suspend/wake latency.

## Paired content import, activation and export

Keep canonical JSON authoritative. Install the Python development environment and
run `npm ci` in the repository. Validation/import requires `--repository` pointing
to that checkout: the job runs existing TypeScript stored/domain/Markdown and
flashcard validators against private copies of the exact captured input bytes.
It never validates a different bundled bank or rereads source files after capture.
Both files are limited to 64 MiB each. Python first rejects duplicate keys,
nonfinite numbers, null/unknown fields, bad relationships and unpaired Unicode
surrogates; the TypeScript gate adds rich-content and reviewed-note policy.
Warnings are reported as a count and do not block existing reviewed content.
No input text, database URL or SQL is printed.

```sh
.venv/bin/meducation-db validate-pair --quiz-file /protected/selected-export/questionBank.json --flashcard-file /protected/selected-export/flashcardBank.json --repository .
.venv/bin/meducation-db import-pair --reviewed-recovery-import --quiz-file /protected/selected-export/questionBank.json --flashcard-file /protected/selected-export/flashcardBank.json --repository . --operation-id "IMPORT_OPERATION_UUID" --actor "local-operator" --reason "Initial reviewed JSON copy"
.venv/bin/meducation-db activate --release-id "RELEASE_UUID" --expected-sequence 0 --operation-id "ACTIVATION_OPERATION_UUID" --actor "local-operator" --reason "Explicit first activation"
.venv/bin/meducation-db export-release --release-id "RELEASE_UUID" --output var/content-export-new
```

Replace the UUID placeholders before execution. Choose and retain one operation
UUID per intent; retry with the same files/actor/reason/UUID to obtain the recorded
result. Changed intent needs a new UUID. Import prints release identity, both
revision hashes, captured source hashes and warning count. It never activates;
reimporting an old pair cannot silently roll back the active pointer. Activation
uses a separate UUID and expected sequence; zero applies only to a fresh
unpublished database. Later activation requires the current sequence, which can
be observed in an export manifest. Replay returns the original event without
moving a subsequently changed pointer. Both actions require the configured
operator connection; bootstrap/migration credentials are never substituted.

Create the export parent first; the output directory itself must be new.
`questionBank.json` and `flashcardBank.json` are reconstructed independently from
normalized rows and global ordinals. Artifact key order is only a template;
field/value/array differences fail rather than being repaired. Both serialized
artifacts and revision hashes must match. `manifest.json`, written last, contains
release ID, schema versions, digests, artifact checksums and publication context
from one read-only repeatable snapshot. No manifest fields enter bank schemas.
An ordinary write failure removes only the newly created output. A process crash
may leave an incomplete directory: absence of the manifest means incomplete;
retain source/DB data and choose a new output directory for retry. Existing
outputs and canonical files are never overwritten.

Validation/import is a host operator workflow requiring Node and the checkout;
the production learner image does not gain Node or a runtime validator. Head,
migration, activation and export use the installed Python package. Run the
[disposable PG integration launcher](../docs/testing.md#local-preparation-acceptance)
for roundtrip, source-capture, injected rollback, replay/concurrency, corrupt-row
rejection and CLI evidence. Fixture and actual-bank learner DB/API parity, PG reverse-proxy/browser and
restore acceptance are verified, including both native CI architectures. After activation,
select `MEDUCATION_CONTENT_SOURCE=postgres` with only the reader URL to run the
learner API. No JSON fallback or worker migration/import is performed.

Each content request opens one paired view, selects the publication once and
pins its release/digests for both repositories. All catalog/body SQL includes the
pinned release ID. Catalog cache entries contain only immutable release-scoped
subjects, quizzes, decks and ordered membership IDs; at most two releases are
retained per worker. Every request still selects the current pointer, so publication
and old-release reactivation take effect without an API restart. Eviction does
not invalidate an in-flight view. Bodies come from normalized rows. The response
dependency releases its one connection after complete synchronous payload
construction, before sending the response, including 304/404/409 and failures.

Database request failures return a sanitized 503 `content_unavailable`, even
when an old catalog/ETag is cached. Recurring `/health/live` and `/health/ready`
perform no SQL; readiness means initialization completed, not live DB reachability.
The same bounded reader engine is disposed on failed startup and shutdown.

## JSON API container

From the repository root, build the production API image:

```sh
docker build --pull -f backend/Dockerfile -t meducation-api:l2-step2 .
```

The multi-stage image installs a non-editable wheel and the locked runtime
dependencies under pinned Python 3.14.8. It includes byte-identical copies of
both archived banks at `/app/content/` with explicit path settings, runs as
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
tools. Application schema/roles/DB reads are implemented; generic JSON Compose does not configure the authority.

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

## Actual-bank parity and isolated recovery acceptance

Run these jobs from the repository root with the Python development lock and
`npm ci` installed. The routine local PostgreSQL database is authoritative; these
jobs use repository JSON archives as read-only fixture inputs, which may be older
than that authority. They create unique PG17 tmpfs clusters and disposable targets;
no routine database/volume is read or changed, and source files stay unchanged.

```sh
.venv/bin/python scripts/containers/verify-postgres-release.py --output test-results/l3-step6-recovery.json
.venv/bin/python scripts/containers/smoke-postgres-learner.py --api-image meducation-api:local --frontend-image meducation-learner:local --output test-results/l3-step6-browser.json
```

For all three L5 operational drills, first build the pinned retained image with
`scripts/containers/build-rollback-api.py`, then pass `--api-image meducation-api:local
--previous-api-image meducation-api:l5-rollback-prior` to the first command. See the
[rollback/restore runbook](../docs/L5-local-operations.md#distinct-recovery-and-rollback-drills).
Its default mode omits installed application rollback; `--small-fixture` is only
for development and does not certify archive-corpus parity.

The first command captures/validates both archive banks, bootstraps/migrates,
imports and explicitly activates them. It checks every normalized field,
optional omission, rich string, global/choice order, both artifacts/digests and
all applicable learner routes/counts/membership/ETags/304/409. Current content
produces 348 routes, but counts are derived from input and not hard-coded tests.
A private draft and burned reservations exercise non-public recovery state.
PG17 `pg_dump` authenticates as backup, produces a temporary 0600 custom archive
with no owner/ACL, and restores in one transaction into a fresh database through
the migrator with `--role meducation_owner`. Only the newly created target gets
temporary owner CREATE privilege, revoked afterward. Bootstrap/default grants
and `db/recovery.py` selected reader/operator permissions are reapplied explicitly.
All table hashes/counts and sequence values must match, source state must remain
unchanged, and fresh readers repeat full reconstruction/API parity after restore.
Credentials/archive and containers are cleaned; this is acceptance evidence, not
a retained/off-device backup or a production RPO guarantee. After a real restore,
restart workers/caches and reconcile lost post-backup allocations before authoring.

For an already initialized _disposable local_ target named `meducation_verify_*`,
the standalone CLI uses matching explicit operator/reader URLs:

```sh
.venv/bin/meducation-db parity --quiz-file /protected/selected-export/questionBank.json --flashcard-file /protected/selected-export/flashcardBank.json --repository . --release-id "RELEASE_UUID" --report new-parity-report.json
```

It performs no import/activation or authored-file write. The selected pair must
be active for API parity. The report path must be new. Failure diagnostics name
mismatch paths without printing values, SQL or credentials. Parity requires
Node and development TestClient dependencies; the learner runtime gains neither.

The browser launcher loads only existing e2e fixtures into the isolated PG
cluster, starts the installed reader API and shipped Nginx learner proxy, and
runs existing Chromium learner/progress-backup/recreation flows. One extra test
switches the exact owned API between JSON and Postgres at the same origin,
verifies active quiz identity/responses/signature, flashcard checkpoints and
completed history remain unchanged, then explicitly publishes changed fixture
content and verifies the existing restart prompt and preserved completed scores.
Controls verify exact generated container/network labels and never address a
routine service. Synthetic operator credentials stay in private files, not the
browser or command arguments.

Native AMD64/ARM64 acceptance runs fixture PG tests, actual-bank recovery and the
PG proxy/browser suite. The expensive container browser suite runs once in PG
mode; default JSON HTTP/proxy checks remain on both clean builds and the host
JSON browser job remains separate. Local ARM64 passes do not close the native
CI gate without both new jobs passing. [Run 38427563502](https://github.com/mfranco1/meducation/actions/runs/38427563502) passed both architectures at the current implementation commit. See the [L4 handoff](../docs/L4-authoring-handoff.md) for private editing and cutover requirements.

## Packaged authoring content policy

Run `npm ci` and `npm run build:content-policy` from the repository root before
backend tests or local draft-save jobs. The API image builds these resources and
ships Node 22 plus the self-contained validator in the Python wheel; runtime
requests do not invoke tsx or require the checkout. Missing resources/Node fail
closed for authoring while learner reads retain their separate read-only path.
See [policy limits and acceptance](../docs/L4-content-policy.md). Rebuild after
editing shared policy or limits. The default validator approves local images only;
HTTP integration must inject any approved origins from trusted backend settings.
`admin/authoring.py` supplies internal paired preview/save/publish with fresh validation,
context checks and atomic authored provenance. Its actor is trusted backend/operator
context, not browser authentication. Step 3 now supplies a disabled-by-default, loopback-only synthetic OIDC/session
boundary; production provider assurance is still unaccepted.
[Step 4 paired content HTTP services](../docs/L4-paired-editor-services.md) now
provide guarded reservations, draft history, publication, activation and export.
[Step 5 editor session integration](../docs/L4-http-editor.md) is now implemented locally. See
[session roles, configuration and verification](../docs/L4-admin-session-boundary.md).

[Step 5 HTTP editor](../docs/L4-http-editor.md) supplies the private browser gateway.
Packaged head is `0006_allocation_fence`; migration/bootstrap remain explicit
operator jobs. The designated local PostgreSQL authority cutover is complete.

## L4 recovery preparation jobs

The [authoritative recovery runbook](../docs/L4-authoritative-recovery.md) describes
fresh-target role/ACL restoration, session quarantine, external epoch rotation,
selected-export checks and pending retained-copy/allocation gates. Explicit migrator
jobs `restore-permissions` and `invalidate-restored-sessions` never run in workers.
Offline `validate-export`/`audit-export` commands need a selected export directory,
the repository validation toolchain and a new private report path; they do not load
repository banks or require DB credentials. Their manifests identify draft/release
context without claiming live database currency. JSON checks remain archive/fixture-only; the local PostgreSQL authority is unchanged.

Migration `0006_allocation_fence` adds opt-in independently retained allocation
ceilings. `allocation-range` and `allocation-recover` are explicit migrator jobs;
private editor/operator transactions cannot change their admission state. Session
quarantine pauses protected allocation. Two durable agreeing journal chains must
be recorded before the DB admits a range; restore reconciliation burns all earlier
permitted ranges. Destination independence is an operator acceptance gate. Follow
[the allocation procedure](../docs/L4-authoritative-recovery.md#allocation-safety-is-a-separate-gate)
before enabling it; the designated PostgreSQL authority remains unchanged.

### Learner launch freshness (L5)

The PostgreSQL source selects the active publication on every content request;
there is no pointer TTL or background keepalive. A response pins one release.
Learner explicit launches now re-fetch their bank's subject catalog even with a
cached body, and block revision conflicts until reload. Admission requires check
start evidence younger than 30 seconds; failed/slow validation blocks new launches.
Active study and results review retain their content. This is not an outage or
hosted suspend/wake guarantee. See [the contract](../docs/product.md#content-freshness-at-launch).

Isolated one-quiz/one-deck PG17 measurements (excluding startup validation): a cold
browser launch sends four HTTP requests (initial subjects, membership, launch
subjects check, body). With a cold server catalog, quiz uses 18 SQL statements plus
four checkout pre-pings; flashcards use 19 plus four pre-pings because deck catalog
construction also reads its card IDs. A fully cached body needs one HTTP request,
three SQL statements (two SET LOCAL limits, one pointer read), plus one pre-ping.
Health calls add none. Counts depend on fixture size for flashcard catalog bodies;
no pointer-cache optimization is justified by these measurements.

### L5 explicit diagnostics and failure visibility

POST `{}` to `/api/admin/diagnostics` only from the existing signed-in editor
session with exact Origin and current CSRF. It checks reader connectivity,
packaged PG17 schema and active publication, plus session/editor connectivity,
without test writes or additional pools. The held session connection is reused;
concurrent diagnostics do not nest checkout. Session outages may return sanitized
`session_unavailable` before the diagnostic runs. Liveness/readiness stay SQL-free.

[The operations runbook](../docs/L5-local-operations.md) owns response states,
connection/time budgets, generated request correlation, log redaction, local
outage checks and the configuration audit. Worker request JSON logs use route
templates and fixed categories; Uvicorn access paths and native HTTP Nginx error
contexts cannot disclose request inputs. No new grants, runtime polling or write
replay were added. Transaction-pooled endpoints/provider TLS/suspend behavior
remain unverified deployment gates; use direct endpoints for operator jobs.

The [L6 deployment handoff](../docs/L6-deployment-handoff.md) records complete
configuration/secret ownership, explicit bootstrap/migration/selected transfer,
optional admin packaging, routing and smoke/recovery ordering. Hosted role
bootstrap and identity adapters remain implementation/acceptance gaps;
`bootstrap-local` refuses production and must not be used to bypass TLS validation.

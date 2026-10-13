# Local Postgres and Python toolchain

Status: selected; L2 API/learner/Compose/Postgres runtime verified on native ARM64; synthetic backup/restore verified on native ARM64; native AMD64/ARM64 L2 CI passed per user confirmation. L3 Step 2 is complete with user-confirmed passing native CI after the browser fix. Step 3 schema/transactions are locally verified; real-content integration remains pending. Baseline observed 2026-10-13. Gate: [L0 Step 7](../work/done/L0-local-contracts-plan.md). Historical metadata: [toolchain evidence](../work/done/L0-step7-toolchain-evidence.json). Current implementation: [L2 tracker](../work/done/L2-containers-local-services-plan.md) and [L3 tracker](../work/ongoing/L3-postgres-schema-migration-parity-plan.md).

## L3 Step 3 implementation follow-up — 2026-10-13

Installed head `0001_content` now applies the real schema explicitly and safely
repeats. Packaged SQL resources create immutable paired releases, private draft,
publication/audit history, durable ID registry/reservations and narrowly granted
operator functions. A separate secret `MEDUCATION_OPERATOR_DATABASE_URL` requires
the operator role and is never supplied to the learner API. No extensions or
provider-specific dependencies are added. Destructive downgrade is refused.

The installed-image smoke now tests real migration before an independent
synthetic revision using its own version marker. A separate 58-case real-PG17
fixture suite exercises transactional invariants and concurrency. Both checks
are included in native acceptance; local ARM64 passing results do not certify
new AMD64 CI execution or actual-bank import/API/restore parity. See
[ADR0005](0005-paired-content-releases-and-postgres-schema.md#step-3-implementation-follow-up--2026-10-13)
and the [current tracker](../work/ongoing/L3-postgres-schema-migration-parity-plan.md).
Earlier Step 2 missing-head and pending-CI statements below are historical.

## L3 Step 2 implementation follow-up — 2026-10-13

The recorded dependency baseline resolved under Python 3.14 without changing
existing locked versions. Both locks now include Psycopg binary 3.3.6,
SQLAlchemy 2.1.4, Alembic 1.20.0 and their resolved Mako/MarkupSafe dependencies.
A clean macOS ARM64 environment installed binary wheels and passed `pip check`;
the installed native Linux ARM64 API image passed the same package/import check.
Psycopg reports its binary implementation with bundled libpq 18.6 against PG17.11;
PG17 dump/restore clients remain the separately pinned tooling requirement.
Published release/API documentation was rechecked from
[Psycopg](https://pypi.org/project/psycopg/3.3.6/),
[SQLAlchemy](https://pypi.org/project/SQLAlchemy/2.1.4/), and
[Alembic](https://pypi.org/project/alembic/1.20.0/).

The official [Psycopg release notes](https://www.psycopg.org/psycopg3/docs/news.html),
[SQLAlchemy changelog](https://docs.sqlalchemy.org/en/21/changelog/changelog_21.html)
and [Alembic changelog](https://alembic.sqlalchemy.org/en/latest/changelog.html)
were rechecked; unreleased headings do not replace the selected published pins.
The engine forces `gssencmode=disable` and rejects conflicting query values:
libpq can otherwise prefer GSS encryption regardless of `sslmode`, which would
change the intended hosted TLS verification path.
[PostgreSQL connection parameter documentation](https://www.postgresql.org/docs/17/libpq-connect.html#LIBPQ-CONNECT-SSLMODE).

The backend implements explicit source/local-environment selection, redacted
assigned-role URLs, one bounded synchronous reader pool and direct unpooled jobs.
`meducation-db bootstrap-local` explicitly reconciles local owner/migrator/reader/
backup/operator roles, restricted PUBLIC database/schema permissions and owner
default backup/function privileges. The new operator has no blanket DML/DDL or
function execution; Step 3 grants controlled functions. Reader grants are selected
published views rather than all content tables, following ADR0005's private-draft
boundary. Existing roles with unexpected memberships/schema owners cause refusal.

Packaged Alembic resources live in `backend/src/meducation_api/migrations/` to work
from the installed wheel; no product revision is packaged until Step 3. Explicit
upgrade refuses that missing head before connecting. Runtime initialization checks
PG17, the future reader-visible schema-head view and a complete active release,
disposing the engine on failure/shutdown. DB learner startup stays closed until
Steps 3–5; JSON mode remains operational and no fallback/worker migration occurs.

[Toolchain smoke](../../scripts/containers/smoke-db-toolchain.py) uses a disposable
tmpfs PG17 instance and installed API image to verify explicit/repeated bootstrap,
role isolation, owner-created object backup grants, no PUBLIC private-function
execution, a synthetic Alembic upgrade/repeat, text/JSON/order round trip and
transaction rollback. It now runs in both native container CI jobs. These local
ARM64 results do not certify AMD64 execution, the planned product schema, real
content import/parity/restore or hosted behavior. See the L3 tracker for evidence
and the remaining Step 2 acceptance gate; historical L0/L2 statements below remain
their observations at the time.

## Baseline and selected versions

The current API requires standard CPython >=3.14,<3.15 in [pyproject.toml](../../backend/pyproject.toml). Both pip-tools locks were compiled with Python 3.14. Root .venv and shell Python report 3.14.7; backend/.venv does not exist. Keep the root environment convention from [backend setup](../../backend/README.md); no interpreter change or dependency installation occurred here. Existing read-only repository methods and FastAPI route functions are synchronous; retain that pattern for the first database adapter, using SQLAlchemy's synchronous engine and Psycopg 3. Do not introduce an async ORM or a second connection pool without a demonstrated need.

Choose **PostgreSQL 17**, initially 17.11. It is supported upstream through November 2029, and Neon currently supports majors 14–18. Both 17 and 18 are viable; 17 is a conservative common target with no required 18-only features in this app. Keep local/CI/managed major 17 aligned, while allowing the managed minor to follow provider maintenance. Do not claim Neon runs the same image/minor or filesystem behavior as local Docker. Reconfirm provider availability before provisioning. [PostgreSQL policy](https://www.postgresql.org/support/versioning/), [Neon compatibility source](https://github.com/neondatabase/website/blob/main/content/docs/reference/compatibility.md).

Use Debian Bookworm images on Linux ARM64 and AMD64, with multi-platform index digests verified from Docker Registry metadata:

- DB and client tools: `postgres:17.11-bookworm@sha256:3645870cccdfa447589da9f57dd740faa29b30938e861289a5874b6ca6b03826`.
- API base: `python:3.14.8-slim-bookworm@sha256:48b13b003dda20b16f9442b8475aa05fe21bf6579a8c881db92ffb4d8fd20f83`.

Both metadata bodies hash to their reported index digest and list linux/amd64 and linux/arm64/v8 child manifests. Use the index digest so native architecture selection works; do not hard-code an AMD64 child on Apple Silicon. Official image definitions independently list both architectures. Avoid Alpine initially to reduce libc/build differences. This is registry evidence, not a pulled/running image or a proven container build. [Postgres image definitions](https://github.com/docker-library/official-images/blob/master/library/postgres), [Python image definitions](https://github.com/docker-library/official-images/blob/master/library/python).

Selected database dependency baseline for L3: `psycopg[binary]==3.3.6`, `SQLAlchemy==2.1.4`, `alembic==1.20.0`. The binary extra brings matching psycopg-binary/libpq without a system libpq build. Use SQLAlchemy's bounded pool only; no psycopg-pool extra. Published PyPI metadata has standard CPython 3.14 Psycopg-binary and SQLAlchemy wheels for macOS ARM64 and Linux AMD64/ARM64; Alembic/Psycopg's base package use Python-independent wheels. The API container stays standard GIL CPython, not 3.14t. Alembic requires SQLAlchemy >=2.0, and SQLAlchemy's Psycopg dialect accepts this driver. These are stable published releases, not the unreleased documentation headings. [Psycopg installation](https://www.psycopg.org/psycopg3/docs/basic/install.html), [SQLAlchemy current release](https://docs.sqlalchemy.org/en/21/changelog/changelog_21.html), [Alembic requirements](https://alembic.sqlalchemy.org/en/latest/front.html), [Psycopg dialect](https://docs.sqlalchemy.org/en/21/dialects/postgresql.html#module-sqlalchemy.dialects.postgresql.psycopg).

In L3 add dependencies to pyproject, regenerate both locks with pip-tools under Python 3.14 and install from those locks in a clean environment. Resolve all transitive versions together; these metadata checks do not prove the current app's full dependency solution. Verify imports, binary implementation/libpq version, sync engine, transaction rollback, JSON/text/ordering round trip, migration upgrade and clean DB restore on both Linux architectures. Pin exact resolved dependencies in locks, do not silently fall back to source compilation. If resolution reveals a conflict, revise this record and evidence before implementation proceeds.

## Local environment and availability

Machine: macOS ARM64. Docker client 20.10.17 and Compose v2.7.0 are installed. A read-only daemon check could not connect to unix:///var/run/docker.sock; the old client's formatted info command also panicked. No containers were pulled/started, daemon started, tool upgrades performed or existing databases inspected. L2 must establish a reachable supported Docker runtime before claiming container verification. Do not require modern Compose watch/include features; use basic services/profiles/healthchecks and verify exact config with the available or updated Compose version.

Host psql/pg_dump report PostgreSQL 14.23. A version-14 pg_dump cannot dump a version-17 server. All psql/pg_dump/pg_restore commands for this project use the selected DB image's version-17 tools, including a separate tools container for hosted backup later. Do not change PATH or upgrade Homebrew as a side effect. Confirm client/server versions in the L2/L3 smoke tests. [Dump version compatibility](https://www.postgresql.org/docs/17/app-pgdump.html).

## Proposed local configuration and roles

L2 Step 4 now implements the Compose project, optional DB profile, pinned image/volume, development bootstrap configuration, SCRAM host initialization and optional loopback port below. [Current commands](../local-containers.md) use these implemented services. Application DB settings, schema/roles/migrations, pooling and backup-role contracts remain proposed L3/later work:

- Compose project `meducation-local`; optional profile `db`, service `postgres`, database `meducation`, schema `content`, named volume `postgres-data` (resolved volume `meducation-local_postgres-data`). With PG17 mount at `/var/lib/postgresql/data`; an eventual PG18 change requires deliberate volume-layout/upgrade review. Keep the JSON-only API path available and fail explicitly when selected DB mode has no connection.
- DB port is unpublished by default. An optional development override binds `127.0.0.1:5433:5432` to avoid the host's possible 5432 service. Other local services bind loopback as well. Containers use hostname `postgres`, not localhost. Host direct tools use 127.0.0.1:5433 only with that override.
- Proposed backend `MEDUCATION_CONTENT_SOURCE=json|postgres`, default json until the later explicit authority cutover. `MEDUCATION_DATABASE_URL` is runtime; `MEDUCATION_MIGRATION_DATABASE_URL` is direct migration; `MEDUCATION_ADMIN_DATABASE_URL` is later authenticated authoring; `MEDUCATION_BACKUP_DATABASE_URL` is direct dump/restore-operator configuration. Frontend VITE settings must never contain these secrets. Never fall back to a privileged URL when a lower-privilege URL is absent.
- Development-only bootstrap login `meducation_bootstrap` initializes the empty DB/roles; its password is explicitly disposable and marked dev-only. Do not pass bootstrap credentials to the running API. `meducation_owner` is NOLOGIN schema/object owner; `meducation_migrator` may SET ROLE to owner for explicit migrations; `meducation_reader` gets CONNECT, schema USAGE and SELECT only. A separate `meducation_backup` login receives read access to all content objects/sequences needed for dump, no DML/DDL; restore uses the migrator/owner path, never the reader or backup login. Future `meducation_editor` gets the required content DML, no DDL/role creation; backend auth still governs editor API calls. Apply default privileges for objects created as owner. Revoke PUBLIC schema CREATE and unnecessary database TEMP/CONNECT grants deliberately, granting needed roles explicitly. Hosted bootstrap uses provider-supported privileges, never assumes superuser.
- All passwords/URLs live in ignored local .env files; examples contain dev-only placeholders. SQLAlchemy URLs use `postgresql+psycopg://`; native client/libpq URLs use `postgresql://`, not the SQLAlchemy driver suffix. Construct/escape URLs safely, avoid printing them. Local TLS disable is allowed only for the explicit development configuration; hosted connections require `sslmode=verify-full` and configured CA trust.
- Local runtime begins with direct connections and a small per-worker SQLAlchemy pool (candidate pool_size=2, max_overflow=0). L5 verifies totals across workers, timeout/reconnect and no keepalive query defeating suspension. Migrations are an explicit one-off job using direct URL, never per-worker boot DDL. DB-mode initialization checks schema/content once. Recurring liveness/readiness probes must not query Postgres; readiness reports completed process/configuration/schema initialization. An authenticated explicit deep-dependency diagnostic may query. Request errors report live DB outages. Continuous DB checks require an explicit decision to give up idle suspension savings.
- Proposed dump destination: `var/backups/postgres/`, ignored in L2, outside the DB volume and kept off-volume before authority cutover. A local file is not automatically an off-device backup. Custom-format `pg_dump --format=custom --no-owner --no-acl` supports portable restoration into pre-created least-privilege roles. Retain separate role/bootstrap definitions; do not expect this dump to preserve ACLs. Dump captures a consistent database snapshot; canonical deterministic JSON export/parity checks are separate acceptance requirements.

The official PG image runs initialization scripts only for an empty data directory. Changing .env credentials/SQL after volume creation does not migrate existing roles/schema. Use explicit migrations/role operations. `pg_isready` is startup reachability only; the one-time DB-mode initialization check also verifies the expected migration head/required content state. Recurring readiness does not repeat that query. Named volume persistence is not backup. [Official image behavior](https://hub.docker.com/_/postgres).

## Hosted differences retained as configuration

Neon provides transaction-mode PgBouncer; keep runtime direct initially for the small single-editor workload, and evaluate a pooled runtime URL in L5/deployment testing. Migrations, pg_dump and pg_restore stay direct. Do not assume session SET, temporary tables or SQL PREPARE persist through a pooled endpoint. Neon's pooler supports protocol prepared statements, but driver/pooler behavior must be exercised if adopted; do not categorically claim all prepared statements are unsupported. No Neon-only extension, driver API or learner-progress table is introduced. [Pooling source](https://github.com/neondatabase/website/blob/main/content/docs/connect/connection-pooling.md), [TLS source](https://github.com/neondatabase/website/blob/main/content/docs/connect/connect-securely.md).

Local Docker restart/outage tests do not prove hosted suspend/wake latency, provider roles/extensions/collations, TLS trust, capacity or recovery retention. Avoid relying on local libc sort order for canonical bank order: store explicit positions and verify deterministic exports. Actual Neon checks remain deployment gates. No account/managed DB is provisioned by this decision.

## L2/L3 verification commands and destructive reset boundary

Proposed commands below run only after L2 supplies compose.yaml/profile/env and L3 supplies roles/migrations. They were not executed in L0:

```sh
docker compose -p meducation-local --profile db config --quiet
docker compose -p meducation-local --profile db up -d postgres
docker compose -p meducation-local --profile db exec -T postgres pg_isready -U meducation_reader -d meducation
docker compose -p meducation-local --profile db exec -T postgres psql --version
docker compose -p meducation-local --profile db exec -T postgres pg_dump --version
docker compose -p meducation-local --profile db exec -T postgres pg_restore --version
```

Use a configured pgpass/secret mount for dump credentials; do not put passwords in argv or print connection URLs. L2's local development wrapper checks exit codes, uses restrictive file permissions and renames temporary output only after success. L3 extends recovery to production roles and real content. Restore into a fresh disposable verification database with matching version-17 pg_restore, `--exit-on-error --single-transaction --no-owner --no-acl`; set object ownership deliberately via the migration owner role. Verify schema head, exact bank IDs/text/order/provenance, counts/revisions and API parity. A dump command passing alone is not a tested backup.

Explicit destructive reset for the selected future volume, only after a verified off-volume backup or a conscious decision to discard disposable development data:

```sh
docker compose -p meducation-local --profile db down
docker volume rm meducation-local_postgres-data
```

L2 must document the actual resolved volume name and label verification before removal; avoid broad prune/down --volumes commands that could remove unrelated volumes. Reset never removes canonical JSON or backup files. Do not run this during L0.

Security/version updates: recheck upstream patch releases and registry digests before L2 build and at regular maintenance; update readable tag plus index digest together, regenerate locks when dependency patches change, inspect changelogs/security notes and rerun the affected native builds/migration/dump-restore/parity checks. Record new evidence. Never reuse a PG17 data directory under another major by merely editing the tag.

## Audit and gate result

L2 runtime follow-up — 2026-10-13: Docker client/engine 29.8.2 and Compose 5.6.0 are reachable on native Linux ARM64 after the user's repair. The actual pinned PG17.11 image passed startup, authenticated TCP SQL, rejection without a password, optional port bindings and named-volume sentinel persistence across restart/recreation. A missing DB password fails at service startup without blocking the default JSON stack. The [L2 Step 4 evidence](../work/done/L2-step4-compose-evidence.json) records these results and safe removal of its isolated test volume. Step 5 subsequently verified synthetic custom-format dump/fresh restore and failure preservation with PG17 tools ([evidence](../work/done/L2-step5-postgres-tools-evidence.json)); the [runbook](../local-containers.md#pg17-local-tools-and-recovery-rehearsal) supplies operational commands. No application roles/schema/DB adapter, real-content import/recovery parity or native AMD64 acceptance is claimed. L0 observations and frozen evidence below remain historical.

L2 final follow-up — 2026-10-13: the user confirmed all jobs passed in [GitHub Actions run 38371220116](https://github.com/mfranco1/meducation/actions/runs/38371220116), including the separate native AMD64/ARM64 container acceptance jobs. The completed L2 tracker retains local machine snapshots, CI confirmation provenance and final audit evidence. Earlier L0/Step 4/5 limitations above are historical; real-content DB recovery/parity, least-privilege roles, migrations and hosted behavior remain L3/later gates.

L0-B design gate is met: major, image pins/architectures, Python driver/ORM/migration baseline, role/connection split, local volume/backup/reset contracts and future verification commands are recorded. Runtime Docker availability, full dependency resolution/install, images, migrations and actual dump/restore remain L2/L3 gates. JSON remains authoritative and no learner progress is moved to Postgres.

Self-audit caught the mismatched host dump major, unreachable daemon, native-versus-SQLAlchemy URL syntax, empty-volume-only initialization, mutable tags despite readable versions, managed minor differences and transaction-pool session semantics. Registry digest/architecture and package-wheel assertions passed; documentation links and build/typecheck are checked separately in the execution tracker. Stop before L0 Step 8.

Verification: registry digest/architecture, CPython-3.14 native wheel and Python-independent wheel assertions passed; changed-document links, canonical bank hashes and git diff --check passed. Build/typecheck passed with the existing Vite chunk-size advisory. No runtime dependency/container/database test is claimed.

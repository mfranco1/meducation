# L3 — Local Postgres schema, migration and parity

Created: 2026-10-13. Status: Step 1 complete; Step 2 complete with user-confirmed passing CI after the browser-test fix; Step 3 complete with passing local verification; Step 4 complete with passing local verification; Step 5 complete with passing local verification; Steps 6–7 pending.

Parent: [local-first production preparation](local-first-production-preparation.md#l3--local-postgres-schema-migration-and-parity). Prerequisites: [completed L2](../done/L2-containers-local-services-plan.md) and [ADR0003 toolchain contract](../../decisions/0003-local-postgres-toolchain.md). Follow the [work tracking stage gates](../README.md): implement one step, record its checks and limitations, then stop at that gate until continuation is authorized. The user's 2026-10-13 instruction to start implementation authorizes beginning this sequence; L4 remains outside scope.

## Outcome and scope

Serve the existing learner API from a local PostgreSQL 17 database with the same content, ordering, optional-field semantics, revision hashes and HTTP behavior as the JSON adapters. Supply explicit migrations, a transactional paired-bank importer, deterministic exports, durable ID allocation, and repeatable real-Postgres parity/recovery checks.

Both canonical JSON banks remain authoritative throughout L3. Import copies them into immutable paired releases without writing back to the files. Keep JSON mode available and default; selecting Postgres must fail explicitly when it is unavailable or uninitialized. Never silently fall back to JSON. Returning to JSON is a pre-L4 operational option only while the files still represent all authoritative edits.

L3 includes the schema and tested backend primitives for one paired draft, audit events, ID reservations and release activation. It does not expose an unauthenticated authoring API or connect the admin UI to Postgres. L4 owns authenticated editing/publishing, full authoring validation parity, and the explicit authority/tooling/backup cutover. L5 owns broader resilience, capacity and multi-worker freshness tuning. No learner data tables, cloud provisioning, runtime AI, new history-review feature, or provider-specific infrastructure are included.

## Current implementation and ownership

- [Backend repositories](../../../backend/src/meducation_api/repositories/question_bank.py) define both learner protocols, stored Pydantic models, JSON validation, indexes and revision serialization. Preserve these contracts; extract shared code only where both adapters need it.
- [API composition](../../../backend/src/meducation_api/main.py) injects path-based factories, caches subjects for the process lifetime, and stores separate quiz/flashcard repositories. Replace that composition with a paired content-source lifecycle and request-scoped release view. Route DTOs and public URLs stay compatible.
- [Settings](../../../backend/src/meducation_api/settings.py) currently configure paths and CORS only. Add explicit source/connection settings here, keeping SQLAlchemy and database URLs out of frontend/domain modules.
- [Compose](../../../compose.yaml) supplies optional Postgres with a persistent volume; it does not initialize application roles/schema or connect the API to it. Extend the [container tooling](../../../scripts/containers/postgres.py) and [runbook](../../local-containers.md) rather than introducing a competing operational workflow.
- [Backend dependencies](../../../backend/pyproject.toml) do not yet include a database driver, ORM or migration package. ADR0003's recorded versions are implementation inputs to verify, not a claim that installation has already passed.
- Owners: `backend/src/meducation_api/db/` for engine, relational mappings, transactional operations and operator CLI; repository adapters under `repositories/`; packaged migrations under `backend/src/meducation_api/migrations/`; integration/parity tests under `backend/tests/`. Operational wrappers remain under `scripts/containers/`. Step 2 places Alembic resources inside the existing package so installed images and editable environments share one path.

Read [architecture](../../architecture.md), [question schema](../../question-schema.md), [flashcard schema](../../flashcard-schema.md), [content management](../../content-management.md), and [testing guidance](../../testing.md) before changing their contracts. Do not change canonical text, IDs, provenance, schema versions or learner progress formats as part of this migration.

## Step 1 — Record schema, identity and consistency decisions

- [x] Add ADR0005 for content schema/versioning and the staged authority transition, with a concrete schema and ownership map. Distinguish Alembic schema revision, stored bank schema versions, immutable release ID, quiz/flashcard digests, draft revision, and publication sequence.
- [x] Model a paired release containing both bank versions/digests, import provenance and deterministic export artifacts; a singleton active-release pointer; append-only activation/publication events; and one paired draft with a base release and optimistic revision. Draft content must never be visible through learner queries. Choose normalized draft rows or a validated paired-document representation explicitly; avoid a general workflow engine.
- [x] Scope subject, quiz, question, deck and card rows by release. Use composite keys/foreign keys so a question cannot refer to a quiz in another release and a deck cannot reference another release's subjects. Share subject records between the two banks. Define restricted deletes and database enforcement of release immutability and append-only audit history for operational roles.
- [x] Store explicit collection ordinals sufficient to reconstruct every top-level array and its filtered per-parent order exactly. Do not assume parent grouping, ID order or database collation reproduces authored array order. Preserve choice order in a JSON array; use selective JSONB for sparse nested data with omission distinct from null.
- [x] Define durable per-kind ID allocation for `s`, `q`, `i`, `d`, and `f`, seeded from imported IDs. Reserve once under an operation ID and retain reservations across preview/apply retries, abandoned drafts, deletion and release rollback. Gaps are acceptable; reuse is not. Specify how separately committed reservations survive failed authoring transactions without leaving partial content.
- [x] Resolve the revision serialization trap: existing quiz hashes cover pretty-printed raw JSON, and flashcard hashes cover `flashcards-v2`, serialized shared subjects, and pretty-printed raw flashcard JSON. JSONB does not preserve object-key order. Retain validated serialized release artifacts/key-order information sufficient to reproduce existing digests, and independently prove normalized rows reconstruct the same data; never return stored source bytes as the only evidence of relational parity. Keep source-file byte hashes separate from API revisions.
- [x] Define activation as an atomic active-pointer update plus a new publication event/sequence, including rollback to a previously used digest. API revisions/ETags remain content digests; publication identity invalidates internal caches without changing unchanged-content revisions.
- [x] Define one release selection per response, shared by both adapters and all subject/count/ID/body reads. Pin the selected immutable release through response construction and release resources on success/error. Across HTTP requests, retain the existing revision/If-Match conflict behavior; do not promise a browser-wide transaction or silently serve historical content to bypass conflicts.

Gate: ADR records enforceable constraints, serialization rules, transactional boundaries and L3/L4 responsibilities. No authority cutover. Record unresolved decisions before starting migrations.

### Step 1 result — 2026-10-13

[ADR0005](../../decisions/0005-paired-content-releases-and-postgres-schema.md) selects version-scoped immutable content rows, global collection ordinals, one private paired-document draft, protected publication/audit history, registered stable IDs and independently committed reservations. It specifies role/function boundaries, finalization locking, atomic activation and one selected immutable release per response. Existing public digests remain separate from publication sequence. TEXT artifacts provide key-order templates; exported values must come from independently reconstructed rows and match those artifacts exactly.

Two compatibility findings are explicit: flashcard IDs currently permit opaque suffixes, which must survive import; and the flashcard digest uses Python model-ordered subject fields rather than raw subject-object key order. Pre-DB deleted-ID history cannot be inferred, and restoring an older allocation registry requires reconciliation before authoritative authoring resumes. L4's cutover/recovery contract owns these limitations; they are not presented as solved database guarantees.

[Design-input evidence](L3-step1-contract-evidence.json) records source hashes/revisions and an in-memory column projection, key-order-loss simulation and global-ordinal reassembly of both actual banks and learner fixtures. Restoring key order reproduced both existing API digests; missing fields, changed scalar content and reordered choices were rejected rather than repaired from the artifacts. These are serializer/design observations, not Postgres migration, constraint, privilege or concurrency tests. No runtime modules, dependencies, migrations or database writes changed in Step 1.

Verification: `npm run build` passed, including TypeScript checking; `npm run check:architecture` passed (271 modules, 1,198 imports); the existing stored-bank/flashcard backend contract suites passed all 26 tests. The design-input probe reproduced actual-bank and fixture revisions. Relative document links/ADR-plan anchors, changed/new Markdown whitespace, JSON evidence parsing and protected source byte comparisons passed. Existing Vite chunk-size and Starlette/httpx deprecation warnings remain. No blocking Step 1 design findings remain; implementation acceptance is pending Steps 2–7. Stop before Step 2 under the work-tracking gate.

## Step 2 — Install the locked toolchain and explicit DB lifecycle

- [x] Start from ADR0003's recorded Psycopg binary 3.3.6, SQLAlchemy 2.1.4 and Alembic 1.20.0 baseline. Recheck compatibility/security information at implementation time, resolve under Python 3.14, regenerate production/development locks, and install in a clean environment. Record any intentional baseline revision in ADR0003. Verify binary wheels/imports on native Linux AMD64 and ARM64; no silent source-build fallback.
- [x] Use a synchronous SQLAlchemy engine and its bounded pool only, matching existing synchronous routes. Add `MEDUCATION_CONTENT_SOURCE=json|postgres` and distinct runtime/direct-migration connections; never borrow privileged credentials for API reads. Reject invalid source values or missing DB-mode configuration and redact secrets in errors.
- [x] Implement explicit role/bootstrap operations following ADR0003: NOLOGIN owner, migrator, read-only runtime and backup roles, default privileges and restricted PUBLIC grants. Keep bootstrap credentials out of the API. Specify the restricted importer/activation writer role for L3 operator jobs; reserve authenticated editor use for L4.
- [x] Package an explicit Alembic job/CLI and a Postgres-mode Compose override or equivalent documented invocation. Require DB startup readiness for DB mode while leaving default JSON-only startup independent. Include migration assets in the built package/image and inspect them from the installed image.
- [x] Initialize schema/head/active-content readiness once at API startup; do not auto-migrate/import from workers. Keep recurring liveness/readiness free of SQL. Ensure failed initialization and normal shutdown dispose engines and sessions.

Gate: clean locked installation, least-privilege connection tests and explicit job invocation work; JSON-mode backend tests still pass. Record each platform actually tested.

### Step 2 local result — 2026-10-13

The exact ADR0003 baseline resolved under Python 3.14 and both locks were regenerated,
retaining all existing package versions. Binary-only clean installation and
`pip check` passed on macOS ARM64. The project-root environment was updated from
those locks as well. Native Linux ARM64 API builds install only runtime wheels,
including Psycopg's binary implementation/libpq, and ship Alembic resources from
the existing Python package. ADR0005's migration-resource path was refined to
`backend/src/meducation_api/migrations/` so installed images need no checkout copy.

`meducation-db` provides explicit `bootstrap-local`, `head` and `upgrade` commands.
Bootstrap creates/reconciles the local NOLOGIN owner and four distinct login roles,
restricts PUBLIC permissions and grants future owner-created objects to the backup
role. It refuses unexpected managed-role memberships/schema ownership. The reader
and operator receive no blanket content-table/write/private-function access;
Step 3 grants selected published views/controlled functions. No actual development
database was modified; verification used disposable tmpfs databases only.

Source selection and assigned-role secret URLs fail closed, including credential/
host overrides and nonlocal non-TLS configurations. Runtime uses one pool of size
2 with no overflow; direct operator jobs use NullPool. The engine forces
`gssencmode=disable` so hosted `verify-full` follows the intended TLS path. API
lifespan clears state on failed startup/shutdown and never calls JSON factories
when Postgres mode fails. Existing health routes perform no DB queries.

There is deliberately no product migration head until Step 3, and no Postgres
learner adapter until Step 5. Explicit upgrade refuses the absent head before
connecting. Installed-image verification uses a temporary synthetic Alembic
revision to exercise the packaged environment, future backup grants, text/JSON/
choice-order round trips and transaction rollback. It does not certify product
release constraints, real content import or successful DB learner startup.

[Step 2 evidence](L3-step2-toolchain-evidence.json) records the clean install,
final source/image hashes, native Linux ARM64 toolchain/JSON API smoke results,
versions and limits. The toolchain smoke is integrated into the existing native
AMD64/ARM64 acceptance jobs. The previous L2 CI pass does not cover this change;
native AMD64 execution remains pending, so Step 2's cross-platform checkbox and
overall step stay open. Stop here before Step 3 unless that gate is satisfied or
the user explicitly changes it.

Verification: backend and container-helper Ruff passed; strict backend mypy passed;
all 59 backend tests passed; the installed JSON API smoke passed eight groups;
the real PG17 toolchain smoke passed twelve groups on native Linux ARM64. Build/
TypeScript and architecture checks passed. DB-mode Compose `config --quiet`
passed with synthetic credentials. Canonical/shared-fixture byte comparisons,
relative document links, tracked/new-file whitespace and installed-source hash
checks passed. Task-owned containers/networks were cleaned up. Existing Vite
chunk-size and Starlette/httpx deprecation warnings remain. No local blocking
implementation finding remains; native AMD64 acceptance is an open required gate.

### Step 2 CI/browser follow-up — 2026-10-13

The user reported AMD64 CI passed and ARM64 failed during `learner-2`: the dashboard
stat-card test measured an 8.40625px width difference against its unchanged `<2px`
limit, while the other 42 browser tests passed. No run URL/artifacts were supplied;
this is user-provided CI evidence. The failed ARM64 acceptance run never reached
its later `db-toolchain` command. This follow-up supersedes the earlier AMD64-pending
status; Step 2 stays open pending a passing ARM64 CI rerun.

An isolated fixture/proxy probe reproduced four false failures in 48 samples at
normal, 4x and 8x CPU throttling. Independent card bounds spanned different frames
of the responsive drawer's width animation (largest difference 13.96875px).
Measuring the complete row in one browser task had no failures and a maximum
rounding difference of 0.015625px. [Follow-up evidence](L3-step2-arm64-layout-evidence.json)
keeps these observations separate from the frozen toolchain snapshot.

`e2e/learner-smoke.spec.ts` now obtains all three quiz/flashcard card rectangles in
one `evaluateAll` task, asserts three cards and positive dimensions, and retains
the width/alignment/stacking/overflow checks. No width tolerance, retries, fixed
sleep or application CSS changed. Twenty consecutive corrected layout tests passed
through the real native ARM64 container proxy. Build/typecheck, project lint,
formatting and architecture checks passed. The full container browser suite passed
all 43 cases in 2.2 minutes, and all six proxy smoke groups passed. The isolated
reproduction stack was removed. The original toolchain evidence remains unchanged;
hosted ARM64 acceptance remains pending.

Step 2 closure — 2026-10-13: the user confirmed the tests passed after the browser fix and authorized continuation. Both native CI gates are accepted on that user confirmation; no run URL was supplied. Earlier pending/failure statements and frozen snapshots remain historical. Step 2 is complete.

## Step 3 — Create migrations and transactional content primitives

- [x] Implement the ADR schema in `content`, including releases, version-scoped entities/ordinals, singleton draft, active pointer/publication history, append-only audit events and durable ID allocation/reservations. Add indexes for learner parent lookups and release selection; avoid speculative indexes.
- [x] Implement controlled insert/finalize/activate operations. A release becomes visible only when both banks are valid and complete. Serialize competing activations with a pointer lock and expected-publication precondition; retries must not create duplicate events. Reject activation of incomplete or unknown releases.
- [x] Enforce immutable finalized rows/artifacts and protected audit history with database constraints/permissions/triggers as selected in the ADR. Verify direct SQL through operational roles cannot bypass these guarantees; document the privileged migration/owner trust boundary.
- [x] Seed allocation state atomically on imports. Concurrent reservations cannot collide; replaying an operation with changed payload must fail. Importing known stable IDs into another release preserves identity; attempts to introduce an already-reserved ID for a different new entity must fail under the documented rules.
- [x] Test empty-database upgrade, repeated upgrade, migration head checks, transactional failure and supported schema recovery. Define downgrade policy explicitly: destructive downgrade is refused; use a fresh disposable database for tests, while content rollback activates an old release. A schema rollback must not reset durable IDs or erase authoritative content.

Gate: real PG17 tests prove constraints, immutability, publication atomicity, draft isolation and allocation concurrency. SQLite is not acceptable evidence.

### Step 3 result — 2026-10-13

Implemented packaged head `0001_content` with both SQL resources, release-scoped
entities/global ordinals and parent indexes, immutable finalized TEXT artifacts,
private paired draft, singleton publication pointer, append-only histories,
global operation ledger and durable registry/counters/reservations. Composite
relationships prohibit cross-release references. Finalization validates paired
stored contracts, exact artifacts, both digest algorithms and normalized row
reconstruction before a release can commit. Reader views exclude drafts and
building releases. Operational roles cannot perform arbitrary DML/DDL or invoke
internal helpers; owner/migrator maintenance is explicitly trusted.

Private bound transaction primitives store/finalize, activate, save/reset draft
and reserve IDs. Replay returns original results and rejects changed UUID intent.
Storage and activation can share an atomic transaction; allocations commit in
advance and survive failed apply, reset and rollback. Imports register/seed IDs
atomically; unconsumed reserved IDs require their owning operation and context.
Publication uses a pointer lock and expected sequence, with a fresh event for old
release reactivation. Destructive downgrade is refused; full backup-role restore
and compatible app/schema recovery rehearsal remain Step 6.

Verification: all **58** fixture integration cases passed on real PG17.11,
including empty/repeated migration, direct role attacks, finalization/ordinal/FK
violations, protected history, draft isolation, atomic import/activation failure,
replay/conflict, global order and subject key order, SQL malformed/shared-contract
cases, and concurrent import/reservation/publication/finalization behavior.
The installed non-editable ARM64 image passed all 13 toolchain groups, including
the actual packaged migration and CLI, and the default JSON API smoke. All 18
installed Python/SQL resources matched source hashes; authored banks remained
byte-identical. Verification used unique tmpfs containers and cleaned them up;
no routine database/volume or learner progress was changed.

`npm run verify:full` passed: lint/format and 10 architecture tests, 534 frontend
tests, actual-bank validation, backend Ruff/mypy, 65 normal backend tests (55 PG
cases skipped in the full run and 58 skipped in the final backend rerun; all
58 run separately), learner/admin builds and
41 learner plus 12 admin Chromium tests. `npm run build` also passed. Final audit aligned SQL nonblank checks with Python
whitespace semantics and added three direct-SQL cases for tabs/newlines, Unicode
spaces and control separators. The affected real-PG suite, normal backend checks
and rebuilt installed-image smokes were rerun successfully. Final
backend/container Ruff, changed-Python format, mypy, document-link/anchor,
protected-byte and diff/whitespace checks passed. Existing content-review,
Vite chunk-size and Starlette/httpx advisories remain. An optional broad backend
Ruff format check reports five pre-existing files; all six changed/new backend
Python files pass and no unrelated formatting was applied.

[Step 3 evidence](L3-step3-schema-evidence.json) freezes inputs and compact reports.
Native acceptance now includes the new SQL/fixture suite and hashes its inputs
on both architectures, but new Step 3 AMD64/hosted CI execution is not claimed.
Step 2's passing CI is user-confirmed historical evidence. Actual-bank import,
exports, DB learner adapters and full real-content recovery remain Steps 4–6;
JSON stays authoritative. No blocking Step 3 findings remain. Stop before Step 4
at the agreed stage gate.

## Step 4 — Import and export canonical paired banks

Implementation checkpoint — 2026-10-13: user authorized continuation, noting that
usage limits may interrupt work. New `db/transfer.py` captures both input files
once, runs strict stored validation plus the repository TypeScript rich-content
gate on private captured copies, imports with source hashes, and independently
reconstructs selected finalized releases for exact artifact/digest comparison.
The CLI now exposes validate/import, explicit activation and export into a new
directory with an external manifest. Implementation is in progress; integration,
CLI failure/replay tests, documentation and completion evidence remain pending.
Do not mark Step 4 done on this checkpoint alone. JSON authority is unchanged.

- [x] Add an explicit paired-file validation/import command using existing stored validators and cross-bank subject checks. Run the repository content validator as part of the documented import workflow; record any Python/TypeScript validation-policy gaps and required cross-runtime cases instead of claiming the current Python loader enforces every authoring rule.
- [x] Validate both captured inputs before content mutation. Preserve exact strings, rich formatting, numeric values, choice order, source/verified answers, rationale metadata, sparse fields and global collection order. Hash the captured inputs, not files reread after validation. Reject invalid/null/unknown fields according to the stored contracts.
- [x] Import rows, serialized artifacts and provenance in one transaction. A failed import must leave no partial release, active-pointer change or misleading success audit. Deterministically identify duplicate paired input, compare its content, and reuse the existing release. Repeated import without activation must not create publication events.
- [x] Make activation explicit, with an expected-publication precondition and a recorded operator/reason. Importing a previously seen pair must not silently roll back the active release. For first startup, document the explicit import-and-activate sequence.
- [x] Export a selected release into new files with an external manifest containing release identity, schema versions, digests and publication context. Reconstruct from normalized data and compare against the immutable artifacts. Never overwrite authored banks by default or add manifest fields to their schemas.
- [x] Add fixture cases for Unicode, math/Markdown, escaped/newline strings, reordered object keys, omitted fields, verified answers, empty decks, and nontrivial global/parent order. Test invalid second-bank input, injected mid-import failure, duplicate/concurrent import and source files unchanged after success/failure.

Gate: import/export round trips preserve both banks and existing hashes; failure and retry behavior are proven on real Postgres. JSON remains authoritative.

### Step 4 result — 2026-10-13

Added explicit `validate-pair`, `import-pair`, `activate` and `export-release`
operator commands. Both files are read once with a 64 MiB per-file limit;
strict Python stored validation precedes the existing TypeScript stored/domain/
Markdown/flashcard gate on private captured copies. The original bytes supply
source hashes and preserved raw shape supplies TEXT artifacts. Validation/import
requires a checkout with Node dependencies; the learner image gains no Node.
No database content mutation occurs before both validators pass.

Import commits rows/artifacts/provenance/audit in one transaction and never
activates. Exact operation replay returns the original result; identical paired
content reuses its finalized release. Explicit activation requires a separate
operation UUID, actor/reason and expected publication sequence. Existing Step 3
rollback/concurrency contracts remain intact. Export reads normalized rows and
ordinals independently, compares typed values/key sets/array order, uses artifact
object key order only as a template, and verifies exact bytes plus both digests.
A read-only repeatable snapshot supplies the external manifest's publication
context. Existing output directories are refused; ordinary write failure cleans
only the new output. Manifest-last completion and process-crash residue are
explained in the runbook.

All **64 real-PG17 fixture cases** passed, including six file/CLI integration
cases covering rich-policy rejection, Unicode/math/Markdown/newlines and escaped
strings, reordered subject keys, source and verified answers, optional/empty
fields, empty decks and global order across different parents. Captured inputs
remain usable after original files change; concurrent imports reuse one release.
Injected failure after row creation rolls back release/audit and leaves the active
pointer unchanged. Re-import/export preserves artifacts and hashes. Corrupt rows
fail without template repair; existing output and interrupted writes are protected.
CLI validates/imports/replays/activates/rejects stale activation/exports end to end.

Normal backend tests passed **76 cases**, with 64 PG cases skipped there and run
separately. The two normal cross-runtime capture cases require `npm ci` and
explicitly skip without it; native container acceptance supplies Node and tests
that gate. Ruff, mypy (17 source files), changed-Python format, frontend
lint/architecture (272 modules/1,203 imports), format and `npm run build`
(typecheck included) passed. Captured canonical-file validation passed with the
existing **32 review warnings**, without importing either actual bank. The native
ARM64 installed-image migration and default JSON API smokes passed; all 19
packaged Python/SQL resources matched source. Canonical banks and prior frozen
snapshots stayed byte-identical; only disposable tmpfs PG containers were used.
Relative doc links/anchors, changed/new whitespace, JSON evidence and diff checks
passed. Existing Vite/Starlette/content-review advisories remain.

[Step 4 evidence](L3-step4-transfer-evidence.json) records hashes, commands and
reports. TypeScript adds rich-policy and trimmed review-note checks that Python/
SQL do not fully implement; their intersection is required for file import, and
L4 must provide backend authoring policy parity before browser writes. No new
native AMD64/hosted CI execution or comprehensive actual-bank DB/API/restore
parity is claimed. Learner Postgres mode still refuses until Step 5 adapters;
JSON remains authoritative. No blocking Step 4 findings remain. Stop before
Step 5 at the agreed stage gate.

## Step 5 — Serve both repositories through a consistent release view

Step 4 CI follow-up — 2026-10-13: user reported the most recent GitHub push/build
passed and authorized continuation. Accepted as user-confirmed native CI evidence;
no run URL was provided. Frozen Step 4 local evidence remains unchanged.

Implementation checkpoint: paired JSON/Postgres source/view composition and
release-pinned reader adapters are being implemented. New sources use a single
shared reader engine, bounded release-keyed catalog cache and one publication
selection per content response. Integration/API/race/failure/lifecycle checks and
completion evidence remain pending. JSON authority remains unchanged.

- [x] Implement Postgres adapters for every method of `QuestionBankRepository` and `FlashcardCatalogRepository`. Keep storage details below the existing route/domain contracts; avoid separate engines for quiz and flashcard data.
- [x] Replace the path-only app factory seam with an injectable paired source/view abstraction usable by JSON, Postgres and test fakes. Remove process-lifetime subject snapshots from route composition; obtain subjects and all derived summaries from the same selected release.
- [x] Select the active pointer/publication sequence once per content request initially. Cache only immutable release-scoped data, with bounded cache retention; pointer changes select the new view immediately on the next request without background polling. L5 may optimize request-driven freshness after measuring it.
- [x] Preserve all existing DTOs, omitted fields, derived counts/ordered membership, revision query and If-Match conflicts, ETags/304, no-cache responses and current 404/error precedence. Do not replace public content revisions with release IDs or publication sequences.
- [x] Translate DB failures to intentional unavailable responses without exposing credentials/SQL or falling back to old files. Check resource cleanup after success, conditional responses, missing entities and exceptions; ensure worker startup/shutdown does not leak connections.
- [x] Test activation during response construction: the response must contain only the old or new complete release, never a mixture. Test shared-subject changes affecting the flashcard digest and reactivation of an old pair refreshing internal publication state while retaining its original content hashes.

Gate: fixture-based contract tests pass unchanged in meaning for both adapters; consistent releases and cache invalidation do not require restarting the API.

### Step 5 result — 2026-10-13

Implemented both reader repository protocols over one response-scoped connection.
`repositories/source.py` owns paired source/view composition and JSON startup
loading; `repositories/postgres.py` owns release-pinned readers and bounded
catalog caching. `main.py` injects the view for complete synchronous response
construction and releases it before sending the response. Subjects/catalogs and
bodies come from that view rather than a process-lifetime subject snapshot.
Legacy JSON path factories remain available for existing tests; a paired
`source_factory` supports injected sources.

Postgres selects the active pointer, publication sequence and both content hashes
once per content request. Every catalog/body query filters by the pinned release.
Only immutable subject/quiz/deck/membership catalogs are cached by release; the
two latest observed publication sequences' release entries are retained. Returned
models are copies and ordered membership IDs are copied into lists. In-flight
views keep evicted catalogs; bodies remain normalized SQL reads. There is no
active-pointer cache or SQL polling, so publication/reactivation is observed by
the next request, including a repeated old digest. DB failures return sanitized
`content_unavailable` 503 even with an old cached ETag/catalog. Startup still
requires schema/head/active release, never migrates/imports or falls back. Health
uses initialization state without SQL; failed startup/shutdown disposes the engine.

All **78 real-PG17 cases** passed. New cases exercise every protocol method and
all seven learner endpoints against identical JSON fixtures, exact DTO optional
fields and answer provenance, counts/ordered membership, ETag/no-cache/304,
revision and If-Match conflicts, existing 404 precedence and empty decks.
Publication during body construction returns one old release; the next request
sees new quiz/subject/flashcard revisions. Bounded cache eviction leaves pinned
views intact, protects returned models from mutation, and observes old-release
reactivation with new sequence/original hashes. Catalog/body/connect failures
return 503, release connections and recover after the fault is removed. Health
queries cause no SQL even during outages. Three DB-independent paired-source
injection tests verify cleanup for success/304/404/409, unavailable and unexpected
payload exceptions.

`npm run verify:full` passed: lint/format and 10 architecture tests, **534**
frontend tests, actual canonical content validation, Ruff, mypy (19 source files),
**79** normal backend tests (78 PG cases skipped there and passed separately),
typecheck, learner/admin builds, **41** learner and **12** admin Chromium cases.
`npm run build` also passed. Installed-image toolchain and default JSON API smokes
passed on native ARM64; all **21** packaged Python/SQL resources matched source.
Canonical banks and prior frozen snapshots remained byte-identical. Relative
links/anchors, new/changed whitespace, evidence JSON and diff checks passed.
Only disposable fixture containers were used and cleaned; routine DB/volumes
and browser progress were untouched.

The first full run stopped at one existing flashcard lazy-study timing assertion
while PG/image jobs ran concurrently (533 frontend passes). A fresh full rerun
after those jobs completed passed without changing UI/test assertions; unexecuted
steps of the first run were not counted as passes. The initial PG launch's
automatic approval review timed out without a safety finding; its permitted retry
and final PG run passed. Existing content-review, chunk-size and Starlette/httpx
advisories remain.

[Step 5 evidence](L3-step5-reader-evidence.json) freezes inputs and compact reports.
Step 4 latest GitHub build is user-confirmed; new Step 5 native AMD64/hosted CI is
not claimed from local ARM64 results. Comprehensive actual-bank parity,
Postgres-mode reverse-proxy/browser acceptance and backup-role restore remain
Step 6. JSON remains authoritative/default, with no authoring/authority cutover.
No blocking Step 5 findings remain. Stop before Step 6 at the agreed stage gate.

## Step 6 — Prove actual-bank, browser and recovery parity

- [ ] Parameterize the fixture repository/API contract suite over JSON and real PG17, covering every learner endpoint and 200/304/404/409/unavailable behavior. Add actual transaction/connection failure cases; ordinary unit tests remain fixture-based and DB-independent where possible.
- [ ] Add a separate actual-bank parity command targeting an explicitly disposable database. Compare every reconstructed record/optional field, all collection and choice order, relationship/count/membership summaries, both revision hashes, and every learner route for all applicable subjects/quizzes/decks. Produce a compact report with input hashes and exact mismatch paths; do not hard-code current authored counts into normal tests.
- [ ] Run the learner/progress-backup browser flows through the existing real reverse proxy in Postgres mode. Show that importing unchanged content and switching backends does not force active quiz/checkpoint restart or rescore completed history. Use fixture changes to verify existing changed-content conflict/restart behavior.
- [ ] Extend PG17 dump/restore rehearsal to real content/schema using the backup role and restore into a fresh isolated database with deliberate ownership/ACL setup. Check migration head, draft/audit/allocation state, active publication and full content/API parity after restore. Source database and authored JSON remain untouched.
- [ ] Add CI PG17 integration coverage with explicit migrate/import/test sequencing, isolated databases and cleanup. Extend native AMD64/ARM64 container acceptance to the new dependencies, migrations and DB-backed smoke; do not duplicate all expensive browser checks unnecessarily. Keep default JSON jobs independent of a DB.
- [ ] Document exact implemented commands in backend setup, testing guidance and the container runbook, including initialization, re-import/explicit activation, parity, export, restore and pre-cutover JSON fallback. Existing volumes require explicit role/migration operations; editing initialization files alone is insufficient.

Gate: actual canonical parity, fixture/browser acceptance, real-content restore and both native-platform checks have recorded evidence. Missing Docker/platform/CI evidence remains an open gate, never an implied pass.

## Step 7 — Final verification and L4 handoff

- [ ] Run `npm run verify:full` and `npm run build`, plus the new PG17 integration, actual-bank parity, restore and container checks. The existing full verifier does not currently run those new checks; wire them deliberately or list separate commands/results. Run backend Ruff/mypy/pytest and affected operational-script lint through the documented gates.
- [ ] Verify protected canonical files are byte-identical, localStorage contracts are unchanged, learner artifacts still omit admin content, default JSON startup works, DB mode fails safely without initialization, and worker startup never runs migrations.
- [ ] Review the implementation against every L3 checkbox in the parent tracker. Update architecture/schema/content-management docs with the implemented read-mode mapping while explicitly retaining JSON authority. Record commands, source/input hashes, migration head, native platform evidence and limitations in this tracker and supporting evidence files.
- [ ] Handoff to L4: draft schema/revision rules, reservation operation contract, paired validation gaps, activation/publication events, protected audit/immutability behavior, operator role boundaries, deterministic exports and restore commands. The browser admin's current max-ID helpers remain confined to authoritative JSON authoring in L3; L4 must replace them before DB-backed authoring is enabled.
- [ ] Retain outstanding L1 Firefox/mobile/accessibility and deployment-only acceptance in their existing trackers. Do not count L3 database checks as evidence for hosted auth, TLS, suspend/wake, capacity, or production recovery retention.
- [ ] Only after relevant checks pass, mark L3 complete in the parent and move this tracker/supporting evidence to `docs/work/done/`, updating links. Stop before L4's authoring/authority cutover.

Gate: local Postgres serves the current learner without content drift or gratuitous attempt invalidation; implementation and operational evidence are reviewable, and L4 begins with explicit boundaries.

## Progress and verification log

- [x] Inspected the L0/L2 decisions and completed work, current L3 scope, backend repository/revision/lifecycle code, Compose setup, schema and testing guidance.
- [x] Prepared this staged implementation plan and linked it from the parent tracker.
- [x] Step 1 — ADR and contracts.
- [x] Step 2 — Dependencies, roles and lifecycle: local checks and user-confirmed CI passed after the browser fix.
- [x] Step 3 — Migrations and transactional primitives: 58 real-PG17 cases, installed-image/JSON smokes and full verification passed.
- [x] Step 4 — Paired import/export: 64 real-PG cases, 76 normal backend tests, captured canonical validation, installed-image smokes and build passed.
- [x] Step 5 — DB adapters and API release consistency: 78 real-PG cases, 79 normal backend tests, installed-image smokes and full verification passed.
- [ ] Step 6 — Parity, browser, recovery and CI evidence.
- [ ] Step 7 — Final verification and handoff.

Planning verification — 2026-10-13: all 16 relative link targets resolved; tracked diff and new-plan whitespace checks passed; `npm run build` passed, including TypeScript checking, with the existing Vite chunk-size advisory. No migrations, dependency changes, database writes or runtime implementation occurred during plan creation.

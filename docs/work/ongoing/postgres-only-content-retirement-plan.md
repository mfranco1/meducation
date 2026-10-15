# PostgreSQL-only quiz and flashcard content

Date: 2026-10-15. Planning baseline: `c9a7154`.

Status: implementation plan prepared; implementation has not started. The user
requested this plan, not execution of the retirement. Keep this tracker in
`ongoing` until the implementation and its acceptance gates pass.

## Outcome and scope

Retire the repository quiz/flashcard databases and every selectable file-backed
application workflow. PostgreSQL must be the only durable authority and runtime
content source for shared subjects, quizzes, questions, decks, and flashcards.
Normal content CRUD goes through the authenticated HTTP editor and PostgreSQL;
public reads go through the existing PostgreSQL-backed learner API.

This is removal of obsolete infrastructure, not a content migration. Do not
import the old banks into the current database. Preserve current database-only
edits, draft/history/publication state, stable IDs, allocation lineage, exact
authored strings and formatting, collection/choice order, optional-field presence,
and provided versus verified answers. Saving remains distinct from publication.

Retain browser-local learner progress and its backup/restore features. Retain
domain rules, API contracts, schema/validation/rendering policies, authorization,
and the existing local PostgreSQL authority. No cloud service, backend progress
storage, schema redesign, runtime AI, or public identity rollout is included.

### JSON that is still legitimate

The retirement removes JSON **databases and file-authoring workflows**, not JSON
as a serialization format:

- API request/response JSON and the admin's content-only JSON input remain.
  Previewing text locally is allowed; only a successful PostgreSQL-backed receipt
  establishes a saved edit. New durable IDs come from server reservations.
- Small synthetic JSON fixtures remain test inputs. Integration/browser tests
  load them explicitly into disposable PostgreSQL; production code/images cannot
  select those fixtures as a runtime source.
- PostgreSQL-derived paired exports, manifests, validation/audit reports, full
  database dumps, and allocation journals remain recovery/inspection artifacts.
  They are never mounted or bundled as an alternative learner/editor database.
  Keep the existing paired HTTP export as a read-only database export, clearly
  labelled with draft/release identity; remove legacy per-section file replacement
  exports and change-set import/replay UI.
- Privileged, reviewed recovery/migration import jobs remain explicit database
  maintenance. They write only to PostgreSQL and never run on application startup.
  They do not become an alternate routine authoring path. Retained export format
  compatibility must survive removal of the similarly named repository files.

## Findings from the current implementation

- `src/content/questionBank.generated.json` is 16,456,246 bytes and
  `src/content/flashcardBank.generated.json` is 653,579 bytes: **17,109,825 bytes
  total (17.1 MB / 16.3 MiB)** of tracked bank data.
- `ops/content-authority.json` designates the existing
  `meducation_authority` database in `meducation-authority-postgres`, persisted in
  `meducation-authority-data`, at loopback port 5433. The local launcher explicitly
  requires PostgreSQL. Generic settings still default to JSON, so changing only
  the local launcher would leave other supported entry points behind.
- `src/content/api/runtimeQuestionBank.ts` and `runtimeFlashcardBank.ts` select
  bundled local adapters with `VITE_CONTENT_SOURCE=local`. Their `configureLocal`
  APIs also support bypasses. `src/main.tsx` and `src/qa/ContentQaPanel.tsx` expose
  another bundled-bank path through the development content-QA route.
- `AdminApp.tsx` can select `LocalAdminApp.tsx` through fixture flags.
  `HttpQuestionBankGateway` already reserves IDs and saves paired drafts over
  HTTP, but extends `InMemoryQuestionBankGateway`. `AdminWorkspace` takes that
  concrete in-memory type and branches on the HTTP subclass. The panel/controller
  retain local history, import/export, and file-replacement behavior. Removing the
  in-memory class without separating those responsibilities would break HTTP CRUD.
- `backend/.../settings.py`, `main.py`, and `repositories/source.py` retain file
  defaults, JSON repository factories, and `JsonContentSource`.
  `repositories/question_bank.py` mixes JSON adapters with shared validated
  models/protocols still needed by PostgreSQL: do not delete that whole module.
- `db/parity.py` currently starts a JSON-reference API to compare PostgreSQL
  responses. Replace this oracle before removing the service mode; checking only
  that the same exporter agrees with itself would weaken parity coverage.
- `validate:content`, `audit:explanations`, global Vitest bank mocks, some unit
  tests, standard learner Playwright setup, and the standard admin Playwright
  suite depend on file-backed banks. The separate HTTP editor container harness
  already seeds disposable PostgreSQL and provides a useful migration pattern.
- `backend/Dockerfile` ships both full banks, while base `compose.yaml` relies on
  JSON defaults. Container smoke/parity/load/rollback tooling still uses archive
  paths. Learner/admin image audits already reject bundled banks in the frontend.
- Current owner docs contain contradictory legacy sections even where their
  opening paragraphs identify PostgreSQL authority. They need coherent rewrites,
  not another disclaimer above obsolete instructions.
- Root `content/` is ignored historical extraction/review material, not tracked
  runtime content. It is approximately 19 MiB on this machine and includes source
  provenance; deleting it would not reduce Git checkout size. Original PDFs,
  private sources, protected backups, journals, and frozen historical evidence
  are not disposable runtime banks.

## Implementation stages

Each stage must leave its affected checks runnable. Use small reviewable commits;
do not create PRs or deploy as a side effect of this plan. Replace a dependency
before deleting its provider. Temporary compatibility between stages must be
removed before final acceptance.

### 0. Capture current authority and dependency baselines

- [ ] Inventory tracked bank references, runtime selection flags, local-adapter
  imports, file-replacement instructions, test runners, fixtures, Docker copies,
  and scripts. Classify each as remove, rewrite, or retain with a stated reason.
  Include `package.json`, all Playwright configs, `.github/workflows/checks.yml`,
  `scripts/testing/verify-full.mjs`, artifact audits and architecture rules.
- [ ] Capture a fresh protected online backup with the existing `backup.py`.
  Record draft revision/digests, current publication/release identity, ordered
  inventories and exact paired exports for the current draft and published pair.
  Keep private content/credentials out of Git and CI evidence. Validate exports
  using the existing explicit export tools; never substitute repository archives.
- [ ] Confirm available retained recovery evidence and preserve allocation fence,
  current local journals, credentials and auth epoch. Do not run the offline
  `verify-backup.py` against routine writers merely to collect a baseline; its
  documented writer-retirement procedure is a separate recovery operation.
- [ ] Measure fresh learner/admin builds, raw and compressed asset sizes, backend
  image contents/size and tracked source footprint. Record build mode and commit.
  Existing `dist` is not a comparable baseline without a fresh build.

Gate: the current authority is identified and recoverable; private baseline
artifacts exist outside the bank files scheduled for deletion. No authoritative
write/import, database reset, or volume recreation occurs during inventory.

### 1. Establish PostgreSQL-backed test infrastructure and parity

- [ ] Extract/reuse the isolated PG17 setup from
  `scripts/containers/fixtures/editor_http.py`, `smoke-admin-http.py`, and existing
  database integration harnesses. Use synthetic content, dedicated credentials,
  schema/bootstrap jobs and unique owned targets. Tests must reject the designated
  authority/container/volume and clean up only their own resources, including on
  failure. Never source `var/local-authority/*.env` in a test runner.
- [ ] Provide reproducible learner and authenticated admin test startup with
  separate reader/editor/session/operator/migrator roles as needed. Test seeding
  and synthetic identity controls must remain outside shipped application code.
- [ ] Replace global generated-bank mocks and transitive local-adapter imports
  with explicit small fixtures or mocked HTTP DTOs in unit/component tests.
  Replace tests using `configureLocal` with transport fixtures or test-owned
  repositories implementing existing domain contracts. Do not leave a production
  file-source hook simply to support tests.
- [ ] Replace JSON-reference-server parity with explicit fixture expectations for
  every learner route plus captured-export comparisons of exact authored fields,
  ordering, optional presence, provenance, revisions and serialized bytes. Keep
  independent expected digests/contract cases and HTTP conditional assertions.
  Continue selected-release verification using explicit protected DB exports.
- [ ] Migrate JSON-adapter tests into retained schema/protocol/serialization tests
  or real PostgreSQL behavior tests. Delete tests only for behavior intentionally
  removed; preserve the underlying regression coverage.

Gate: disposable PostgreSQL tests cover learner delivery and paired editor writes
without reading either full repository bank. Normal unit suites stay independent
of live database credentials. Required integration jobs fail rather than quietly
passing when PostgreSQL is unavailable or database tests are skipped.

### 2. Make all admin content workflows HTTP/PostgreSQL-only

- [ ] Make `AdminApp.tsx` load only `HttpAdminApp.tsx`; remove `LocalAdminApp.tsx`
  and the JSON fixture editor selection flags. Retain independent admin build
  inclusion and API authorization; rendering admin assets grants no write access.
- [ ] Replace the `InMemoryQuestionBankGateway` inheritance/concrete workspace
  dependency with the smallest HTTP-owned gateway contract. Keep pure draft
  transformation, cloning, validation, ordering and preview helpers where useful.
  Remove the production in-memory persistence/history implementation once its
  consumers have moved; test doubles must live only in test-owned code.
- [ ] Simplify `AdminWorkspace`, `useAdminEditor`, and `FlashcardAdminPanel` to one
  save/undo/reset path. Remove optional callbacks/branches that can accept edits
  as saved only in memory, legacy file downloads, file replacement manifests,
  change-set file import/replay controls and local-only history/export status.
  Do not remove operation compilers still required for bulk or record editing.
- [ ] Preserve single and bulk creation/editing, shared subject management,
  parent changes, sibling ordering, single/selected/cascade deletion, search,
  pagination, validation diagnostics, dirty-text retention and navigation guards.
  Each durable mutation must await a PostgreSQL-backed server receipt; refresh
  both sections from the accepted paired snapshot after commits/Undo/reset.
- [ ] Keep server-reserved IDs, hierarchical parent bindings, allocation admission,
  preview fingerprints, operation identity/reconciliation, and concurrency guards.
  UI temporary IDs are not durable IDs. Reauthentication must not replay a write.
- [ ] Preserve server paired Undo/reset, explicit reviewed publish, retained-release
  activation without overwriting the current draft, release history and the
  read-only paired HTTP export. Replace residual Stage/export-as-save copy with
  accurate Preview/Save draft/publish state where applicable.
- [ ] Move the existing admin browser regressions from
  `e2e/admin/flashcard-admin.spec.ts` to the HTTP/PostgreSQL suite. Retain desktop,
  narrow-screen, keyboard, focus and unsaved-text coverage. Exercise an enabled
  production admin build as well as development startup.

Gate: complete CRUD for subjects/quizzes/questions/decks/cards, including bulk
and paired cascades, passes against disposable PostgreSQL. Saved data survives
page reload and API/container restart, with file-backed sources absent. A new
session can read it. Unpublished edits do not reach learner APIs.

### 3. Remove learner offline and bundled QA sources

- [ ] Remove `VITE_CONTENT_SOURCE=local` branches and production `configureLocal`
  paths from both runtime loaders. Keep HTTP loading/caching, progressive
  catalogs, request cancellation, retry/error states and freshness checks.
- [ ] Remove the bundled `/#content-qa` bootstrap and `ContentQaPanel` after
  retaining rich-content inspection regressions in existing API/browser tests.
  Do not introduce a replacement standalone content source.
- [ ] Delete `src/content/local` adapters after relocating any genuinely shared
  types/pure helpers into their owning schema/domain/content modules. Reuse
  `src/admin/core/flashcardSerialization.ts` where appropriate; do not move
  admin-owned utilities into learner imports or duplicate revision algorithms.
- [ ] Remove obsolete source-selection variables/types/examples. Reject explicit
  legacy local/JSON mode configuration with an actionable migration error at
  build/startup instead of silently honoring it or falling back.

Gate: quiz and flashcard catalogs/bodies load only through API requests. API/DB
failures show existing recoverable errors and never load archived content.
Already loaded in-memory content may retain its current documented behavior;
there is no disk-based alternative bank. Learner progress formats remain intact.

### 4. Remove backend JSON runtime service mode

- [ ] Make `Settings` and `create_app` PostgreSQL-only. Remove bank-path defaults,
  JSON mode dispatch, public JSON repository factories and `JsonContentSource`.
  Missing/misconfigured reader URL must fail safely without secrets in errors.
  A temporarily accepted `MEDUCATION_CONTENT_SOURCE=postgres` compatibility value
  may ease staged changes; the final configuration must have no mode selector.
  Explicit legacy JSON/path settings should produce a clear rejection.
- [ ] Separate shared validated models, repository protocols and DTO construction
  from the file adapters in `repositories/question_bank.py`. Retain what
  `repositories/postgres.py`, validation, authoring, recovery and export need;
  remove `JsonQuestionBankRepository` and `JsonFlashcardCatalogRepository`.
  A test source double must not become an environment-selectable runtime backend.
- [ ] Remove JSON branches in diagnostics and other services. Preserve request-
  pinned paired publication, revision/ETag contracts, strict initialization,
  schema validation, bounded caches, cleanup/reconnect and readiness semantics.
  Runtime startup must never bootstrap, migrate, import, or create an authority.
- [ ] Preserve the existing database permission split and authenticated authoring
  boundary. Reader credentials cannot edit; no privileged URL fallback is added.

Gate: all supported API launch paths require PostgreSQL; invalid credentials,
missing schema/publication, outages and corrupt data fail explicitly without
consulting files. Auth/session/CSRF/freshness and concurrency tests still pass.

### 5. Retire file maintenance and archive-only operational workflows

- [ ] Replace `validate:content` and `audit:explanations` scripts that import local
  banks. Provide explicit commands for synthetic fixture validation in CI and
  authoritative content validation/audit through a pinned DB draft/release export
  produced by the existing HTTP/operator paths. A no-target command must fail
  with usage, never silently choose an archive or developer's authority.
- [ ] Update every caller in package scripts, full verification, browser configs,
  CI, docs and container helpers in the same stage. Reports must identify the
  selected draft/release and captured digests; exported artifacts cannot claim
  database currency without an explicit comparison to current DB context.
- [ ] Retain `validate-paired-files.ts`, packaged content policy, deterministic
  serialization and export validators where required for server validation or
  reviewed recovery. They must take explicit input paths, with no bank defaults.
- [ ] Retire one-use `cutover.py`, `finish-cutover.py` and initial-archive
  `check.mjs` once their only active references are removed. Replace routine
  health guidance with DB/API/editor checks; historical evidence remains frozen.
- [ ] Retain and update `serve.py`, `job.py`, `backup.py`, `verify-backup.py`,
  allocation journals and full recovery procedures. Replace every parity/recovery
  default that selects repository banks with an explicit DB-derived export or
  synthetic fixture. No new export is written into `src/content`.
- [ ] Audit root `content/` reports/extractions and source-material references.
  Remove obsolete tracked generators/report references where justified. Keep
  ignored private originals/provenance and protected recovery files separately;
  they are not a runtime source and are not swept by an automated JSON deletion.

Gate: no active maintenance/acceptance command requires the deleted files or
serves JSON as application content. Current-content checks and CI fixture checks
have separate, truthful targets. Full PostgreSQL restore/recovery remains usable.

### 6. Make packaging and standard verification PostgreSQL-only

- [ ] Remove bank `COPY` directives and bank-path environment variables from
  `backend/Dockerfile`; narrow policy-build copies where useful. Remove obsolete
  frontend flags and update `.dockerignore`, image audits and audit tests.
  Preserve packaged validators, read-only/non-root images, role separation and
  learner/admin asset isolation.
- [ ] Make base Compose require an explicit PostgreSQL reader configuration,
  with an optional owned disposable development DB setup. Retire/merge the
  old JSON/postgres override split. Do not silently attach the designated
  authority volume to a new service or create another routine content authority.
  Continue supporting the existing local launcher and explicit production DB
  connection/routing configuration; document migrations as separate operator jobs.
- [ ] Rewrite JSON-only API/learner/static-admin/policy smoke tests and archive
  load/resilience/rollback paths under `scripts/containers`. Use seeded disposable
  PostgreSQL for runtime tests and explicit artifacts for transfer/recovery tests.
  Update acceptance hashes, audit expectations, release-input tests and fixtures.
  Recovery rollback must not reactivate a JSON content backend or rewind the
  designated authority. Historical rollback images may be exercised only in
  isolated recovery compatibility tests, never offered as current service mode.
- [ ] Make `playwright.config.ts`, `playwright.admin.config.ts`,
  `playwright.admin-http.config.ts`, progress-backup/container configs, CI and
  `verify-full.mjs` agree on PostgreSQL fixture lifecycle. Consolidate duplicated
  admin runners while retaining all relevant coverage. Build learner/admin
  outputs and run their browser suites sequentially because they share `dist`.
- [ ] Require real PostgreSQL CRUD/learner tests in CI, not only mocks or skipped
  database tests. Reuse PG17 pinning and native AMD64/ARM64 container jobs. No
  production/private content, credentials or exports become CI inputs/artifacts.
- [ ] Extend architecture/artifact guards to reject production local-bank
  imports, file adapters, offline selectors and shipped corpus/test fixtures.
  Keep independent negative regression cases, even if those mention retired
  filenames in synthetic test graphs. Check full content is absent from chunks,
  maps, manifests, public files and backend image layers, not just entry imports.

Gate: a fresh clone builds and runs the documented PostgreSQL setup without the
two files. Both image variants and the API contain no bundled quiz/flashcard
corpus; required CI exercises the replacement workflow end to end.

### 7. Delete banks, reconcile documentation, and accept the retirement

- [ ] Delete both `src/content/*.generated.json` banks once preceding consumers
  are replaced. Add no copies under another tracked path, encoded module, public
  shard, fixture corpus, generated cache, or shipped archive. Run final verification
  with those files physically absent, not just ignored by the selected mode.
- [ ] Update `AGENTS.md`, `README.md`, `backend/README.md`, `.env.example`,
  `backend/.env.example`, `ops/containers/.env.example`, `ops/content-authority.json`,
  `.prettierignore`, and relevant package/config comments. State PostgreSQL-only
  runtime, HTTP CRUD, explicit operator recovery, and no offline source.
- [ ] Rewrite active sections in `docs/architecture.md`, `product.md`,
  `question-schema.md`, `flashcard-schema.md`, `content-management.md`,
  `testing.md`, `testing-regressions.md`, `local-authoring.md`,
  `local-containers.md`, `L4-http-editor.md`, `L4-authoritative-recovery.md`,
  `L6-deployment-handoff.md`, and `ops/containers/README.md`. Include fresh-clone
  setup, startup failure, CRUD/publication, backup/restore, fixture tests and
  validation commands. Stored-bank representations are contracts, not files to edit.
- [ ] Record a short superseding architecture decision for retirement of source
  selection/file authoring; link superseded decisions without rewriting their
  historical implementation evidence. Update affected ongoing trackers where
  needed; do not rewrite completed trackers or frozen snapshots to appear current.
- [ ] Review repository-local skill guidance that still assumes read-only JSON
  services/local adapters; update it to current contracts so later work does not
  revive retired modes. Inspect broader tooling references before deleting helpers.
- [ ] Reconcile pre/post authority inventories, exact paired bytes and digests,
  draft/history/publication identity and allocation state. Use read-only checks
  against the routine authority; run destructive CRUD/restart/recovery tests only
  against owned disposable targets. Account for legitimate concurrent user edits
  explicitly rather than overwriting them to match an earlier baseline.
- [ ] Run the completion audit, attach evidence/results and final size comparison,
  and move this tracker to `docs/work/done` only after all in-scope gates pass.

## Required acceptance evidence

### Admin CRUD and durability

For each of shared subjects, quizzes, questions, decks and cards, test create,
read, update and delete through the HTTP admin against PostgreSQL. Include single
and bulk additions, parent references/moves, sibling order, choice order,
provided/verified answers, exact rich-text bytes, optional fields, partial failures
and cancellation. Test multi-selection and shared-subject cascades atomically
across both banks, paired Undo/reset, and no changes after invalid/stale previews.

After successful Save draft, reload the page, sign in with a new session, and
restart compatible API/DB containers in the disposable environment while retaining
their test data volume. Verify saved content and history persist. Confirm the
learner still sees the old publication; publish explicitly and verify both
learner sections see the new paired release. Activate an older retained release
and verify publication changes without losing newer drafts/history.

Exercise server ID reservations for new parents and children, burned/abandoned
reservations and allocation-fence denial. Cover conflict, timeout after a commit,
duplicate operation ID, explicit reconciliation, session expiry, stale assurance,
authorization/CSRF/origin denial and preserved unsaved text. Never repeat an
uncertain write automatically. Database failure must not report a local save.

### Learner and data contracts

Verify progressive quiz/flashcard catalogs, launch/resume, both quiz scoring modes,
Browse Answers, flashcard open/flag/finish, publication freshness, paired shared
subjects, ETags/304/409/404, timeout/retry/cancellation and recovery. Preserve
browser progress/checkpoint/history and accepted-engine progress backup/restore.
Test current API failure and DB failure with no local-source request/fallback.
Keep rich Markdown/KaTeX/sanitization/mobile regressions and local font assets.

Validate the actual selected database draft/release through protected explicit
exports in addition to synthetic fixture tests. Compare independent expectations,
ordered IDs, every authored field, absent versus present optional fields,
deterministic digests/serialization, and unchanged source/verified answer meaning.
Retain full-backup restore, roles/ACLs, session quarantine, allocation journal
reconciliation and compatible worker/cache checks in disposable recovery targets.

### Commands and execution requirements

The implementation must update these entry points and document their final
arguments before calling them passing:

- `npm run lint`, `npm run format:check`, `npm run test:architecture`,
  `npm run test:ci`, `npm run typecheck`, and `npm run build`.
- `npm run build:learner` and `npm run build:admin`, with fresh manifest/map-based
  artifact audits; learner output omits admin, optional admin output uses HTTP only.
- Replacement fixture validation and explicit authoritative validation/audit;
  `npm run build:content-policy`; backend Ruff, mypy and pytest. Run Ruff on
  changed container/local-authoring helpers as well.
- Real PG17 schema/CRUD/reader contracts, paired export/reconstruction parity,
  disposable retained restore and relevant resilience/load/rollback checks.
- Fresh learner browser suite, accepted Chromium/WebKit progress-backup suite,
  PostgreSQL-backed admin browser suite and both native container acceptance jobs.
  Manually verify the local editor/learner start commands and representative
  desktop/mobile flows; automated keyboard tests do not certify screen readers.
- Updated `npm run verify:full`, remaining required container gates, and
  `git diff --check`. Record skipped/unavailable gates as gaps, never passes.

Final reference audit: search for the two filenames, `content/local`, JSON content
classes, `VITE_CONTENT_SOURCE`, `VITE_ADMIN_SOURCE`, `VITE_JSON_FIXTURE_AUTHORING`,
`MEDUCATION_BANK_PATH`, `MEDUCATION_FLASHCARD_BANK_PATH`, source selectors,
file-replacement instructions and removed script paths. Remaining matches must
be specifically justified export compatibility, rejection tests, a negative
architecture fixture, or frozen history. Check for renamed/duplicated full banks,
not only those literal strings. Keep all private artifacts out of Git.

## Size and maintenance expectations

Removing the two tracked banks removes 17.1 MB of raw files from the current
checkout, plus retired code/tests. Git history still contains earlier bank blobs;
normal deletion does not shrink existing `.git` history, and this task does not
rewrite history. Ignored original extraction files and protected local backups
are separate disk usage and are not removed by this plan.

The backend runtime currently copies both banks, so newly rebuilt API images
should lose that raw content payload, plus any removed runtime code. Compression,
layers and image caches affect measured savings; old images/build caches do not
disappear automatically. Frontend Docker build contexts also lose those inputs.

Production learner/admin builds already exclude bundled full banks, so their
download-size reduction may be modest. Removing obsolete branches/shared editor
code can still help, but measure fresh raw/gzip/brotli entry and lazy chunks,
total assets, API image and build context separately. Report actual before/after
numbers without promising a percentage or faster startup/builds in advance.

## Plan verification record

- Repository working tree was clean before planning; no app/content/database
  changes were made for this plan.
- Inspected current source selection, admin inheritance/persistence paths, backend
  settings/source/parity, Docker/Compose packaging, fixture/test runners, ownership
  rules and current operator/schema/testing documentation.
- Measured bank sizes directly from the tracked working files. Other local disk
  observations are informational, not comparable fresh-build benchmarks.
- Implementation tests and builds are intentionally not claimed: this deliverable
  changes only the plan. Record implementation results stage by stage above.

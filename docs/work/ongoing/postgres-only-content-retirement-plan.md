# PostgreSQL-only quiz and flashcard content

Date: 2026-10-15. Planning baseline: `c9a7154`.

Status: implementation complete and locally verified. Final acceptance remains
open for current-worktree native AMD64/ARM64 CI. Keep this tracker in `ongoing`
until that evidence is available; earlier CI does not certify these changes.

## Final local completion audit — 2026-10-16

No blocking local implementation findings remain against the requested retirement.
PostgreSQL is the sole runtime/writable content source; authenticated HTTP owns
normal paired CRUD and publication. Removed both old repository banks, offline
learner/JSON authoring sources and one-use file workflows. Shared schemas,
provenance, deterministic exports, reviewed DB recovery imports and browser
learner progress remain. The backend's single accepted `postgres` compatibility
value is a rejection guard for old JSON configuration, not a selectable backend.

Final acceptance evidence:

- `npm run verify:full` passed: lint/format, architecture 10, frontend 92 files /
  579 tests, explicit fixture validation/policy generation, Ruff/mypy, backend
  242 passed / 186 separately gated skips, type-check, fresh learner/admin builds,
  learner browser 43 and authenticated PostgreSQL admin browser 26.
- Fresh packaged learner browser 44 and packaged admin nginx browser 26 passed.
  API/proxy/Compose/policy/admin-static container gates passed; Compose verified
  named-volume persistence across restart and recreation.
- Explicit export/release-input contracts 27, admin artifact contracts 10 and
  Ruff over every container helper passed. Final format and `git diff --check`
  passed after the final guidance changes.
- Protected selected-export validation/audit and independent PostgreSQL route /
  reconstruction / exact export parity passed with the old banks absent.
- Synthetic full restore/recovery passed, including roles/ACLs, all tables and
  sequences, sessions/epoch quarantine, allocation journals/admission/no ID reuse,
  retained activation, current/prior installed application compatibility and
  unchanged later authoring. Both recovery and selected parity report cleanup pass.
- Restartable PostgreSQL resilience: 18 passed / 168 deselected. Existing ordinary
  PG integration evidence remains 184 passed / 2 restartable-only skipped.
- Chromium/WebKit progress backup and restore: 50 passed. Firefox remains the
  previously user-deferred acceptance gap; no new Firefox claim is made.
- Final read-only `authority-after-acceptance.json`: all content tables and local
  allocation journals match baseline, both private archive copies are exact,
  and both repository banks are absent. No authority writes, IDs, migrations or
  restarts occurred. Final Docker inventory contains only the running authority;
  no disposable test containers or Compose test volumes remain.

Logs/reports follow `/tmp/meducation-retirement-*-final.{log,json}`; the protected
preservation/size records remain under the ignored baseline directory. The final
remaining-gates report is `/tmp/meducation-retirement-remaining-gates.json`.

Verification limits: the complete repeated no-cache/native acceptance runner and
current native AMD64/ARM64 CI have not been invoked for this worktree. Its local
constituent workflow/container/recovery gates above passed. Existing chunk-size
and SQLAlchemy deprecation advisories remain; the two backend warnings use
intentional weak-key fixtures. No new manual device/screen-reader, hosted identity,
off-device retention or public deployment acceptance is claimed. No commit, push,
publication or deployment was performed. Final CI evidence is the only remaining
retirement acceptance gate; broader launch gates stay with their own trackers.

## Continuation checkpoint — 2026-10-16

- Removed the two tracked generated banks (17,109,825 bytes) after matching their
  baseline hashes. Exact private copies remain in the ignored protected baseline
  directory under `retired-repository-archives/`; no authority writes occurred.
- Retired one-use local-authoring cutover/check/finish scripts. Updated current
  architecture, schemas, operator/container/testing guidance, repository rules
  and skills for PostgreSQL-only operation; ADR 0006 records the decision.
- Converted packaged API/proxy/admin-static/Compose smokes to owned, isolated
  PostgreSQL fixtures. Fresh corpus-free API/learner/admin images built. API (4),
  proxy (5), Compose persistence/recreation (6), policy, and admin-static gates
  passed; reports are `/tmp/meducation-retirement-*-final.json`.
- Recovery verification now requires explicit `--small-fixture` or
  `--export-directory`; acceptance supplies the synthetic selector. Removed
  JSON source switching from the PostgreSQL continuity browser test.
- Build/type-check after corpus deletion passed. Remaining gates: fresh packaged
  PostgreSQL learner/admin browsers, broad verification, export parity/recovery,
  final authority/journal comparison, reference audit, and size measurement.

### Current verification evidence

- Packaged PostgreSQL learner suite: 44 passed, including recreation and changed
  publication. Report `/tmp/meducation-retirement-postgres-browser-final.json`.
- Release-input and explicit export-tool contracts: 27 passed. Admin artifact
  audit contracts: 10 passed. Ruff over all container helpers passed.
- Protected published export validation and explanation audit passed. Reports:
  `/tmp/meducation-retirement-selected-{validation,audit}-final.json`.
- Final preservation report `authority-after-retirement.json` confirms all content
  tables and journals unchanged, original archives retained exactly, and both
  repository banks absent. No authoritative writes, allocation or restart.
- Full `npm run verify:full` passed: 92 frontend files / 579 tests and backend 242
  passed / 186 skipped (real PostgreSQL cases have separate passing evidence),
  lint/format/architecture/Ruff/mypy/type-check passed. Fresh learner browser 43
  and authenticated PostgreSQL admin browser 26 passed. Learner/admin builds
  and explicit fixture validation/policy generation passed. Log:
  `/tmp/meducation-retirement-verify-full-final.log`.
- CI replacement jobs remain configured for native AMD64 and ARM64. This local
  continuation has not invoked hosted CI, manual device or screen-reader checks;
  earlier native CI results do not certify this worktree.

### Final comparable size measurement

Fresh corpus-free packaged web-root totals (per-file Node gzip/Brotli; maps and
inspection manifests removed): learner 2,449,765 raw / 1,299,004 gzip / 1,212,334
Brotli bytes; admin 2,756,230 / 1,396,860 / 1,300,400 bytes. Compared with the fresh
planning baseline, learner savings are 2,097 / 1,233 / 743 bytes; admin savings
26,578 / 6,364 / 6,224 bytes. The corpus was already excluded from frontend
bundles, so the frontend improvement is modest. The API image lost 17,129,798 bytes
(405,070,500 to 387,940,702). The two deleted tracked archives total 17,109,825
bytes. Git history, old images/caches and ignored private backups are retained.
Private detailed inventory: `final-packaged-asset-sizes.json` in the baseline folder.

### Packaged editor and final audit follow-up

- Fresh packaged API + admin nginx browser suite: 26 passed. Report:
  `/tmp/meducation-retirement-packaged-admin-final.json` (ARM64).
- Corrected remaining active architecture/regression/diagnostic guidance for
  removed fallback and file replay/factory paths. Older cutover design pages and
  affected ongoing roadmaps now explicitly point to ADR 0006/current retirement.
  Frozen patches and machine snapshots remain untouched.
- Temporary final-gate orchestration initially resolved the virtualenv Python
  symlink to system Python, so parity stopped on missing SQLAlchemy before any
  DB work. Corrected the temporary runner to preserve the virtualenv path and
  resumed only the remaining gates; this was not an application failure.

### Selected-release parity after archive removal

`verify-postgres-release.py --export-directory` passed against the protected
published pair with both repository banks absent. It checked manifest/schema/rich
policy, independent learner-route/conditional expectations, every authored field,
order and optional presence, exact paired reconstruction/re-export hashes and
revisions, and unchanged original export; cleanup passed. Report:
`/tmp/meducation-retirement-selected-parity-final.json`.

A large-JSON audit found no renamed tracked corpus. The remaining large
`content/explanation-audit.json` is ignored historical review material with no
runtime consumer, retained separately as documented. Current code references to
old filenames are limited to negative guards/tests and compatible database export
ZIP names. No full bank has been moved into a fixture, module, shard or web root.

## Execution checkpoint — 2026-10-15

- Working tree was clean when implementation started. No authoritative content
  writes, ID allocation, imports, migrations or database restarts have occurred.
- Online full backup passed archive inspection:
  `var/backups/postgres/20261015T095759Z-758495de.dump` with its checksum sidecar.
- Protected repeatable-read/read-only database baseline, exact current draft and
  published artifacts, content-table counts/digests, allocation journal hashes and
  repository bank hashes are under
  `var/backups/postgres/json-retirement-20261015/`. Published export validation
  passed using `job.py validate-export`; this does not alone establish future
  database currency. Retain these private files outside Git.
- Fresh baseline learner `npm run build` (includes type-check) and optional
  `npm run build:admin` passed. Total shipped assets before retirement:
  learner 2,451,862 raw / 1,300,237 gzip / 1,213,077 brotli bytes;
  admin 2,782,808 raw / 1,403,224 gzip / 1,306,624 brotli bytes. These totals sum
  per-file sizes, including fonts; use the same method for final comparison.
  The learner build has the existing large-chunk warning. Existing local API
  image tags report approximately 405 MB; this is an observed rounded historical
  image size, not yet a fresh image baseline for the current source.
- Added explicit synthetic `src/test/contentFixtures.ts`. Four admin test files
  now import fixtures/pure serialization directly, without runtime local adapters
  or per-test generated-bank mocks. Focused verification: 4 files / 28 tests pass.
- Replaced the parity checker's JSON reference API with independently calculated
  expected HTTP responses from captured inputs. Added a regression for interleaved
  membership, empty decks, optional fields, ordering and answer provenance.
  Focused pytest: 4 passed (including rejection of a JSON-configured parity target). Backend Ruff and strict mypy passed for this slice.
- Selected-export parity passed against disposable PostgreSQL: 348 learner routes,
  exact reconstruction/bytes/revisions, ETags/304/409 and reader cleanup. The report
  records cleanup passing. One prior run rejected an intentional source edit made
  during verification; the accepted rerun used frozen checker inputs.
- Learner runtime loaders no longer expose `configureLocal` or local-source
  branches. Removed the bundled `/#content-qa` viewer. Retired frontend source
  configuration now fails early; API fixture tests preserve freshness checks.
  Updated affected learner tests: 4 files / 43 tests passed with one worker.
- Added a guarded disposable PostgreSQL browser runner and migrated the standard
  learner/progress-backup configuration to it. Six admission guard tests passed.
  All 43 standard learner Chromium browser tests passed using PostgreSQL with the
  fresh retries-disabled smoke build. Its container was cleaned up on shutdown.
- Added architecture rejection of local-bank sources through lazy learner edges;
  10 architecture tests and graph check passed. Explicit old local mode is rejected
  before build. Format check passed. Source/fixture changes passed type-check and
  learner build; the existing large-chunk warning remains.
- HTTP admin gateway no longer inherits or stores paired state in the in-memory
  gateway. Its flashcard reads clone the current server snapshot. The workspace
  retains a temporary type union for the legacy editor pending full removal.
  Enabled admin build and hidden-map artifact audit passed; the audit now rejects
  in-memory gateway modules. All 9 audit regression tests passed. Subsequent
  type-check passed. HTTP admin browser acceptance: 16 cases passed in the full
  run; two authentication-refresh cases initially failed because their session
  polling raced the callback cookies. Those tests now await popup completion
  before inspecting session state; both passed in the focused rerun. The tests
  still assert unsaved-text retention and no automatic write. No authentication
  policy or production session behavior was weakened.
- Full frontend unit rerun passed sequentially: 95 files / 602 tests, 173 seconds.
  A prior two-worker run under competing heavy jobs hit timeouts and was
  interrupted. An initial browser attempt used the normal retry-enabled build
  and was stopped; the accepted 43-test result above used the required fresh
  smoke build. Keep heavy suites sequential on this host rather than increasing
  timeouts to mask resource contention.
- Final slice verification passed: full backend pytest reported 246 passed /
  186 skipped / 2 warnings (the deliberately weak-key warning cases). Skipped
  PostgreSQL integration cases are not claimed as passes; real-PostgreSQL evidence
  for this slice is the selected-export parity and browser suites above. Backend
  Ruff/mypy, final lint/format, architecture and admin audit regressions, and the
  final ordinary `npm run build` (including type-check) passed. The known
  large-chunk build warning remains.
- Read-only preservation comparison passed: every captured content-table digest,
  allocation journal and repository-bank hash is unchanged. Private report:
  `var/backups/postgres/json-retirement-20261015/authority-after-first-slice.json`.
  No routine content writes, imports, migrations, allocation or authority restarts
  occurred. Nothing has been committed, published or deployed.
- Second slice: standard admin Playwright now seeds the explicit synthetic paired
  fixture into an owned disposable PostgreSQL container and uses authenticated
  HTTP workflows through Vite. The fixture runner accepts a guarded `--pair-file`
  input and still refuses private/authority inputs; all 7 admission tests passed.
  Backend fixture/helper Ruff passed. Initial full host acceptance: 26/26 tests,
  including CRUD/order/cross-deck moves, bulk reservations, selected/cascade
  deletion with paired undo, publication/activation/export, stale/uncertain writes,
  authentication freshness, hidden text/context cancellation, and responsive bounds.
- Removed `LocalAdminApp`, source-selection flags and `VITE_ENABLE_LOCAL_ADMIN`.
  `AdminWorkspace` accepts only the HTTP gateway. Both panels await successful
  server receipts, retain unsaved text on failure/context refresh, and use shared
  PostgreSQL history. Removed local history, file import/replay, replacement
  exports/manifests, local export status, and their unused replay/download helpers.
  The in-memory operation double moved to `src/test`; the production artifact
  audit rejects test helpers as well as the former production gateway (10 tests).
- Removed both frontend local adapters, their retired lookup tests and global
  generated-bank mocks. Content policy/schema/API tests remain. The npm validator
  now requires two explicit paths; CI/full verification use synthetic fixtures.
  Removed the implicit explanation audit; current-content audit/validation uses
  the retained selected-export tools. Explicit fixture validation passed (one
  fixture warning). Controller/panel/status/deletion unit checks passed before the
  final full-suite rerun. Current owner documentation reflects HTTP-only editing.
- Second-slice verification passed: full frontend suite 92 files / 579 tests,
  128 seconds, one worker. Final controller/panel rerun passed 2 files / 11 tests
  after copy and duplicate-command coverage changes. The full host admin suite
  passed 26/26; enabled production nginx/API/PG acceptance passed 10 selected
  workflows, including keyboard/theme checks at all three widths. The final
  enabled production build with hidden maps and artifact audit passed again after
  copy cleanup. Ordinary `npm run build` (including type-check) passed, with the
  existing learner chunk-size warning. Final lint/format, 10 architecture tests,
  graph check and `git diff --check` passed. Old JSON editor flags fail early.
- The final optional admin assets, excluding hidden maps/manifest, total
  2,756,230 raw / 1,396,860 gzip / 1,300,400 brotli bytes using the baseline's
  per-file compression method. Baseline: 2,782,808 / 1,403,224 / 1,306,624.
  This slice saves 26,578 raw bytes; the larger repository/API-image savings await
  actual bank deletion and container cleanup. Private size inventories are in
  the preservation folder; the initial second-slice measurement included maps
  and is explicitly superseded by `admin-second-slice-final-assets.json`.
- Read-only preservation comparison passed again: all content-table digests,
  allocation journals and repository-bank hashes are unchanged. Private report:
  `var/backups/postgres/json-retirement-20261015/authority-after-second-slice.json`.
  The preserved published export passed validation through the retained explicit
  export tool; its report is `/tmp/meducation-retirement-published-second-validation.json`.
  No authority writes, ID allocation, imports, migrations or restarts occurred.
  All tests used isolated synthetic databases. No full-retirement acceptance is
  claimed; no commit, publication or deployment was made.

- Third slice in progress: removed Python JSON repositories and `JsonContentSource`,
  bank-path settings/defaults, and repository-factory startup parameters. Settings
  accepts only PostgreSQL; a missing reader URL now fails in API startup while
  operator-only CLI settings remain usable. Diagnostics always checks the reader.
  Stored models, protocols, deterministic artifacts and recovery import/export
  services remain. Fast HTTP boundary tests inject small explicit test-owned
  object repositories from `backend/tests/fixture_content.py`, never shipped or
  selectable from environment configuration. Updated stored revision tests to
  exercise the retained artifact encoder. Updated the DB toolchain probe.
- Backend checks for this slice: full pytest 242 passed / 186 skipped / two
  intentional weak-key warnings, Ruff passed, strict mypy passed (41 files).
  Disposable PostgreSQL integration passed 184 tests / 2 skipped in 237 seconds
  using `test-postgres-content.py --maxfail 1`; the two skipped cases require the
  separate restartable fixture. These are real DB passes, independent of the
  ordinary suite's skipped integration cases. Log/report: `/tmp/meducation-retirement-backend-mode-postgres.{log,json}`.
- Removed API Docker bank COPY/env defaults and excluded full corpus archives
  from both Docker contexts. Base Compose passes explicit reader URL/environment
  and no longer implies a JSON startup path. The local DB override retains its
  startup dependency and migration job. Packaged policy smoke now mounts only
  its explicit small synthetic pair and checks corpus absence, rather than reading
  packaged authored banks. Base and local-extension Compose configurations passed
  `config --quiet`. These container edits still require a fresh image,
  policy smoke, and migration of remaining JSON-oriented smoke/Compose callers.

- Final third-slice unit rerun passed again: 242 passed / 186 skipped / the
  same two intentional weak-key warnings; Ruff and strict mypy passed. Final
  frontend lint/format, architecture graph and ordinary type-check/build passed
  after the shutdown configuration fix. The existing chunk-size warning remains.
  Read-only authority comparison passed for all content tables, journals and
  repository bank hashes (`authority-after-third-slice.json` in the preservation
  folder). No authority writes/restarts occurred.
- Found and fixed test-harness teardown leakage: Playwright's immediate default
  kill could prevent the Python wrapper's Docker cleanup. Both standard browser
  configs now request SIGTERM with a 30-second API shutdown window; progress
  backup inherits it. Removed four exact abandoned fixture containers only after
  checking ownership label, synthetic DB name, tmpfs storage and absence of
  volumes, using immutable container IDs. No authority container or volume was
  touched. A fresh authenticated flashcard delete/undo browser test passed with
  the new backend source and graceful API shutdown. A final `docker ps --all`
  inventory confirmed no browser or PG-content test containers remain.

### Resume without repeating completed work

Frontend/backend JSON sources and repository banks are removed. Packaged smoke
callers now use owned PostgreSQL fixtures; fresh images and five non-browser
container gates passed. The final read-only authority comparison passed (all
content tables and allocation journals unchanged; retained archive copies exact).
27 release-input/export-tool tests passed. API image is 387,940,702 bytes versus
405,070,500 at baseline (17,129,798 fewer bytes).

Next finish packaged learner/admin browsers, full verification, selected-export
parity and synthetic recovery. Update final measurements and checklist only from
actual passing evidence. Keep this tracker ongoing until the relevant gates pass.
Do not reimport the baseline into the authority. Private artifacts and originals
remain ignored under the protected backup directory.

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

- [x] Inventory tracked bank references, runtime selection flags, local-adapter
  imports, file-replacement instructions, test runners, fixtures, Docker copies,
  and scripts. Classify each as remove, rewrite, or retain with a stated reason.
  Include `package.json`, all Playwright configs, `.github/workflows/checks.yml`,
  `scripts/testing/verify-full.mjs`, artifact audits and architecture rules.
- [x] Capture a fresh protected online backup with the existing `backup.py`.
  Record draft revision/digests, current publication/release identity, ordered
  inventories and exact paired exports for the current draft and published pair.
  Keep private content/credentials out of Git and CI evidence. Validate exports
  using the existing explicit export tools; never substitute repository archives.
- [x] Confirm available retained recovery evidence and preserve allocation fence,
  current local journals, credentials and auth epoch. Do not run the offline
  `verify-backup.py` against routine writers merely to collect a baseline; its
  documented writer-retirement procedure is a separate recovery operation.
- [x] Measure fresh learner/admin builds, raw and compressed asset sizes, backend
  image contents/size and tracked source footprint. Record build mode and commit.
  Existing `dist` is not a comparable baseline without a fresh build.

Gate: the current authority is identified and recoverable; private baseline
artifacts exist outside the bank files scheduled for deletion. No authoritative
write/import, database reset, or volume recreation occurs during inventory.

### 1. Establish PostgreSQL-backed test infrastructure and parity

- [x] Extract/reuse the isolated PG17 setup from
  `scripts/containers/fixtures/editor_http.py`, `smoke-admin-http.py`, and existing
  database integration harnesses. Use synthetic content, dedicated credentials,
  schema/bootstrap jobs and unique owned targets. Tests must reject the designated
  authority/container/volume and clean up only their own resources, including on
  failure. Never source `var/local-authority/*.env` in a test runner.
- [x] Provide reproducible learner and authenticated admin test startup with
  separate reader/editor/session/operator/migrator roles as needed. Test seeding
  and synthetic identity controls must remain outside shipped application code.
- [x] Replace global generated-bank mocks and transitive local-adapter imports
  with explicit small fixtures or mocked HTTP DTOs in unit/component tests.
  Replace tests using `configureLocal` with transport fixtures or test-owned
  repositories implementing existing domain contracts. Do not leave a production
  file-source hook simply to support tests.
- [x] Replace JSON-reference-server parity with explicit fixture expectations for
  every learner route plus captured-export comparisons of exact authored fields,
  ordering, optional presence, provenance, revisions and serialized bytes. Keep
  independent expected digests/contract cases and HTTP conditional assertions.
  Continue selected-release verification using explicit protected DB exports.
- [x] Migrate JSON-adapter tests into retained schema/protocol/serialization tests
  or real PostgreSQL behavior tests. Delete tests only for behavior intentionally
  removed; preserve the underlying regression coverage.

Gate: disposable PostgreSQL tests cover learner delivery and paired editor writes
without reading either full repository bank. Normal unit suites stay independent
of live database credentials. Required integration jobs fail rather than quietly
passing when PostgreSQL is unavailable or database tests are skipped.

### 2. Make all admin content workflows HTTP/PostgreSQL-only

- [x] Make `AdminApp.tsx` load only `HttpAdminApp.tsx`; remove `LocalAdminApp.tsx`
  and the JSON fixture editor selection flags. Retain independent admin build
  inclusion and API authorization; rendering admin assets grants no write access.
- [x] Replace the `InMemoryQuestionBankGateway` inheritance/concrete workspace
  dependency with the smallest HTTP-owned gateway contract. Keep pure draft
  transformation, cloning, validation, ordering and preview helpers where useful.
  Remove the production in-memory persistence/history implementation once its
  consumers have moved; test doubles must live only in test-owned code.
- [x] Simplify `AdminWorkspace`, `useAdminEditor`, and `FlashcardAdminPanel` to one
  save/undo/reset path. Remove optional callbacks/branches that can accept edits
  as saved only in memory, legacy file downloads, file replacement manifests,
  change-set file import/replay controls and local-only history/export status.
  Do not remove operation compilers still required for bulk or record editing.
- [x] Preserve single and bulk creation/editing, shared subject management,
  parent changes, sibling ordering, single/selected/cascade deletion, search,
  pagination, validation diagnostics, dirty-text retention and navigation guards.
  Each durable mutation must await a PostgreSQL-backed server receipt; refresh
  both sections from the accepted paired snapshot after commits/Undo/reset.
- [x] Keep server-reserved IDs, hierarchical parent bindings, allocation admission,
  preview fingerprints, operation identity/reconciliation, and concurrency guards.
  UI temporary IDs are not durable IDs. Reauthentication must not replay a write.
- [x] Preserve server paired Undo/reset, explicit reviewed publish, retained-release
  activation without overwriting the current draft, release history and the
  read-only paired HTTP export. Replace residual Stage/export-as-save copy with
  accurate Preview/Save draft/publish state where applicable.
- [x] Move the existing admin browser regressions from
  `e2e/admin/flashcard-admin.spec.ts` to the HTTP/PostgreSQL suite. Retain desktop,
  narrow-screen, keyboard, focus and unsaved-text coverage. Exercise an enabled
  production admin build as well as development startup.

Gate: complete CRUD for subjects/quizzes/questions/decks/cards, including bulk
and paired cascades, passes against disposable PostgreSQL. Saved data survives
page reload and API/container restart, with file-backed sources absent. A new
session can read it. Unpublished edits do not reach learner APIs.

### 3. Remove learner offline and bundled QA sources

- [x] Remove `VITE_CONTENT_SOURCE=local` branches and production `configureLocal`
  paths from both runtime loaders. Keep HTTP loading/caching, progressive
  catalogs, request cancellation, retry/error states and freshness checks.
- [x] Remove the bundled `/#content-qa` bootstrap and `ContentQaPanel` after
  retaining rich-content inspection regressions in existing API/browser tests.
  Do not introduce a replacement standalone content source.
- [x] Delete `src/content/local` adapters after relocating any genuinely shared
  types/pure helpers into their owning schema/domain/content modules. Reuse
  `src/admin/core/flashcardSerialization.ts` where appropriate; do not move
  admin-owned utilities into learner imports or duplicate revision algorithms.
- [x] Remove obsolete source-selection variables/types/examples. Reject explicit
  legacy local/JSON mode configuration with an actionable migration error at
  build/startup instead of silently honoring it or falling back.

Gate: quiz and flashcard catalogs/bodies load only through API requests. API/DB
failures show existing recoverable errors and never load archived content.
Already loaded in-memory content may retain its current documented behavior;
there is no disk-based alternative bank. Learner progress formats remain intact.

### 4. Remove backend JSON runtime service mode

- [x] Make `Settings` and `create_app` PostgreSQL-only. Remove bank-path defaults,
  JSON mode dispatch, public JSON repository factories and `JsonContentSource`.
  Missing/misconfigured reader URL must fail safely without secrets in errors.
  A temporarily accepted `MEDUCATION_CONTENT_SOURCE=postgres` compatibility value
  may ease staged changes; the final configuration must have no mode selector.
  Explicit legacy JSON/path settings should produce a clear rejection.
- [x] Separate shared validated models, repository protocols and DTO construction
  from the file adapters in `repositories/question_bank.py`. Retain what
  `repositories/postgres.py`, validation, authoring, recovery and export need;
  remove `JsonQuestionBankRepository` and `JsonFlashcardCatalogRepository`.
  A test source double must not become an environment-selectable runtime backend.
- [x] Remove JSON branches in diagnostics and other services. Preserve request-
  pinned paired publication, revision/ETag contracts, strict initialization,
  schema validation, bounded caches, cleanup/reconnect and readiness semantics.
  Runtime startup must never bootstrap, migrate, import, or create an authority.
- [x] Preserve the existing database permission split and authenticated authoring
  boundary. Reader credentials cannot edit; no privileged URL fallback is added.

Gate: all supported API launch paths require PostgreSQL; invalid credentials,
missing schema/publication, outages and corrupt data fail explicitly without
consulting files. Auth/session/CSRF/freshness and concurrency tests still pass.

### 5. Retire file maintenance and archive-only operational workflows

- [x] Replace `validate:content` and `audit:explanations` scripts that import local
  banks. Provide explicit commands for synthetic fixture validation in CI and
  authoritative content validation/audit through a pinned DB draft/release export
  produced by the existing HTTP/operator paths. A no-target command must fail
  with usage, never silently choose an archive or developer's authority.
- [x] Update every caller in package scripts, full verification, browser configs,
  CI, docs and container helpers in the same stage. Reports must identify the
  selected draft/release and captured digests; exported artifacts cannot claim
  database currency without an explicit comparison to current DB context.
- [x] Retain `validate-paired-files.ts`, packaged content policy, deterministic
  serialization and export validators where required for server validation or
  reviewed recovery. They must take explicit input paths, with no bank defaults.
- [x] Retire one-use `cutover.py`, `finish-cutover.py` and initial-archive
  `check.mjs` once their only active references are removed. Replace routine
  health guidance with DB/API/editor checks; historical evidence remains frozen.
- [x] Retain and update `serve.py`, `job.py`, `backup.py`, `verify-backup.py`,
  allocation journals and full recovery procedures. Replace every parity/recovery
  default that selects repository banks with an explicit DB-derived export or
  synthetic fixture. No new export is written into `src/content`.
- [x] Audit root `content/` reports/extractions and source-material references.
  Remove obsolete tracked generators/report references where justified. Keep
  ignored private originals/provenance and protected recovery files separately;
  they are not a runtime source and are not swept by an automated JSON deletion.

Gate: no active maintenance/acceptance command requires the deleted files or
serves JSON as application content. Current-content checks and CI fixture checks
have separate, truthful targets. Full PostgreSQL restore/recovery remains usable.

### 6. Make packaging and standard verification PostgreSQL-only

- [x] Remove bank `COPY` directives and bank-path environment variables from
  `backend/Dockerfile`; narrow policy-build copies where useful. Remove obsolete
  frontend flags and update `.dockerignore`, image audits and audit tests.
  Preserve packaged validators, read-only/non-root images, role separation and
  learner/admin asset isolation.
- [x] Make base Compose require an explicit PostgreSQL reader configuration,
  with an optional owned disposable development DB setup. Retire/merge the
  old JSON/postgres override split. Do not silently attach the designated
  authority volume to a new service or create another routine content authority.
  Continue supporting the existing local launcher and explicit production DB
  connection/routing configuration; document migrations as separate operator jobs.
- [x] Rewrite JSON-only API/learner/static-admin/policy smoke tests and archive
  load/resilience/rollback paths under `scripts/containers`. Use seeded disposable
  PostgreSQL for runtime tests and explicit artifacts for transfer/recovery tests.
  Update acceptance hashes, audit expectations, release-input tests and fixtures.
  Recovery rollback must not reactivate a JSON content backend or rewind the
  designated authority. Historical rollback images may be exercised only in
  isolated recovery compatibility tests, never offered as current service mode.
- [x] Make `playwright.config.ts`, `playwright.admin.config.ts`,
  `playwright.admin-http.config.ts`, progress-backup/container configs, CI and
  `verify-full.mjs` agree on PostgreSQL fixture lifecycle. Consolidate duplicated
  admin runners while retaining all relevant coverage. Build learner/admin
  outputs and run their browser suites sequentially because they share `dist`.
- [x] Require real PostgreSQL CRUD/learner tests in CI, not only mocks or skipped
  database tests. Reuse PG17 pinning and native AMD64/ARM64 container jobs. No
  production/private content, credentials or exports become CI inputs/artifacts.
- [x] Extend architecture/artifact guards to reject production local-bank
  imports, file adapters, offline selectors and shipped corpus/test fixtures.
  Keep independent negative regression cases, even if those mention retired
  filenames in synthetic test graphs. Check full content is absent from chunks,
  maps, manifests, public files and backend image layers, not just entry imports.

Gate: a fresh clone builds and runs the documented PostgreSQL setup without the
two files. Both image variants and the API contain no bundled quiz/flashcard
corpus; required CI exercises the replacement workflow end to end.

### 7. Delete banks, reconcile documentation, and accept the retirement

- [x] Delete both `src/content/*.generated.json` banks once preceding consumers
  are replaced. Add no copies under another tracked path, encoded module, public
  shard, fixture corpus, generated cache, or shipped archive. Run final verification
  with those files physically absent, not just ignored by the selected mode.
- [x] Update `AGENTS.md`, `README.md`, `backend/README.md`, `.env.example`,
  `backend/.env.example`, `ops/containers/.env.example`, `ops/content-authority.json`,
  `.prettierignore`, and relevant package/config comments. State PostgreSQL-only
  runtime, HTTP CRUD, explicit operator recovery, and no offline source.
- [x] Rewrite active sections in `docs/architecture.md`, `product.md`,
  `question-schema.md`, `flashcard-schema.md`, `content-management.md`,
  `testing.md`, `testing-regressions.md`, `local-authoring.md`,
  `local-containers.md`, `L4-http-editor.md`, `L4-authoritative-recovery.md`,
  `L6-deployment-handoff.md`, and `ops/containers/README.md`. Include fresh-clone
  setup, startup failure, CRUD/publication, backup/restore, fixture tests and
  validation commands. Stored-bank representations are contracts, not files to edit.
- [x] Record a short superseding architecture decision for retirement of source
  selection/file authoring; link superseded decisions without rewriting their
  historical implementation evidence. Update affected ongoing trackers where
  needed; do not rewrite completed trackers or frozen snapshots to appear current.
- [x] Review repository-local skill guidance that still assumes read-only JSON
  services/local adapters; update it to current contracts so later work does not
  revive retired modes. Inspect broader tooling references before deleting helpers.
- [x] Reconcile pre/post authority inventories, exact paired bytes and digests,
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

## Original planning-stage verification record

- Repository working tree was clean before planning; no app/content/database
  changes were made for this plan.
- Inspected current source selection, admin inheritance/persistence paths, backend
  settings/source/parity, Docker/Compose packaging, fixture/test runners, ownership
  rules and current operator/schema/testing documentation.
- Measured bank sizes directly from the tracked working files. Other local disk
  observations are informational, not comparable fresh-build benchmarks.
- At the original planning stage, no implementation tests/builds were claimed.
  Implementation was subsequently authorized; current evidence and remaining
  work are recorded in the execution checkpoint above.

# Testing

Current database content checks must select a fresh draft/release export explicitly (`validate-export`/`audit-export`). The npm pair validator requires explicit fixture/export file paths. Keep fixture CI independent of production credentials. Retained full-backup restore, session/allocation quarantine, independent-journal reconciliation and compatible worker/cache restart are required recovery gates. See [the recovery runbook](L4-authoritative-recovery.md).

For a pinned published operator export, use the [selected-content parity command](local-authoring.md#verify-a-pinned-published-content-candidate).
`verify-postgres-release.py --export-directory` checks that explicit paired export
in an owned disposable PG17 cluster and re-exports exact digests; it does not
replace explicit synthetic recovery or full-authority retained recovery. Native
acceptance also runs `python -m pytest scripts/containers/test_release_inputs.py -q`
for synthetic admission, mutation and protected-output regressions, without
authority credentials or private content. A `--small-fixture` run is a synthetic recovery regression; current authority
parity requires an explicitly selected fresh protected export.

Select checks by the changed contracts using [Selecting verification](#selecting-verification) and the [regression requirements](testing-regressions.md). Reuse relevant passing results until affected inputs change; do not add tests that merely mirror implementation or incidental styling. CI executes frontend, backend, and browser checks in [checks.yml](../.github/workflows/checks.yml). Do not hand off a change while relevant gates fail.

## Commands

### While developing

Run the changed unit test directly, or start Vitest in watch mode:

```sh
npm test -- src/domain/quizEngine.test.ts
npm run test:watch
```

Choose affected tests using the ownership and regression guidance below. UI, shared content/rendering, persistence, schema, and transport work still needs the browser, backend, and content checks required by the affected-area guidance. A focused command speeds iteration; it does not replace the merge checks.

### Full verification

After Chromium and WebKit have been installed, the backend development environment is set up, and Docker is running for the disposable PostgreSQL browser fixtures, run:

```sh
npm run verify:full
```

The runner stops at the first failed step. It runs lint, formatting, architecture tests, the complete unit suite, explicit synthetic pair validation, backend Ruff/mypy/pytest, and TypeScript checking. It then creates a fresh learner production bundle with retries disabled, runs the learner browser suite against that bundle, runs the dedicated progress-backup suite once per accepted engine (Chromium/WebKit), creates the enabled optional admin production bundle, and runs the admin browser suite. All browser suites use fixture banks; none changes authored content. The learner bundle has a fresh build before preview starts. The admin build follows learner tests because both builds write to `dist`.

`npm run test:e2e` remains self-contained and builds fresh output with retries disabled before running Chromium. `npm run test:e2e:prepared` skips that build and is intended for `verify:full` immediately after `npm run build:learner:smoke`; do not use it with an old or differently configured `dist`. `npm run test:e2e:admin` runs against Vite's development server and does not need production output.

Progress backup is excluded from the ordinary learner suite to avoid duplicate Chromium execution. The dedicated progress-backup config runs Chromium, Firefox and WebKit when all
projects are selected. For the currently accepted engines, run
`npx playwright test --config=playwright.progress-backup.config.ts --project=chromium --project=webkit`
after a fresh learner build. It writes isolated traces to
`test-results-progress-backup/` and a JSON report beside that directory. The
browser-smoke CI job installs both accepted engines and runs this command
sequentially after the complete learner suite, before the PostgreSQL admin
suite, retaining a separate evidence artifact. Firefox remains explicitly
user-deferred; its absence from this invocation is not a pass or support change.

`content-candidate.spec.ts` and the HTTP editor's matching spec exercise synthetic
rich/hostile content, exact JSON display and reachable actions at 390/1048/1440px
with enlarged text and reduced motion. For local candidate inspection only, set
`MEDUCATION_RC_EXPORT_DIRECTORY` to a protected operator export; the tests verify
its quiz-byte manifest digest and select unchanged representative records. These
are read-only browser response fixtures, not publication or database parity tests.
Keep their logs/screenshots/traces private: pass a protected `--output` to the
learner command and set `MEDUCATION_EDITOR_HTTP_OUTPUT` for the HTTP fixture
command. Ordinary CI uses synthetic cases only. The HTTP editor's authored JSON
is intentionally text; these checks do not add a rich preview or save content.

From the repository root, run the frontend checks:

```sh
npm run lint
npm run format:check
npm run test:architecture
npm test
npm run validate:content -- tests/fixtures/question-bank.json tests/fixtures/empty-flashcard-bank.json
npm run build
```

`npm run build` includes TypeScript checking for browser and maintenance code. `npm run typecheck`, `npm run build:learner`, and `npm run build:admin` are split commands for verification flows that already run TypeScript checking once. The Vite-only admin command enables both the admin entry and the production authoring editor. Test the optional admin build when changing entries, shared UI, authoring, or bundle boundaries, using the [enabled production editor command](../README.md#local-content-editor).

The ordinary build must omit `admin.html`; the optional build must include it. `VITE_BUILD_ADMIN=true` includes the optional HTTP editor; its API still requires authentication. Verify initial and quiz-route chunk composition when changing lazy imports: API startup must not eagerly load canonical banks or the validation pipeline.

For the existing content service and shared stored-bank contracts (build the packaged authoring policy after installing npm dependencies):

```sh
npm run build:content-policy
.venv/bin/python -m pytest backend/tests -q
.venv/bin/ruff check backend/src backend/tests
.venv/bin/mypy backend/src
```

Follow [backend setup](../backend/README.md) to install the locked environment. For browser flows, install Chromium once and run the suites sequentially:

```sh
npx playwright install chromium webkit
npm run test:e2e
npm run test:e2e:admin
```

The learner npm pretest builds production output with automatic retries disabled. Docker must be running: Playwright starts `scripts/testing/serve-postgres-fixture.py`, which seeds the explicit small quiz/flashcard fixtures into a uniquely owned disposable PG17 tmpfs container and serves the real PostgreSQL API on port 8765. Vite preview proxies `/api` there. Override the API port with `MEDUCATION_E2E_API_PORT`; the service is separate from the designated authority and never reads its credentials or content. The wrapper rejects non-fixture input paths and non-loopback origins, generates disposable role credentials, and removes only its labelled container on shutdown. The progress-backup browser config shares this setup. The admin suite uses the same guarded runner on port 8766 with the explicit `base` pair from `tests/fixtures/paired-authoring-cases.json`, and a Vite development server on port 4174. Its test-only `/fixture` proxy is enabled only by the runner. Fixtures never replace authored canonical records.

Prepared HTTP gateway tests verify cancellation without writes, live review identity, stale preview rejection, one-attempt fingerprints, uncertain-write blocking, and shared command admission. Save review tests verify initial cancellation focus, numeric warnings, and capped-ID disclosure. HTTP browser workflows confirm server review explicitly and exercise cancel/retry without text loss.

Admin header coverage verifies status precedence, visible blocked-publication explanations, grouped utilities/account actions, and explicit paired export targets. HTTP browser workflows exercise publication/version dialogs and the renamed Check save status recovery action; header geometry is captured at 390/1048/1440px alongside existing panel checks. Full redesign acceptance (shared save dialogs, structured forms, and manual accessibility checks) remains tracked in `docs/work/ongoing/admin-ux-redesign-plan.md`.

## Suite ownership and fixtures

Admin core/panel tests use explicit synthetic banks from `src/test/contentFixtures.ts`
and pure serialization helpers. App tests formerly using local-source setup now
exercise real runtime API repositories with synthetic transport DTOs from
`src/test/runtimeContentFixtures.ts`. Keep fixture IDs valid under API decoders;
local-only bypasses must not be restored to make invalid fixtures pass.

- Vitest tests stay beside their domain, persistence, content, shared UI, feature, and authoring modules. App tests cover composition/navigation/drawer policy; quiz-to-subject lookup tests live with the quiz session contract.
- `src/test/setup.ts` installs React Testing Library cleanup, matchMedia, and observer shims. It no longer mocks any repository banks; tests supply explicit fixtures through their owned contracts. Vitest uses two workers by default; CI calls `npm run test:ci`. Use one worker on a resource-constrained local host and keep heavy suites sequential.
- `tests/fixtures/bank-contract-cases.json` is shared by TypeScript and Python stored-bank validators. Add cross-runtime edge cases there. `src/content/api/apiContract.test.ts` owns the separate API DTO contract.
- `backend/tests` uses explicit fixture paths for repository/request behavior; it must never mutate canonical banks.
- `e2e` covers production learner flows and HTTP authoring with isolated PostgreSQL fixtures.
- `e2e/admin-http` runs through both the standard host runner (`npm run test:e2e:admin`) and the separate nginx/container harness. It covers authenticated paired saves, publication, retained activation, database-derived export, reservations, stale context, uncertain writes, session expiry, paired cascades/undo, selected deletion, deck/card CRUD/order/moves, cancelled context changes, hidden text retention, and responsive geometry. It never intercepts repository banks or runs a local JSON editor.
- Admin quiz navigator/status tests under `src/admin/components` use the small question-bank fixture to protect selection payloads, canonical row order, parent-dependent Add availability, and textual validation/workspace status. UI copy cleanup must retain diagnostic paths and busy feedback; do not lock incidental subtitles or colors into unit tests. The admin browser suite also checks keyboard access, primary-action color, panel radius, and horizontal overflow at 390px.
- Admin content-management regressions should cover quiz search and 25-item pagination beyond 200 records, draft retention while browsing, contextual cascade deletion for subject/quiz/deck/item/card, paired subject-delete validation and Undo, separate publication and database-derived export, and bounded issue/bulk previews. Keep these tests fixture-based and assert the final quiz/flashcard pair, stable IDs, and unchanged learner progress.
- The admin width regressions measure the actual navigator/editor bounding boxes at 390, 1048, and 1440 CSS pixels in both sections. They assert full-width stacked panels, top-aligned desktop columns, intrinsic navigator height, and no horizontal page overflow. Browser tests also cover cancellation and one-batch Undo for selected quiz items/cards, server paired-deletion Undo, and preservation of a hidden flashcard draft. Component/controller tests cover stale deletion reviews, severity pagination, selection scope, wrong-parent/invalid deletion batches, and draft cancellation.
- Architecture tests under `scripts/architecture` use Node's test runner and are excluded from Vitest to avoid duplicate execution.

Use small versioned fixtures for schema, relationships, canonical ordering, sparse metadata, provenance, rendering safety, revision/serialization parity, scoring, and persistence. Do not assert production record counts or individual authored records in unit tests. Adding canonical flashcards must not change fixture-based starting catalogs.

`npm run validate:content -- <quiz-file> <flashcard-file>` checks explicitly selected pairs outside Vitest for structure, shared-subject references, Markdown/HTML/URL/LaTeX safety, and review metadata. It never selects a repository database implicitly. CI uses the small quiz/empty-flashcard fixture pair. Current authored checks require a fresh selected database export and `validate-export`/`audit-export`; passing fixtures does not certify authority content.

## Architecture and formatting

`npm run lint` checks source, maintenance scripts, and ESLint/Vite/Playwright configurations, then runs the whole dependency graph. `npm run check:architecture` runs the graph alone. `npm run test:architecture` checks adversarial normalized/type/dynamic imports, alias resolution, peer-feature/presentation restrictions, storage access, transitive cycles, and eager learner banks/validators. [Architecture](architecture.md#checked-dependency-boundaries) defines the policy and its limits.

`npm run format:check` covers root JSON/tool configurations, TypeScript browser tests, maintenance TypeScript/JavaScript, and `src/shared/theme.ts`. Application-wide formatting remains incremental. `.prettierignore` protects fixture bytes, dependency locks, private source material, and generated output. Keep formatting-only work separate from behavior and dependency changes. A future alias must resolve consistently in TypeScript, Vite, tests, scripts, and architecture checks.

## Selecting verification

For each coherent code change, run focused behavior tests, affected lint/architecture checks, and the required TypeScript/production build (`npm run build`). Choose additional gates by the affected contract:

- Learner UI, navigation, sessions, or loaders: run the relevant learner browser workflows on a fresh learner build. Run the full learner suite when shared navigation/loading or cross-screen behavior changes.
- Admin UI, gateway, or authoring: run the relevant admin browser workflows and optional admin build. Use the complete editor suite for shared save/review/state changes.
- Shared UI/content rendering, entry points, or dependency/lazy boundaries used by both apps: build both entries and run the affected workflows in both apps. A single unused module deletion does not require unrelated browser suites.
- Persistence/backup/recovery: retain focused failure, interruption, stale-tab, and compatibility tests; run the dedicated backup browser suite for changes to its behavior. Do not change isolation to hide failures.
- Backend, shared stored contracts, policy, or fixtures consumed by Python: run the relevant Ruff/mypy/pytest and explicit disposable PostgreSQL/policy gates. Content or serialization changes require selected current export/fixture validation and parity checks; ordinary source moves do not require authority access.
- Container/runtime packaging, database/recovery, or release changes: run the relevant installed-image gates and full native acceptance for release certification. Host tests do not certify installed images or either native architecture.

Documentation-only changes need link/command review and `git diff --check`, not application builds. Boundary policy/resolver changes also require `test:architecture`. Keep full release/recovery acceptance separate from routine iteration. Tests should assert observable outcomes or meaningful safety/performance invariants; small files, repeated fixtures, or incidental MUI classes do not by themselves justify new helpers or tests.

Before handoff, confirm affected obligations in [the regression reference](testing-regressions.md), run `git diff --check`, and record results and existing advisories in the work tracker. Preserve stable IDs, ordering, answer provenance, current storage contracts, and export/replay behavior. Use a dedicated candidate/parity check for future schema migrations.

Automated role/label, keyboard/focus, reduced-motion, and mobile/desktop checks do not establish real VoiceOver/NVDA behavior; manual assistive-technology testing remains release QA. No line/branch coverage percentage or broad production-load benchmark is claimed. Browser first-quiz timings characterize the specified fixtures; measure production latency separately before making performance claims.

## Local-preparation acceptance

Ordinary Python tests skip real PostgreSQL cases without an explicitly isolated test database; skips are not database acceptance. Run `.venv/bin/python scripts/containers/test-postgres-content.py` for the complete disposable PG17 gate. Use `--keyword` only for focused iteration. After migration or packaging changes, build a fresh API image and run `smoke-db-toolchain.py` against its installed wheel.

The existing native matrix check names remain unchanged. Manual workflow runs and tag pushes always run full native acceptance; ordinary push/PR jobs run it when backend, container/ops/scripts, dependency/configuration, content/domain/persistence, fixture or browser-test paths change. Unknown comparison bases run it conservatively. Learner/admin UI, documentation and skill-only changes retain the ordinary host gates without the repeated native build/load/rollback drills. Setup/helper checks still run in both matrix jobs.

Full native acceptance uses `.venv/bin/python scripts/containers/acceptance.py` on matching native AMD64 and ARM64 hosts/engines. It performs repeated clean builds, API/learner/proxy checks, least-privilege/schema/parity checks, load characterization, backup/restore and rollback drills, and packaged editor checks. Follow [container commands](local-containers.md) and [database acceptance](../backend/README.md#actual-bank-parity-and-isolated-recovery-acceptance). A local pass on one architecture does not certify the other or public deployment. Retain exact text, ordering, provenance, sequences, role grants, and recovery evidence.

Progress-backup accepted-engine checks and their retained browser/device follow-ups live in [B01–B14](work/ongoing/L0-browser-acceptance.md). Chromium/WebKit acceptance does not imply Firefox, real mobile/assistive-technology, or persisted BFCache acceptance. Use disposable progress. The optional `scripts/testing/probe-progress-*.mjs` tools model decisions; they do not test the application or replace production interruption/recovery tests.

Use PG17 backup tools, explicit migrations, isolated credentials, and uniquely owned disposable resources. See [toolchain requirements](decisions/0003-local-postgres-toolchain.md) and [progress recovery](progress-backup.md). Never run fixture/recovery experiments against personal progress or the authority database.

## L4 private paired services

[Service contracts](L4-paired-editor-services.md) are tested through authenticated HTTP and the actual editor role in the disposable PG17 suite. Preserve atomic saves/publications, original-result replay, burned reservations, stale context/intent handling, bounded Undo, retained activation, fresh authentication, failure rollback, pinned paired visibility, and private-data-free exports.

Build the shared policy with `npm run build:content-policy` before Python authoring tests/jobs. After policy or packaging changes, run `smoke-authoring-policy.py` against the fresh installed API image. [Policy](L4-content-policy.md) and [session](L4-admin-session-boundary.md) runbooks own the detailed checks. Signed synthetic tokens/session tests do not certify a hosted identity provider or MFA acceptance. Restored sessions require quarantine and a fresh external epoch.

## L4 HTTP editor browser gate

`npm run test:e2e:admin` uses a dedicated disposable PG17/API/identity fixture with a Vite development server. `npm run build:admin` checks optional production compilation separately; a dev-server browser pass does not establish packaged behavior.

For installed API/Nginx/editor acceptance, build fresh API/admin artifacts and run `.venv/bin/python scripts/containers/smoke-admin-http.py` with the appropriate image options. The complete suite covers login, exact paired edits, reservations, save/reload, publication, activation/export, expiry/logout, stale tabs, uncertain commits, pending text and narrow/desktop keyboard/layout behavior. Use `--grep` for focused development only. See [HTTP editor boundaries](L4-http-editor.md).

Keep these commands sequential with other suites/builds sharing `dist`. The fixture is never packaged. Specs import `test` from `e2e/admin-http/fixtures.ts` to reset shared authentication rate buckets; keep one worker per fixture database. A new browser context alone does not reset the global bucket. Private editor tests must not run against the ordinary learner-only fixture.

## L4 recovery preparation checks

[Authoritative recovery](L4-authoritative-recovery.md) owns retained-backup restoration, all-table/sequence/effective-grant parity, restored-session quarantine, writer retirement, allocation fencing and independent-journal reconciliation. `verify-postgres-release.py --small-fixture` rehearses these with disposable data; `--export-directory` verifies a selected immutable export's parity only. Neither proves off-device retention or routine-authority recovery.

Run `backend/tests/test_allocation_fence.py` and the real PG17 recovery regressions when those paths change. Preserve exhaustion/concurrency rollback, bypass denial, stale/foreign/incomplete evidence rejection, and ahead-journal recovery. Rebuild installed images after migration/resource changes. Ordinary pytest, a synthetic recovery report, and native CI do not close deferred retained-copy/provider acceptance gates.

## L5 launch freshness

`launchFreshness.test.ts`, runtime-bank and session tests cover monotonic expiry, cache hits, failed checks, cancellation, deduplication and explicit restart admission. The HTTP editor browser suite's `freshness.spec.ts` covers cached conflict/reload/restart, publication during confirmation, outage, unchanged-content resume, active study and transient review preservation.

For focused installed-image work, use a fresh retries-disabled admin build and `smoke-admin-http.py --grep L5`; retain the complete suite for acceptance. Real PG tests add independent readers, A → B → A, other-bank-only publication, and request/SQL/pool budgets. See [current launch requirements](product.md#content-freshness-at-launch).

## L5 protected diagnostics and operational canaries

`backend/tests/test_operations.py` and real PG tests cover sanitized events/500s, CORS, authenticated diagnostics, bounded pools, failure/reconnect behavior and no study writes. Run the PG launcher with `--restartable --keyword l5` for actual outage/recovery. The full installed HTTP editor smoke also probes secret canaries through API/Nginx logs; never print or retain failed raw canary logs. Fixture-only routes must remain unpackaged.

[Local operations](L5-local-operations.md) owns the twenty-learner load characterization, independent retained-release activation, fresh-target restore, and compatible application rollback commands and limits. Run `python -m pytest scripts/containers/test_load_rounds.py -q` when the harness changes. Native acceptance runs one load round and the rollback/recovery drills; explicit characterization uses three rounds. Keep retained-image source/schema fingerprints, all-table parity, source writer retirement, fresh auth epoch, and allocation reconciliation. No data/schema downgrade is permitted.

## Optional packaged HTTP admin

Follow [artifact deployment](L6-deployment-handoff.md#build-and-serve-the-local-artifacts). `node --test scripts/containers/check-admin-artifacts.test.mjs` verifies entry/module/routing exclusions. `smoke-admin-static.py` verifies shipped hashes, Nginx cache/API separation, and missing/disabled entry handling. `smoke-admin-http.py --frontend-image IMAGE` exercises the actual packaged assets; omitting the option uses fresh host assets. Native acceptance builds/checks this image after learner work.

For admin state/UI changes retain explicit keep/discard and save cancellation, focus return, stale context/unmount handling, hidden drafts during paired deletion, reason/preview invalidation, exact JSON/form/source/choice preservation, newer text during save, and subject edits without clearing either workspace. Check affected responsive layouts at 390/1048/1440px. Detailed observable obligations live in [the regression reference](testing-regressions.md), not historical completion reports.

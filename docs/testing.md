# Testing

Run checks appropriate to the change and follow the [regression requirements](testing-regressions.md) for affected behavior. CI executes frontend, backend, and browser checks in [checks.yml](../.github/workflows/checks.yml). Do not hand off a change while relevant gates fail.

## Commands

### While developing

Run the changed unit test directly, or start Vitest in watch mode:

```sh
npm test -- src/domain/quizEngine.test.ts
npm run test:watch
```

Choose affected tests using the ownership and regression guidance below. UI, shared content/rendering, persistence, schema, and transport work still needs the browser, backend, and content checks required by the affected-area guidance. A focused command speeds iteration; it does not replace the merge checks.

### Full verification

After Chromium has been installed and the backend development environment is set up, run:

```sh
npm run verify:full
```

The runner stops at the first failed step. It runs lint, formatting, architecture tests, the complete unit suite, actual-bank validation, backend Ruff/mypy/pytest, and TypeScript checking. It then creates a fresh learner production bundle with retries disabled, runs the learner browser suite against that bundle, creates the enabled optional admin production bundle, and runs the admin browser suite. Both browser suites use fixture banks; neither changes authored content. The learner bundle has a fresh build before preview starts. The admin build follows learner tests because both builds write to `dist`.

`npm run test:e2e` remains self-contained and builds fresh output with retries disabled before running Chromium. `npm run test:e2e:prepared` skips that build and is intended for `verify:full` immediately after `npm run build:learner:smoke`; do not use it with an old or differently configured `dist`. `npm run test:e2e:admin` runs against Vite's development server and does not need production output.

From the repository root, run the frontend checks:

```sh
npm run lint
npm run format:check
npm run test:architecture
npm test
npm run validate:content
npm run build
```

`npm run build` includes TypeScript checking for browser and maintenance code. `npm run typecheck`, `npm run build:learner`, and `npm run build:admin` are split commands for verification flows that already run TypeScript checking once. The Vite-only admin command enables both the admin entry and the production authoring editor. Test the optional admin build when changing entries, shared UI, authoring, or bundle boundaries, using the [enabled production editor command](../README.md#local-content-editor).

The ordinary build must omit `admin.html`; the optional build must include it. Both flags are needed to preview an enabled production editor. Verify initial and quiz-route chunk composition when changing lazy imports: API startup must not eagerly load canonical banks or the validation pipeline.

For the existing content service and shared stored-bank contracts (build the packaged authoring policy after installing npm dependencies):

```sh
npm run build:content-policy
.venv/bin/python -m pytest backend/tests -q
.venv/bin/ruff check backend/src backend/tests
.venv/bin/mypy backend/src
```

Follow [backend setup](../backend/README.md) to install the locked environment. For browser flows, install Chromium once and run the suites sequentially:

```sh
npx playwright install chromium
npm run test:e2e
npm run test:e2e:admin
```

The learner npm pretest builds production output with automatic retries disabled. Playwright starts FastAPI with `e2e/fixtures/bank.json` and the separate flashcard fixture on port 8765, and Vite preview proxies `/api` there. Override that port with `MEDUCATION_E2E_API_PORT`; this fixture service is separate from development API port 8000. The admin suite starts its own Vite development server. Fixtures never replace authored canonical files.

## Suite ownership and fixtures

- Vitest tests stay beside their domain, persistence, content, shared UI, feature, and authoring modules. App tests cover composition/navigation/drawer policy; quiz-to-subject lookup tests live with the quiz session contract.
- `src/test/setup.ts` mocks both canonical JSON imports, including transitive adapter imports, with `tests/fixtures/question-bank.json` and `tests/fixtures/flashcard-bank-contract.json`, and installs React Testing Library cleanup, matchMedia, and observer shims. Vitest uses two workers by default; CI calls `npm run test:ci` to make that limit explicit. Four workers varied between a fast pass and a slower failed run on the local machine, so they are not the default. The flashcard admin panel overrides its initial catalog with `tests/fixtures/empty-flashcard-bank.json`; backend quiz request tests use the same explicit empty baseline.
- `tests/fixtures/bank-contract-cases.json` is shared by TypeScript and Python stored-bank validators. Add cross-runtime edge cases there. `src/content/api/apiContract.test.ts` owns the separate API DTO contract.
- `backend/tests` uses explicit fixture paths for repository/request behavior; it must never mutate canonical banks.
- `e2e` covers production learner flows and the separate development authoring flow. Its populated flashcard fixture is selected through `MEDUCATION_FLASHCARD_BANK_PATH`.
- Admin browser tests intercept both canonical bank modules before navigation, using `tests/fixtures/question-bank.json` and `tests/fixtures/flashcard-bank-contract.json`. They retain a fixed populated baseline for loading, reset, replay, and export; exported question records and flashcard records are checked against their fixture contents. Deck actions are scoped to test-created records.
- Admin quiz navigator/status tests under `src/admin/components` use the small question-bank fixture to protect selection payloads, canonical row order, parent-dependent Add availability, and textual validation/workspace status. UI copy cleanup must retain diagnostic paths and busy feedback; do not lock incidental subtitles or colors into unit tests. The admin browser suite also checks keyboard access, primary-action color, panel radius, and horizontal overflow at 390px.
- Admin content-management regressions should cover quiz search and 25-item pagination beyond 200 records, draft retention while browsing, contextual cascade deletion for subject/quiz/deck/item/card, paired subject-delete validation and Undo, export gating while a paired transaction is staged, and bounded issue/bulk/import previews. Keep these tests fixture-based and assert the final quiz/flashcard pair, operation replay, stable IDs, and unchanged learner progress.
- The admin width regressions measure the actual navigator/editor bounding boxes at 390, 1048, and 1440 CSS pixels in both sections. They assert full-width stacked panels, top-aligned desktop columns, intrinsic navigator height, and no horizontal page overflow. Browser tests also cover cancellation and one-batch Undo for selected quiz items/cards, paired-deletion Undo barriers, and preservation of a hidden flashcard draft. Component/controller tests cover stale deletion reviews, severity pagination, selection scope, imported-reason restoration, wrong-parent/invalid deletion batches, and draft cancellation.
- Architecture tests under `scripts/architecture` use Node's test runner and are excluded from Vitest to avoid duplicate execution.

Use small versioned fixtures for schema, relationships, canonical ordering, sparse metadata, provenance, rendering safety, revision/serialization parity, scoring, and persistence. Do not assert production record counts or individual authored records in unit tests. Adding canonical flashcards must not change fixture-based starting catalogs.

`npm run validate:content` is the actual-data gate outside Vitest: it reads both authoritative JSON files and checks the full corpus once for structure, shared-subject references, Markdown/HTML/URL/LaTeX safety, and review metadata. Keep focused rendering cases in unit tests instead of duplicating this full-corpus scan. Intentional content changes follow [content management](content-management.md) and the schema guides.

## Architecture and formatting

`npm run lint` checks source, maintenance scripts, and ESLint/Vite/Playwright configurations, then runs the whole dependency graph. `npm run check:architecture` runs the graph alone. `npm run test:architecture` checks adversarial normalized/type/dynamic imports, alias resolution, peer-feature/presentation restrictions, storage access, transitive cycles, and eager learner banks/validators. [Architecture](architecture.md#checked-dependency-boundaries) defines the policy and its limits.

`npm run format:check` covers root JSON/tool configurations, TypeScript browser tests, maintenance TypeScript/JavaScript, and `src/shared/theme.ts`. Application-wide formatting remains incremental. `.prettierignore` protects canonical banks, fixture bytes, dependency locks, private source material, and generated output. Keep formatting-only work separate from behavior and dependency changes. A future alias must resolve consistently in TypeScript, Vite, tests, scripts, and architecture checks.

## Selecting verification

For source/config moves, run frontend gates and compare protected canonical hashes. For shared UI, feature, content-loader, or entry changes, also run both browser suites and both build modes; retain saved-attempt/checkpoint behavior, lazy screen imports, KaTeX assets, and accessible desktop/mobile layouts. Exercise explicit local mode and `/#content-qa` when their imports change. For backend packaging, stored contracts, or shared fixture changes, run Python checks as well.

Before handoff, confirm affected obligations in [the regression reference](testing-regressions.md), run `git diff --check`, and record results and existing advisories in the work tracker. Preserve stable IDs, ordering, answer provenance, current storage contracts, and export/replay behavior. Use a dedicated candidate/parity check for future schema migrations.

Automated role/label, keyboard/focus, reduced-motion, and mobile/desktop checks do not establish real VoiceOver/NVDA behavior; manual assistive-technology testing remains release QA. No line/branch coverage percentage or broad production-load benchmark is claimed. Browser first-quiz timings characterize the specified fixtures; measure production latency separately before making performance claims.

## Local-preparation acceptance

L3 Steps 2–3 add strict settings/lifecycle and paired-artifact fixture tests to
normal backend Ruff/mypy/pytest. After building `meducation-api:l3-step5`, run
`scripts/containers/smoke-db-toolchain.py --image meducation-api:l3-step5` to test
the installed wheel against isolated PG17: binary imports/libpq, repeatable
bootstrap and real packaged migration, restricted role/PUBLIC privileges,
backup grants, an independent synthetic migration, round trip and rollback.

Run `.venv/bin/python scripts/containers/test-postgres-content.py` separately for
80 real-Postgres schema/operation/file-transfer/learner cases. It creates and cleans a unique tmpfs
PG17 container with disposable credentials; it never targets the routine DB.
Normal pytest skips these cases unless an explicitly isolated test URL is
provided; skips are not Postgres acceptance. The suite checks SQL stored-contract
validation, exact fixture artifacts/digests/order/provenance, relational and
finalization constraints, protected histories, draft isolation, atomic activation,
idempotent replay and concurrent imports/reservations/publications. Existing
native AMD64/ARM64 container acceptance jobs invoke both checks. Local ARM64
results do not certify execution of these new tests on AMD64. Step 4 adds captured-file validation/import, CLI roundtrip/replay/stale
activation, independent export ordering/omissions/digest checks, corrupt-row
rejection and interrupted-output cleanup. Normal tests exercise source byte
capture, TypeScript rich-policy rejection, duplicate/unpaired-surrogate input
and reconstruction mismatch detection. Without `npm ci`, the two normal
Python cross-runtime capture/policy cases explicitly skip; native container jobs
have Node dependencies and exercise the gate, including rich-policy rejection.
Other Python cases remain independent of Node. Step 5 covers both repository
protocols and all learner endpoints against JSON fixtures, 200/304/404/409
precedence, publication during response construction, shared-subject digest
changes, old-release reactivation, bounded cache eviction and connection cleanup
on catalog/body/reconnect failures. Paired-source injection/response cleanup
also has DB-independent tests. Step 6 adds actual reader-socket termination and
aborted-transaction cleanup/reconnect checks. Run the separate
[actual-bank/recovery and PG proxy/browser commands](../backend/README.md#actual-bank-parity-and-isolated-recovery-acceptance).
They compare all records/routes/digests, all restored draft/history/allocation and
sequence state, and exact backend-switch/restart progress behavior. The reports
are independent of Playwright's cleaned output directory. Native acceptance now
runs these on both architectures, with one container browser run in PG mode.
Both native jobs passed in [run 38427563502](https://github.com/mfranco1/meducation/actions/runs/38427563502) at the current implementation commit; do not reuse that result for changed inputs without rechecking. Follow the
[job/runbook commands](local-containers.md#l3-explicit-database-jobs-and-toolchain-verification).

[Completed L0 decisions](work/done/L0-local-contracts-plan.md) are design/feasibility evidence. Their tests do not certify future application implementations. Keep frozen evidence under docs/work/done; record new feature results in ongoing stage trackers, without overwriting historical snapshots.

For [L1 progress backups](work/done/L1-progress-backup-plan.md), use disposable synthetic progress and record engine/version, command and observed results in [B01–B14](work/ongoing/L0-browser-acceptance.md). Run `npm run test:e2e:progress-backup -- --project=chromium`, `--project=firefox` or `--project=webkit` sequentially against a fresh learner bundle. The dedicated config covers download and exact paired round trips, capabilities, recovery admission, cooperating tabs/races, file cancellation, focus, narrow/enlarged-text/reduced-motion interaction, network failures, actual quota and real navigation. The default full runner is Chromium only.

The production restore tests inject interruption before/after every storage call and every recovery call, then reconstruct repositories and recover twice. Raw serialization tests include the exact escaped 64 MiB limit and lone surrogates; codec tests include the combined UTF-8 file limit and malformed contracts. File-resource tests check download initiation, URL replacement/cleanup and failure handling. Reuse session/repository regressions for timer pause, signature mismatch, deduplication, snapshots and retained statistics; do not substitute a design probe for production functions.

L1 closed on 2026-10-13 with passing Chromium/WebKit checks and the user's explicit Firefox testing deferral. B01–B12 retain the full-engine acceptance follow-up in the ongoing checklist. Firefox's host profile-launch failure remains unverified until a working run; a reinstall or OS-launched empty browser is not application acceptance. Record actual pageshow paths: the tested Chromium/WebKit configurations take safe fresh loads, while persisted BFCache returns remain unobserved. B13–B14 and real mobile/Safari lifecycle observations remain public-launch gates. See the [recovery runbook](progress-backup.md) for diagnosis using copies.

Retained design probes remain optional supporting tools: `node scripts/testing/probe-progress-restore.mjs`, `node scripts/testing/probe-progress-backup-limits.mjs`, and `node scripts/testing/probe-progress-coordination.mjs chromium webkit`. They generate temporary reports under /private/tmp and must not run against personal storage. Do not count model passes as application tests.

For L2/L3, follow [toolchain gates](decisions/0003-local-postgres-toolchain.md): reachable Docker, native Linux ARM64/AMD64 builds, clean locked Python resolution/imports, roles/URL separation, explicit migrations, exact canonical-text/ID/order/provenance parity and fresh-DB dump/restore. Metadata availability is not a running container. Use PG17 tools rather than the observed host PG14 dump. JSON/fixture tests remain independent of a production DB.

L2 Step 2 adds `scripts/containers/smoke-api.py` against a separately built API image; follow [API container commands](../backend/README.md#json-api-container). It uses disposable read-only containers, synthetic failure inputs and loopback ports to verify actual packaging/startup/content/health/shutdown. This check is separate from the host pytest suite and `verify:full`. Run Ruff on the smoke script when changing it. Record the tested native platform; an ARM64 pass does not satisfy AMD64 acceptance or the later real-proxy/browser/DB gates.

L2 Step 3 adds `scripts/containers/smoke-learner.py --browser` and `playwright.containers.config.ts`; follow the [container runbook](local-containers.md). The script checks the shipped assets/proxy/DNS behavior and runs learner workflows through Nginx with fixture API mounts. The config starts no host servers, requires a loopback `MEDUCATION_CONTAINER_URL`, and isolates output in `test-results-containers/`. Container-specific cases under `e2e/containers` are excluded from the host config. The keyboard manual-retry fixture uses a non-retryable response so it tests the action independently of the production build's automatic retry policy; other transient-error cases retain retryable responses. Run host and container browser suites sequentially. The container config now also runs the L1 paired progress-backup suite and a scoped frontend recreation test; record actual results per platform.

L2 Step 4 adds `scripts/containers/smoke-compose.py` after `docker compose build api frontend`. It uses a generated project/credential file/volume, checks default JSON operation and optional DB/port variants, rejects missing credentials, verifies TCP authentication and sentinel persistence after restart/recreation, then removes only its labeled disposable volume. `wait-compose.py` shares deadline-bounded, read-only readiness helpers with this smoke. Run Ruff on all three new Python files when changing them. No application DB schema/roles/import/parity or backup acceptance is implied; those remain later gates.

L2 Step 5 adds `scripts/containers/postgres.py`, its `postgres_tools.py` helpers and `smoke-postgres-tools.py`. Run Ruff on these files and the isolated smoke. It checks authenticated PG17 tools, escaped ephemeral pgpass, atomic 0600 custom dumps, preservation after failed dump, fresh-target restore/data/sequence equivalence, transaction rollback on a truncated archive, existing/reserved-target refusals and exact-label/unreferenced-volume deletion. No developer data is used. Runbook commands and synthetic evidence do not establish L3 least-privilege roles, schema head or canonical bank recovery parity.

L2 Step 6 uses `scripts/containers/acceptance.py` for two `--pull --no-cache` builds, both API/learner runtime smokes, a second-build Chromium suite, optional Compose/Postgres persistence and dump/restore. It rejects mismatched host/engine/image architecture. The existing Checks workflow adds native AMD64/ARM64 jobs and retains scoped logs/evidence/traces. Evidence output is separate from Playwright's cleaned output directory. `recreate-smoke-frontend.py` checks exact generated name/label/network/binding before replacing the frontend at the same origin. Run Ruff on container helpers, lint/architecture, format, build/typecheck and the actual acceptance runner after changes. CI configuration alone is not a passing native run. Failure commands print a bounded tail of their scoped log into Actions output; full container logs/traces remain artifacts. Host browser failures also retain `test-results/` artifacts. Hover assertions explicitly establish pointer position before checking a non-hover state; an initial pointer over the drawer must not be mistaken for a product failure.

For L4, follow [authentication gates](decisions/0004-single-editor-authentication.md): production-shaped injected tokens/code flow/session store, negative authorization/CSRF/expiry/revocation tests, dev-mode production rejection and all private HTTP routes. Final provider mapping/fresh-MFA evidence is pending before production integration; local mocks cannot certify hosted factor challenge, key rotation, logout, recovery or plan entitlements. Auth/session records restored from backup must be invalidated with a fresh external epoch. No private-token/real-progress fixtures or secrets in logs.

L4 adds the [paired authoring validation boundary](L4-content-policy.md). Build resources with `npm run build:content-policy` before backend tests/authoring jobs. The full runner and backend/native CI do this explicitly. Run `scripts/containers/smoke-authoring-policy.py` with the freshly built API image for the installed-wheel/real-nginx request-limit gate. Test-only smoke routes are never shipped; authenticated preview/publication routes remain later L4 work.

L4 Step 2 internal authoring adds real PG17 coverage in
`backend/tests/test_postgres_content.py`: all 98 cases pass, including rejected
preview/save/publish preservation, committed reservation retention, exact paired
reconstruction/provenance, ownership, stale context, distinct repeated releases,
original-result replay, concurrency, injected transaction/commit failures and
upgrade from populated L3 head. Run the disposable PostgreSQL launcher separately
from ordinary pytest (which skips these cases without its database environment).
After migration/resource changes, rebuild the API image and run
`scripts/containers/smoke-db-toolchain.py` against the installed wheel. Local
ARM64 evidence does not certify hosted or new native AMD64/ARM64 CI acceptance.

L4 Step 3 adds `backend/tests/test_auth.py` signed-token/JWKS/transport fixtures
and private-cookie/session/role tests in the real PG launcher, including a real
loopback code/PKCE issuer. Follow the [session runbook](L4-admin-session-boundary.md).
Synthetic MFA/time claims prove local checks only; hosted factor policy/freshness
and editor dirty-text/session UX acceptance remain distinct gates. New native CI
results must be verified separately from the local ARM64 image/recovery evidence.

## L4 private paired services

[Service contracts](L4-paired-editor-services.md) are tested through authenticated
HTTP and the actual editor role against disposable PG17. Run
`.venv/bin/python scripts/containers/test-postgres-content.py` for the complete
regression gate; `--keyword` is for focused development only. Ordinary pytest
skips these database cases without isolated credentials and is not their acceptance.
Failure injection covers history/audit and deferred commit, plus every authored
publication boundary. Replays, burned reservations, stale intent/context, bounded
Undo, retained activation, server-derived fresh-auth, expiry during validation,
concurrent saves/reservations, pinned paired reader visibility and deterministic
private-data-free ZIPs are included. Installed-image migration/policy smokes cover
packaging; actual corpus recovery checks compatibility only. Hosted identity,
browser editor integration, authored-history recovery/off-device retention and
new native CI remain later gates.

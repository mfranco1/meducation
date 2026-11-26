# Test and CI consolidation

## Scope

Cut CI time and billed minutes, and remove duplicated or styling-only tests, without losing any invariant listed in [testing](../../testing.md#behavioral-invariants-to-keep-covered). No new infrastructure, suites or tools.

One phase per session. After each phase, update this file and `docs/testing.md` if a command or CI behavior changed.

## Baseline (run 45687399165, 2026-11-25)

| Step | Time |
| --- | --- |
| Admin browser suite (33 tests) | 168 s |
| Learner browser suite (50 tests, one worker) | 98 s |
| `npm ci` | 35 to 49 s, once in each of three jobs |
| Unit tests (763 tests, 102 files) | 64 s, 55% jsdom setup and imports |
| PostgreSQL backend tests (113) | 57 s |
| Learner Docker image build | 49 s, for one 52 ms Nginx test |

About 13 billed minutes per run (frontend 3, backend 3, browser 7), about 60 runs a month. Target: 6 to 7 billed minutes.

## Phase 1: CI workflow and runner config

- [x] Merge `backend`, `frontend` and `browser-smoke` in `.github/workflows/checks.yml` into one job. Order: installs, lint and format, ruff and mypy, typecheck, unit tests, backend tests, learner browser suite, admin browser suite. Keep the trace upload on failure, the concurrency group and `paths-ignore`.
- [x] Drop the separate `build:learner` and `build:admin` steps if the browser suites already build both entries (check that the "ordinary build omits `admin.html`" rule is still verified somewhere).
- [x] Move the learner image build and the Nginx check to their own workflow with a `paths:` filter (`Dockerfile`, `.dockerignore`, `ops/containers/**`, `scripts/containers/**`, the workflow file). The Nginx test only uses `request`, so it needs no browser install.
- [x] Run backend pytest once: have `scripts/testing/test-postgres-content.py` run all of `backend/tests` instead of only `test_pg_*.py`, and remove the plain pytest step from CI. Keep `--keyword`. Local `pytest backend/tests` without a database must still skip the PostgreSQL cases.
- [x] Learner Playwright config: two workers, `fullyParallel`. Confirm no learner test depends on another test's server state. The admin config stays serial (shared database).
- [x] Vitest: run pure-logic tests in the `node` environment and keep jsdom for component, hook and persistence tests. Use Vitest `projects` or per-file `@vitest-environment` comments, whichever is less config. Check the current Vitest 5 docs first.
- [x] Update `docs/testing.md` (CI summary paragraph, backend rows, Nginx row).
- [ ] Record new timings here from the first green run (not pushed yet).

Phase 1 notes: the learner suite's build now runs `check-learner-artifacts.mjs`, so every CI run checks the learner build omits the admin entry and modules. The Nginx check is curl in `learner-image.yml`, not Playwright, since the learner config starts its web servers for any test. Local timings: learner suite 98 s to about 85 s, backend 310 tests in one 101 s run, unit tests about 5% faster (54 of 102 files are `.tsx`, so most still use jsdom).

## Phase 2: admin browser suite

- [ ] Sign in once per worker (`storageState` or a worker fixture) and reset the draft through the API, instead of login, discard and reload in every test (about 3 s each).
- [ ] Replace the six width-parameterized layout tests (`editor.spec.ts` "keyboard access and layout", `workflows.spec.ts` "panels use available width") with one overflow check at 390px inside an existing test. Drop the RGB colour, border radius and header height assertions.
- [ ] Reduce "structured editing preserves untouched fields" from five kinds to question and card.
- [ ] Delete `screenshot()` calls in both browser suites (25 across 7 files). Nothing compares them; traces cover failures.
- [ ] Find out why `freshness.spec.ts` takes 23 s and shorten it if the wait is avoidable.

## Phase 3: admin unit and browser overlap

The backend PostgreSQL tests, the unit tests backed by the in-memory fake server (`src/test/adminGateway.ts`), and the admin browser suite cover the same save, create, bulk add, move, delete, discard, publish, revert and conflict behaviors.

- [ ] List each behavior and the layers that test it (`FlashcardAdminPanel`, `QuizAdminPanel`, `AdminWorkspace`, `HttpAdminApp` unit tests against `e2e/admin-http`).
- [ ] Keep one layer per behavior: browser for real round trips, auth and conflicts; unit for editor-state edge cases. Delete the duplicates.
- [ ] Shrink `adminGateway.ts` to what the remaining unit tests use.

## Phase 4: learner unit and browser overlap

- [ ] Loading, failure, shimmer and retry states: keep in the screen unit tests (`SubjectScreen`, `DashboardScreen`, flashcard screens), remove the matching browser tests in `learner-smoke.spec.ts` and `subject-cards.spec.ts` unless they check something only a browser can (reduced motion, focus, real network abort).
- [ ] Fix or remove the pixel-position checks in `landing.spec.ts` "header and hero links jump" (`y - 96 < 2`) and "flashcard steps track" (`scrollIntoViewIfNeeded`). Both flaked locally; the first also on the old serial config.
- [ ] Geometry: keep the no-horizontal-overflow sweep at the design-system widths. Remove pixel-alignment and computed-style checks in `subject-cards.spec.ts`, `continue-studying.spec.ts`, `landing.spec.ts` and `learner-smoke.spec.ts`.
- [ ] Landing: 15 tests. Keep first visit, start studying, deep link and saved-progress routing; review the rest.
- [ ] `App.test.tsx`: drop flows already covered end to end by `learner-smoke.spec.ts`, or the reverse, one layer each.

## Decisions

- One CI job, cheapest checks first. Wall time rises from about 6.5 to about 9 minutes before the later phases; billed minutes fall.
- Browser tests are for what only a browser shows: reload, history, storage, focus, overflow, real server round trips. Rendering states belong in unit tests.
- Styling values (colours, radii, pixel sizes) are not tested.
- Skill tests under `.agents/` stay local only.

## Results

| Phase | Billed min per run | Admin suite | Learner suite | Unit |
| --- | --- | --- | --- | --- |
| Baseline | 13 | 168 s | 98 s | 64 s |

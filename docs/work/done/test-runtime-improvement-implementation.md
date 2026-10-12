# Test runtime improvement plan

Implemented 2026-10-12. Verification gates passed across sequential and focused runs; one end-to-end wrapper attempt exposed a browser assertion issue that was fixed and retested. CI will exercise its two-worker setting on the next run. Evidence and baseline: [current timing report](../done/test-runtime-investigation-2026-10-12.md).

## Objective

Shorten the development feedback loop and full local verification without losing regression coverage. The implementation keeps Vitest at two workers, fixture-isolates the admin browser suite, and avoids repeated TypeScript checks in CI. It does not change runtime application behavior, canonical content, stable IDs, answer provenance, storage contracts, or backend infrastructure.

All timing targets below are acceptance goals, not guaranteed savings. Measure comparable runs sequentially and distinguish runner duration from npm prerequisites and CI installation time.

## 1. Separate pure tests from DOM tests

- [x] Profile worker counts against the real repository configuration; retain two for local and CI runs.
- [x] Keep one jsdom project with isolated per-file execution and the existing Vite plugins; move the default worker setting into Vite config.
- [x] Retain the shared fixture mocks and DOM setup in their existing single setup file.

The two-worker baseline passed **73 files/439 tests in 75.20 seconds in Vitest**. Four workers produced one 41.52-second passing run, then a 95.32-second run that failed while the flashcard integration test waited for its card to load. A four-worker option in each of two test projects took 134 seconds; a one-Node/two-DOM split took 123 seconds. These results are too inconsistent to use four workers by default. The Node/jsdom split was dropped: runs with the repository's actual plugins ranged from 64.86 to 93.31 seconds against a 76.27-second baseline, without a reliable gain.

## 2. Fixture the admin browser question bank

- [x] Intercept the question-bank fixture alongside the existing flashcard fixture and derive subject labels from that fixture.
- [x] Keep all three browser flows and verify exported questions and flashcards preserve their fixture records.
- [x] Keep actual-bank validation as the full corpus gate.

All three tests passed. The CRUD/replay flow took 11.7 seconds in the latest run, compared with 25.9 seconds in the baseline. Total admin command time varied across trials, so no stable suite-wide reduction is claimed. No authored bank changed.

## 3. Provide focused development commands

- [x] Add focused and watch-mode unit commands and document affected-area requirements.
- [x] Add the documented `npm run verify:full` runner, retaining standalone commands.
- [x] Keep full actual-bank validation in full verification and CI.

Acceptance: focused edits do not trigger both browser suites and all builds automatically. Full verification still executes the required gates. Watch reruns reliably pick up shared dependencies, bank fixture changes, and setup changes; using a focused command never substitutes for required pre-merge coverage.

## 4. Remove repeated compiler/build orchestration

- [x] Expose `typecheck`, Vite-only learner/admin builds, and a retry-disabled learner smoke build; retain the type-checking `npm run build` contract.
- [x] Build the learner artifact immediately before prepared browser tests, then build the optional admin entry afterward.
- [x] Update CI to type-check once in the frontend job and keep the browser job independent with its own fresh learner build.

Acceptance: no stale `dist` reuse, no build-mode mixups, and no standalone command that silently loses its promised type check. Record actual TypeScript/build savings and end-to-end local/CI duration; reject orchestration that lengthens the CI critical path. Changes to build/entry configuration require both build modes and both browser suites.

## 5. Improve browser scheduling after the first fixes

- [x] Benchmark browser test-level parallelism. Keep `fullyParallel: false` after it caused the API-backed quiz flow to time out alongside the geometry-heavy subject-card test.
- [x] Retain two browser workers and independent contexts.
- [x] Replace the fixed 200 ms delay with a condition-based wait for the screen transition to finish.
- [x] Keep the current screenshots and throttled scenario; parallel timing conflicts make splitting or optional capture premature.

Acceptance: all **13 learner tests** remain discoverable and pass; persistence/reload, navigation confirmation, retry, mobile geometry, keyboard, reduced motion, and production lazy-loading obligations remain. Compare wall time and flakiness across repeated runs. No increased retries used to conceal concurrency failures. Browser parallelism savings are currently unmeasured.

## 6. Profile remaining expensive component interactions only if needed

- [x] Reprofiled the slowest unit bodies and admin browser flows. No individual unit assertion warranted removal.
- [x] Retained accessible queries and integrated coverage. No test assertions or backend contract cases were removed.

Acceptance: coverage mapping follows the regression reference; measurable component-file improvement with behavior preserved. Do not disable isolation globally, adopt a VM pool with unresolved Web Crypto failures, switch DOM implementations, or merge unrelated tests merely to reduce file count.

## Verification and completion

- [x] Record the current timings, passing test counts, warnings, and implementation tradeoffs in the investigation report.
- [x] Run lint, formatting, architecture tests, unit tests, content validation, TypeScript, both build modes, and both browser suites. Backend code and contracts did not change; its existing suite passed during the investigation.
- [x] Keep CI jobs parallel and update the testing documentation.

The full `verify:full` wrapper ran through content validation, backend checks, typecheck, and the learner build, then exposed a timeout in the mobile quiz assertion. The visibility check passed, but Playwright's `boundingBox()` locator stalled; replacing it with a single rendered-position read fixed the isolated test and all 13 learner browser tests passed. The 3 admin tests passed as well. The wrapper was not rerun end to end after that fix; its remaining stages passed in focused or earlier runs. Local runs used Node 26.7.0. The CI Node 22 run remains the next validation of the workflow changes. No total suite-wide speedup is claimed from the single-run admin fixture measurements. Unit-suite timings varied from 74 to 111 seconds across sequential runs, so the two-worker cap is retained for consistency rather than as a measured speedup.

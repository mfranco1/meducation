# Current test runtime investigation

Date: 2026-10-12. Investigation complete; implementation is proposed in [the improvement plan](../ongoing/test-runtime-improvement-plan.md).

- [x] Read current testing/architecture guidance, CI, configs, and historical investigations.
- [x] Measure current verification commands without overlapping heavy runs.
- [x] Profile unit tests and evaluate temporary environment/worker experiments.
- [x] Measure both browser suites and evaluate an admin fixture experiment.
- [x] Identify safe simplifications and document an implementation plan.
- [x] Record verification and preserve application code, tests, configuration, and canonical content.

## Findings

The main unit-test bottleneck is repeated environment and import setup, rather than an individual long-running test. `npm test` creates jsdom and runs `src/test/setup.ts` for every file, including pure domain, validation, API, selector, and admin-core tests. That setup imports React Testing Library and DOM matchers, installs browser observers, and mocks both banks. The two-worker cap limits how much of that overhead can overlap.

The previous duplicated whole-bank Markdown unit test has already been removed. Small canonical-import fixtures are already installed. Do not repeat the historical recommendations as unfinished work: [fixture-based unit tests](fixture-based-unit-tests.md) records their implementation. The unit suite has since grown from 61 files/363 tests to 73 files/439 tests; older timings describe another repository state and are not controlled comparisons.

The admin browser suite still imports the actual 11,687-question bank. Its `beforeEach` substitutes only flashcards. `AdminApp` creates its gateway from `storedQuestionBank`; coordinated preview/reset/replay reaches `validateAdminBank`, which scans question Markdown. Browser workflows are therefore coupled to authored question volume even though their assertions concern small authoring operations.

The complete documented workflow also includes full content validation and multiple production builds. `npm run test:e2e` always runs `pretest:e2e`, which performs `tsc -b && vite build` with retries disabled. CI separately runs learner and admin builds in the frontend job, then builds the learner again in its independent browser job. Some build differences are intentional; a regular learner artifact is not automatically interchangeable with the retry-disabled browser artifact.

## Measurement conditions

Local macOS, Node 26.7.0, npm 11.19.0, Vitest 5.0.3, jsdom 30.1.0, Playwright 1.63.0. CI uses Node 22. Heavy checks ran sequentially. Existing development Vite/API processes were left running; no controlled cold-cache reset was performed. These are single-run measurements, not medians or CI predictions. Subsequent candidates can benefit from warmed caches.

Raw JSON reports, logs, phase reporter, and temporary configs/specs are in `/private/tmp/meducation-test-profile-20261012`. That directory is disposable; the durable results are recorded below. Profiling used default/list plus JSON reporters. Elapsed command times include npm/CLI startup; runner times are identified separately. Phase totals and CPU times are cumulative across workers and must not be added to elapsed time.

## Current checks

- Unit suite: **76.27 seconds elapsed**, 75.20 seconds reported by Vitest; **73 files/439 tests passed**. Vitest reported 59.35 seconds of cumulative environment creation, 43% of tracked phase time. Individual test bodies totaled approximately 39.30 seconds across workers.
- Backend pytest: **1.22 seconds elapsed**, 39 tests passed (0.62 seconds reported by pytest). Slowest call approximately 0.05 seconds.
- Lint, including the repository architecture graph: **4.41 seconds**, passed.
- Formatting: **0.65 seconds**, passed.
- Architecture policy tests: **1.45 seconds**, passed.
- Actual-bank validation: **12.62 seconds**, passed for 11,687 questions, 111 quizzes, 1,712 flashcards, and 98 decks. Existing answer-review warnings remain.
- Learner build, including TypeScript: **12.27 seconds**, passed; Vite reported 3.39 seconds.
- Optional admin build, including TypeScript: **14.94 seconds**, passed; Vite reported 5.63 seconds.
- Learner browser command, including its fresh retry-disabled build: **55.24 seconds**, 13 tests passed; Playwright reported **37.94 seconds** including server lifecycle. The remaining approximately 17.30 seconds includes the prerequisite build and outer command overhead.
- Admin browser command: **38.19 seconds**, three tests passed; Playwright reported **37.1 seconds**.

Adding those successful command measurements gives **217.26 seconds, approximately 3 minutes 37 seconds**, for this particular sequential local checklist. There is no repository `test:all` command. This sum excludes dependency/browser installation, Ruff/mypy, manual QA, and failed sandbox attempts. It is not CI elapsed time: the three existing CI jobs already run in parallel.

## Slow unit bodies

File durations below exclude environment/import overhead:

- `src/admin/FlashcardAdminPanel.test.tsx`: 9.353 seconds.
- `src/features/quizzes/screens/QuizScreen.test.tsx`: 5.668 seconds.
- `src/app/App.flashcards.test.tsx`: 3.771 seconds.
- `src/features/flashcards/screens/FlashcardStudyScreen.test.tsx`: 3.566 seconds.
- `src/app/App.progressive.test.tsx`: 3.050 seconds.

These five account for roughly 25.4 of the 39.3 cumulative test-body seconds. The slowest individual tests were streak reset/recovery (2.153 seconds), paired admin reset (2.111 seconds), and saving arrow navigation on exit (1.844 seconds). They exercise multiple real renders, accessible queries, and state transitions. No measured individual test justifies removal solely because of its duration.

Timeout declarations are upper bounds, not delays. Transport/retry tests already use fake timers. The learner browser code has one explicit 200 ms wait, so fixed sleeps do not explain the observed minute-scale workflow.

## Temporary experiments

### Node/jsdom split, two workers

An explicit 35-file Node project received only canonical fixture mocks; 38 DOM files retained the existing jsdom setup. Browser storage-event snapshot tests and React hook tests remained in jsdom. Local repository tests that supply/stub their storage passed in Node. Isolation remained enabled. Temporary configuration was independent of the committed Vite configuration; integrating it must preserve the existing plugins and build behavior.

**All 73 files/439 tests passed in 41.85 seconds elapsed** (41.38 seconds reported by Vitest), approximately **45% below the default trial**. Cumulative environment creation fell to **21.70 seconds**, collection to 19.05 seconds, setup to 4.07 seconds, and bodies/hooks totaled 27.09 seconds. Process CPU was 92.45 seconds user plus 13.41 seconds system.

The temporary Node setup initially failed mock-API discovery when `vi` was imported via an absolute package path. The corrected experiment used Node-project globals and passed. The failed run is not a performance result. Committed setup should import `vi` normally from `vitest` and does not need globals merely to work around a temporary path.

### Existing setup, four workers

**All 73 files/439 tests passed in 42.01 seconds elapsed** (41.52 seconds reported by Vitest), approximately **45% below the default trial**. This still created jsdom 73 times, accumulating 64.46 seconds of environment creation. Process CPU was 169.64 seconds user plus 28.71 seconds system: approximately 1.9 times the split candidate's aggregate CPU for similar elapsed time.

Use the direct Vitest CLI for this experiment: `npm test -- --maxWorkers=4` fails because the script already passes `--maxWorkers=2` and Vitest rejects duplicate values. Put worker configuration in the config when implementing an overridable setting. Extra workers are promising on this machine, but are not a demonstrated improvement on constrained CI runners.

### Small question bank for admin browsers

A temporary copy of the three admin browser tests intercepted the question JSON module as well as the existing flashcard module. It used the four-question/two-subject fixture with the subjects' existing browser-expected display names. Browser assertions and authoring actions were preserved; no repository spec or canonical file was edited.

**All three tests passed in 17.93 seconds elapsed**, versus 38.19 seconds; approximately **53% faster**. The CRUD/replay test fell from **25.9 seconds to 8.4 seconds**. The other flows took 1.4 and 4.7 seconds. This demonstrates that small-bank browser integration coverage can retain these flows while avoiding production-bank cost. An initial temporary spec lacked an ES-module package declaration and failed collection; the corrected passing run supplies the result above.

## Coverage and simplification decisions

Keep scoring, provenance/order, persistence failures, stale revisions, cancellation, shared TypeScript/Python contracts, and rich-content safety coverage. Cross-runtime contract tests are intentional, not redundant. Node architecture tests are already excluded from Vitest. The standalone architecture graph and adversarial policy tests serve different purposes.

Keep actual-content validation as an explicit gate. Its stored/hydrated checks inspect different contracts; this investigation does not prove that any can be removed safely. Throttled browser latency measures a distinct scenario and takes only 4.28 seconds of test time. No broad test deletion is supported by these measurements.

Browser geometry, keyboard, API integration, and reload persistence overlap conceptually with unit coverage but verify real-browser behavior. Screenshots here are evidence attachments, not golden-image comparison tests. Make optional capture and performance scenarios separately selectable if needed; preserve assertions and required release coverage.

Eleven learner tests share `e2e/learner-smoke.spec.ts`; `fullyParallel: false` serializes them within that file. Only the two subject-card tests run in a second file. All three admin tests share one file. File grouping is a more direct browser parallelism constraint than the number of installed workers. Browser parallelism has not been benchmarked here.

## Verification and limitations

Current default unit tests, backend tests, lint, formatting, architecture tests, full-content validation, both builds, and both current browser suites passed. The two passing unit candidates and the admin fixture candidate retain their full respective test counts. Existing backend dependency deprecation, answer-review, Vite chunk-size, and browser environment-color warnings remain.

Content validation and browser server binding initially failed under sandbox IPC/listen restrictions; reruns with approved execution permissions passed. Exclude those failed attempts from timing comparisons. No tests were skipped, and no implementation/configuration/content changes were committed by this investigation. Only the report and plan were added.

The projected combined unit/admin saving is approximately **55 seconds per full local checklist** using these isolated trials. It has not been measured as a combined implementation. Repeated measurements on Node 22 and this local environment are required before promising a stable percentage or adopting runner settings.

Primary references: [Vitest performance](https://vitest.dev/guide/improving-performance), [Vitest projects](https://vitest.dev/guide/projects), [Playwright parallelism](https://playwright.dev/docs/test-parallel), and [Playwright web servers](https://playwright.dev/docs/test-webserver). Their documented environment/isolation and file-parallelism behavior supports the configuration analysis; local measurements establish the numbers above.

# Test performance investigation

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

Scope: measure slow tests and suite overhead, explain the causes, and propose a fix. Keep the existing CI fixture fixes and canonical content intact.

- [x] Inspect existing run summaries, configuration, and validation code.
- [x] Capture frontend per-test timing and backend duration reports.
- [x] Trace the slow tests and shared startup costs.
- [x] Evaluate configuration experiments without leaving changes in production configuration.
- [x] Record results and a prioritized proposed fix.

Previous successful frontend run: 61 files, 364 tests, 107.03 seconds. Vitest reported 82.53 seconds of cumulative jsdom creation across 61 files; these cumulative worker timings are not elapsed wall time. An earlier run overlapped production builds and took 186.74 seconds with a 60-second timeout in full-bank Markdown validation.

## Fresh profile

Measured locally with Vitest 5.0.3, Node 26.7.0, two workers, and no concurrent build. These are local measurements; CI uses Node 22. A stale Vitest 3.2.7 cache was excluded from the findings.

The default suite passed 364 tests across 61 files in 105.37 seconds. A JSON reporter captured individual test durations and a temporary custom reporter captured module diagnostics. Reports are in `/tmp/meducation-test-timing.json` and `/tmp/meducation-test-phases.json`.

Slowest individual tests:

- `src/content/markdownValidation.test.ts` / validates every canonical question: 34.201 seconds.
- `src/app/App.progressive.test.tsx` / lazy question load and saved attempt: 3.030 seconds.
- `src/admin/FlashcardAdminPanel.test.tsx` / reorder/export/reset: 1.868 seconds.
- `src/app/screens/QuizScreen.test.tsx` / streak reset and recovery: 1.604 seconds.
- `src/admin/FlashcardAdminPanel.test.tsx` / paired reset: 1.478 seconds.

Slowest test files, excluding imports and environment setup:

- Markdown validation: 34.408 seconds for 7 tests.
- Flashcard admin panel: 12.559 seconds for 12 tests.
- App progressive loading: 6.110 seconds for 6 tests.
- Quiz screen: 3.960 seconds for 8 tests.
- Quiz review screen: 2.077 seconds for 4 tests.

The backend passed all 40 tests in 1.35 seconds. Its slowest test was canonical question-bank load at 0.69 seconds; other calls were at most 0.06 seconds.

## Causes

The full-bank Markdown unit test runs the rich Markdown parser over 23,551 fields (11,687 stems, 11,687 rationales, 177 sources), containing 10,492,346 characters. `scripts/validate-question-bank.ts` already calls the same `validateQuestionMarkdown(questions)` function, and CI runs that command after the unit suite. This is duplicated whole-corpus work. The parser performs AST traversal and HTML/link/image/math safety checks; KaTeX renders encountered formulas to verify them. This work is synchronous and does not gain intra-test parallelism from additional Vitest workers.

Every frontend file currently receives jsdom and `src/test/setup.ts`, including 30 pure logic test files that passed under Node in the project experiment. Default-run module diagnostics totaled 65.62 seconds of environment setup, 41.15 seconds of test-module imports, 11.10 seconds of setup scripts, and 77.44 seconds of test bodies/hooks. These are cumulative timings across parallel workers, not additive elapsed-time savings. Test-module collection includes importing MUI, React, Markdown packages, and canonical bank adapters.

The panel suite uses an empty flashcard fixture but still imports the full question-bank adapter to obtain 13 subjects. The panel renders per-subject authoring controls and these tests repeatedly query accessible roles, interact, render updates, and replay revisions. This explains its accumulated UI cost; no individual panel test exceeded two seconds in the default fresh profile. App progressive tests exercise actual lazy screen loading and persistent attempt behavior. Their configured 10/15-second limits are maximum limits, not intentional waits.

## Configuration experiments

- Split projects with 30 Node files and 31 jsdom files, DOM setup only in the jsdom project, retaining isolation and two configured workers: all 364 tests passed in 113.74 seconds. Cumulative environment setup fell to 41.12 seconds, but test execution rose to 116.25 seconds; whole-bank Markdown validation alone took 56.46 seconds. One trial did not show an elapsed-time improvement, so this is not a demonstrated standalone speed fix.
- `--pool=vmThreads`: elapsed time fell to 73.45 seconds, but 33 tests failed because `crypto.subtle` was unavailable. This configuration cannot be adopted as-is. A follow-up temporary Web Crypto setup experiment failed during collection because the VM executor could not resolve the setup module outside the repository; it provides no evidence that the compatibility issue is resolved. No test pool or setup changes were left in the repository.
- An initial split-project attempt inherited DOM setup in the Node project; it was stopped and corrected before the completed split-project measurement.

Vitest documents per-file environment overhead, project splits, VM isolation, and pool tradeoffs: https://vitest.dev/guide/improving-performance and https://vitest.dev/guide/projects.

## Proposed fix, incorporating the PostgreSQL direction

1. Keep unit and API tests independent of production banks. Use small versioned fixtures that cover schema constraints, shared-subject/deck/card relationships, answer provenance, order, rich-content safety, serialization/revision parity, and application behavior. Replace fixed production counts and production-record selection with fixture assertions. Backend canonical-load coverage can also move to the data-validation gate.
2. Remove the full-corpus loop from `markdownValidation.test.ts`; retain its focused parser/safety/provenance cases. Run actual-bank validation once through the existing `npm run validate:content` command while JSON is authoritative, ideally in a content-specific CI gate triggered by bank, schema, or validator changes. When PostgreSQL replaces JSON, apply these validation rules at authoring/import and migration boundaries. Removing duplicated corpus validation is supported by the source comparison and 34.201-second measurement; the resulting full-suite elapsed time has not been benchmarked.
3. Give panel and admin/core suites explicit two-subject fixtures and small populated/empty flashcard fixtures. They should not import the 11,687-question adapter merely to obtain subjects. Preserve dedicated repository/contract tests, including small nonempty catalogs and invalid references.
4. Reprofile after those changes. Consider Node/jsdom separation then, with measured elapsed time as the acceptance criterion. Keep the current pool for the initial fix. Avoid overlapping heavy full-content validation with production builds on constrained runners.

Schema validation alone is insufficient to verify scoring, progress, API behavior, Markdown safety, and content migration. These behaviors can all be exercised with fixtures and will remain relevant after switching storage to PostgreSQL. Actual-data validation and unit behavior testing serve different purposes and should have separate gates.

No application code, test assertions, CI configuration, or canonical content was changed during this investigation. The temporary profiler and experimental configurations live in `/tmp`; only this report is a repository change from the investigation.

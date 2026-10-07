# Repository organization — Stage 0 baseline

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

Captured: 2026-10-06 (Asia/Manila). Starting commit: `e4e07944f354966a7b8f67d678ad58d472e39a05`.

Status: Stage 0 complete; waiting for the user's signal to begin Stage 1. This stage records the migration baseline; it makes no runtime or canonical-content changes.

The working tree initially contained only the untracked organization plan. No nested AGENTS.md was found. The machine-readable [baseline snapshot](repository-organization-baseline.json) records tracked-file hashes, locked dependency versions, import/mock/path references, canonical hashes, build output, and the exact Stage 2 moves. Large logs, traces, downloads, and screenshots are local evidence under `/private/tmp/meducation-organization-stage-0/`; they are temporary and should be preserved separately if comparisons must survive temporary-directory cleanup.

## Inventory and lifecycle

The starting commit tracks 301 files: 182 in `src`, 68 in `docs`, 19 in `backend`, 6 shared fixture files, 4 browser-test/fixture files, and 3 scripts; the remainder are root/tooling assets. Frontend source comprises 101 app files, 32 content files, 26 admin files, 9 persistence files, 8 domain files, 2 analytics files, and one file each for QA and test setup, plus two root entry/type files.

Five tracked `backend/src/meducation_api.egg-info` files are packaging output, scheduled for Stage 1. Local caches, `.venv`, `node_modules`, `dist`, browser results, and local env files are ignored. The source banks and Markdown renderer are correctly tracked despite the broad `content/` ignore pattern.

Ignored material is substantial and must be classified before cleanup:

- `tn-pdfs/`: 171 files, 1,777,080,563 bytes. Private source PDFs and ancillary material; no tracked current runtime consumer was found. Do not assume these are reproducible.
- Root `content/`: 105 files, 20,035,409 bytes, including extracted material, review reporting, and explanation audits. `scripts/audit-explanations.ts` still writes `content/explanation-audit.json` relative to the repository working directory.
- `public/content/`: 99 files, 14,533,514 bytes, including a historical manifest and quiz JSON shards. Current runtime imports do not consume that manifest, but Vite copies these public files to the production output. A local build therefore includes material absent from a clean checkout. Preserve this fact in bundle comparisons and address its intended lifecycle separately.
- `scripts/__pycache__/`: three ignored cache files, 35,292 bytes; source extraction scripts referenced by the bytecode are no longer tracked.

## Protected canonical and persistence contracts

Question bank: `src/content/questionBank.generated.json`, schema v4, 13 subjects, 111 quizzes, 11,687 questions, 16,456,246 bytes.

```text
SHA-256 11b3fd084f4462c16805069883f53defd538a4d0bcd4d3537ab4c101bd7a3901
```

Flashcard bank: `src/content/flashcardBank.generated.json`, schema v2, 13 decks, 674 cards, 177,786 bytes. Its subject catalog comes from the question bank.

```text
SHA-256 cbec278cddfd655fe4f01d1112ac62fd94e1de090ddbffaf7159d640b5f98b04
```

Preserve both files byte-for-byte, including stable IDs, array/choice order, source and verified answers, formatting, and provenance. Do not rename them because of their historical `.generated` suffix.

Quiz progress uses `meducation.progress.v2`; legacy keys are `meducation.completed-attempts.v1`, `meducation.completion-counts.v1`, `meducation.lowest-scores.v1`, `meducation.latest-scores.v1`, `meducation.active-attempts.v1`, and `meducation.quiz-activity.v1`. Flashcard progress uses `meducation.flashcards.progress.v2`, with legacy `meducation.flashcards.progress.v1`. Keep retained-history limits, migration timing, frozen snapshots, optimistic revision checks, and content-signature semantics unchanged.

Preserve API route/revision behavior under `/api/v1/subjects`, `/api/v1/quizzes`, and `/api/v1/flashcards`, health readiness, ETags, and conditional/conflict handling. Authoring remains staged in memory; exports keep `questionBank.generated.json`, `question-bank-change-set.json`, `flashcardBank.generated.json`, `flashcard-bank-change-set.json`, and coordinated `content-export-manifest.json` semantics.

## Dependencies and path-sensitive consumers

Actual local tools: Node 26.7.0, npm 11.19.0, Python 3.14.7. CI selects Node 22 and Python through `backend/.python-version`. Record local results as local results; no CI run is claimed.

Locked frontend versions include React 19.3.0, MUI 7.3.11, TypeScript 5.9.3, Vite 7.3.6, Vitest 5.0.3, Playwright 1.63.0, ESLint 10.12.0, and tsx 4.23.13. The snapshot records every direct requested/locked dependency. Package-lock SHA-256 is `6e5dc4db44f221ca22bd7cfdfb26d0fdf69fa92254254baa73dc2f97cb5d6422`.

Installed Python versions include FastAPI 0.142.2, Starlette 1.7.0, Pydantic 2.13.5, pydantic-settings 2.15.0, Uvicorn 0.54.0, pytest 8.4.2, Ruff 0.16.9, mypy 1.20.2, and httpx 0.28.1. Requirements locks remain authoritative; no dependencies were changed.

The source-reference snapshot contains 848 TypeScript/JavaScript import, export, dynamic-import, mock, and literal-path references. It is an inventory, not a complete architecture/cycle analyzer. Before each move also check computed paths, Python paths, CSS references, configuration strings, and documentation:

- `index.html` and `admin.html` reference learner/admin bootstrap; Vite conditionally includes admin only when `VITE_BUILD_ADMIN=true`.
- `src/main.tsx` imports theme, bootstrap shell/drawer/loading, and dynamically imports App. Development `/#content-qa` dynamically imports the local bank and QA panel.
- `src/app/lazyScreens.tsx` dynamically imports quiz, browse, review, results, and flashcard study screens; preserve preloads and screen loading behavior.
- Runtime bank modules dynamically import their local adapters only for `VITE_CONTENT_SOURCE=local`.
- Admin imports local banks and shared candidate validation; `FlashcardAdminPanel.test.tsx` mocks the canonical flashcard module with `tests/fixtures/empty-flashcard-bank.json`.
- Vite/Vitest names `src/test/setup.ts`; tsconfig covers `src` and `scripts`; package scripts name every content/migration entry. The formatter explicitly names `src/app/theme.ts`.
- Backend `settings.py` derives the repository root from the package file's ancestry, then resolves canonical banks and `backend/.env`. Preserve package location and these defaults.
- Python tests resolve `tests/fixtures` from their own ancestry. Frontend contract/storage tests import the same directory; browser tests use independent `e2e/fixtures` banks.
- Playwright starts the fixture API on port 8765 and production preview on 4173; admin uses development port 4174. These command strings and environment overrides are path-sensitive.
- `.gitignore` explicitly exempts the current Markdown-renderer directory; adapt it when that directory moves so source remains tracked.
- README, DESIGN, architecture, content-management, testing, schemas, and prior work trackers contain source paths. Update current guidance with moves; retain historical claims in completed trackers.

## Existing characterization coverage

Reuse six shared fixture files (`bank-contract-cases`, `flashcard-bank-contract`, `api-response-cases`, `storage-boundary-cases`, `question-bank`, and `empty-flashcard-bank`) and the two browser fixture banks. Their hashes are recorded in the snapshot.

Existing passing suites characterize stored-bank/API validation and order, source/verified answers, rich text and sanitization, legacy progress migration, quota/failed writes, pruned-history idempotence, stale repositories, immutable snapshots, flashcard signatures/checkpoints, session lifecycle, loading/cancellation/retry, and admin atomic staging/undo/reset/export/replay. Admin tests embed representative operation records; browser downloads preserve concrete exported change sets and final staged bank evidence. No new implementation-mirroring tests are required for Stage 0.

Observed gaps to cover through later-stage verification: admin mobile layout is not covered by its current desktop browser suite; explicit local mode and the real QA entry are not part of the production API browser suite; bundle/dependency boundaries are inspected but not enforced automatically. Stage 0 captures those entry/layout baselines. Shared fixture/browser checks do not establish assistive-technology behavior or atomic simultaneous cross-tab writes, as already documented in testing guidance.

## Stage 2 move manifest

The snapshot provides each exact source/destination path, its current hash, colocated tests, and incoming source references. Move these groups separately from formatting or behavior changes:

1. `src/app/theme.ts` → `src/shared/theme.ts`; update both bootstrap entries, all theme consumers, and `format:check`.
2. `AppShell.tsx` and `AppHeader.tsx` → `src/shared/ui/shell/`; retain the existing exports and quiz-specific accessible wording. Brand callbacks continue to be wired by learner composition.
3. `ScreenLoading`, `BootFailure`, `ScreenLoadBoundary`, `LoadingSkeleton`, `ContentLoadFailure`, and `ContentRecoveryBanner` → `src/shared/ui/loading/`, with existing tests. Keep safe content-error mapping from `notifications/notificationMessages.ts` in this loading directory; the generic toast provider has no error-domain mapping.
4. `ScreenTransition.tsx` and its test → `src/shared/ui/transitions/`; update the loading boundary's duration-constant import so shared UI never imports learner app.
5. `notifications/ToastProvider.tsx` and its test → `src/shared/ui/notifications/`.
6. `content/MarkdownContent.tsx` and its test → `src/shared/ui/content/`; preserve content-policy imports and local KaTeX stylesheet/font bundling. Update QA and all quiz/flashcard renderers.
7. `StudyHeader.tsx`, `StudyNavigatorTile.tsx`, `quiz/QuestionNavigationLayout.tsx`, and `quiz/useScrollCurrentQuestion.ts` → `src/shared/ui/study/`. The scroll hook is consumed by both quiz and flashcard navigators and must move with them.

Keep `AppNavigationDrawer` and drawer helpers in learner `app/components` for now: only learner navigation consumes them. Keep flashcard card/navigator, quiz choice/feedback/results controls, dashboard widgets, session hooks, and selectors in place until Stage 3 assigns feature ownership. Stage 2 needs no forwarder/barrel modules or signature changes.

## Verification results

- Frontend lint and scoped formatting: passed.
- Frontend tests: 61 files, 363 tests passed in 59.68 seconds.
- Canonical content validation: passed for 11,687 questions/111 quizzes and 674 flashcards/13 decks, with 32 existing answer-review warnings.
- Backend tests: 39 passed; Ruff passed; mypy passed for five source files.
- Default learner build and optional-admin build: passed, including TypeScript checking. Default emits only `index.html`; optional admin emits both HTML entries.
- Learner Chromium suite: 11 passed in 45.6 seconds. Covers API launch, abandonment/recovery, progress/reload/resume/completion, rich math, flashcards, browse/review, desktop/mobile navigation, keyboard Retry, reduced motion, and throttled loading.
- Admin Chromium suite: 2 passed. Covers CRUD, move/reorder/cascade-delete, staging, import preview, undo/reset, coordinated reset, export, grouped bulk-add, and replay.
- Additional isolated browser captures: passed for actual canonical local-mode dashboard/quiz launch (13 subjects, zero API requests, zero page errors), canonical admin quiz/flashcard sections at 1280×900 and 390×844, and `/#content-qa` rich rendering using the existing two-question fixture through page-only module interception.
- Hash comparison after verification: all 301 initially tracked files remain byte-for-byte unchanged, including both banks, fixtures, dependency locks, and application/configuration source. Only organization documentation/evidence files were added or updated.

The browser captures were visually inspected for desktop admin, mobile admin, mobile canonical quiz, and mobile flashcard math. Existing learner suite captures also preserve desktop/mobile browse/review and navigation layouts. Admin small-screen content is stacked into a long page; captures preserve the existing arrangement, not a redesign. QA uses the small existing fixture to verify the actual entry and renderer without mounting all 11,687 canonical question cards.

Local first-quiz timing was 434 ms; throttled timing was 1,681 ms at 150 ms latency and 200 kB/s, measured by the existing production-fixture test. These are individual local characterization samples, not a production performance guarantee.

Default build's key raw/gzip sizes: learner entry 452,962/144,722 bytes; App 124,615/38,680; shared StudyHeader/rich-rendering chunk 620,290/187,805; quiz screen 14,782/5,653; flashcard study 6,766/2,865. Both builds retain separate browse, review, results, quiz, and flashcard-study chunks. The optional admin entry is 14,263,946/4,000,544 bytes because it includes authoring content; its shared StudyHeader chunk is 501,697/151,627 bytes. The complete asset lists are in the snapshot. Default API learner JavaScript has no separate canonical-bank module; ignored `public/content` files are still copied as public assets, as noted above.

Existing warnings: Vite reports chunks over 500 kB; backend TestClient reports Starlette's httpx deprecation; Vitest prints a jsdom environment performance advisory; browser launch tools print a NO_COLOR/FORCE_COLOR advisory. None causes a failing check. The sandbox initially blocked tsx's IPC socket and local server/Chromium startup; those commands succeeded after approved execution outside the sandbox. These were environment restrictions, not application failures.

## Stage closure

The [ownership decision](../../decisions/0001-repository-ownership-and-boundaries.md) is recorded and the machine snapshot contains an exact 24-file Stage 2 move manifest with hashes and incoming references. No unexplained test/build failures remain. Stage 1 is intentionally pending the user's next signal. Future stages must re-check source hashes and refresh path references if unrelated work changes the repository in the meantime.

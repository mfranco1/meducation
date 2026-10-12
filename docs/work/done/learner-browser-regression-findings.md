# Learner browser findings from the admin audit

Date: 2026-10-12. Status: resolved; fixes and full verification completed.

`npm run test:e2e` built the normal production bundle successfully and ran 16 Chromium tests: 13 passed, 3 failed. No learner production source, browser-test fixture, or canonical bank was changed by the admin audit.

- [x] `dashboard stat cards stay readable across desktop and narrow layouts` (`e2e/learner-smoke.spec.ts:3`): the Flashcards locator expects **Completed decks**, **Average count**, and **Highest count**. The current dashboard uses **Completed**, **Average**, and **Highest** with shorter supporting text. Update selectors to current accessible labels while retaining numeric, layout, and styling assertions.
- [x] `flashcards browse, resume an imported fixture deck, and finish without quiz analytics` (`e2e/learner-smoke.spec.ts:168`): its final dashboard assertions use the same obsolete labels. The preceding study flow completed; the failure occurs at the old Completed decks label.
- [x] `API-backed quiz survives reload, completes, and opens Browse Answers` (`e2e/learner-smoke.spec.ts:351`): after resizing to 390×844, the Additional context heading cannot be found through its accessible role. The captured DOM still includes the heading; investigate mobile modal/drawer accessibility state before changing the assertion. Do not hide this failure with a CSS-only locator.

Full frontend unit verification passed (474 tests). The learner lazy-study test's initial ready wait was extended from the one-second Testing Library default after it failed under full-suite load and passed unchanged alone; its assertions remain intact. Admin checks and the enabled authoring build passed independently. These browser failures are not counted as passing verification in the completed admin audit.

## Investigation and fix — 2026-10-12

- [x] Confirm obsolete flashcard labels and units against current dashboard implementation and component tests; update browser assertions while preserving statistics and layout checks.
- [x] Reproduce and fix responsive drawer accessibility failure without weakening role queries.
- [x] Run full verification to identify additional failures across frontend, backend, learner and admin checks.

### Root cause and implementation

The label-only rerun passed the flashcard study flow but still failed the responsive dashboard and quiz flows. Retained Playwright snapshots show `#root` gaining `aria-hidden="true"` after shrinking to mobile. `AppNavigationDrawer` shared one expansion boolean between desktop and mobile and reset it in an effect. A desktop-to-mobile commit therefore mounted an open temporary Drawer before the effect closed it, creating an unintended modal/accessibility lifecycle.

The expansion state now includes its breakpoint and resets during rendering before children commit. Desktop still starts expanded; mobile still starts closed; explicit toggle/destination/Escape/backdrop behavior is preserved. The quiz browser test retains its accessible heading query and now also checks that the app root is not aria-hidden and the mobile modal is closed. Dashboard card queries use current accessible group names and supporting units, retaining numeric/style/geometry assertions.

Verification logs: `/private/tmp/learner-regression-baseline.log` (label-only reproduction), `/private/tmp/learner-regression-full.log` (full checks). The first sandbox browser attempt failed to bind its fixture API; rerunning with local-server permission allowed reproduction. No canonical content or fixture data changed.

### Final verification

`npm run verify:full` passed with local IPC/server permission (`/private/tmp/learner-regression-full-permitted.log`):

- ESLint and checked dependency graph; formatting; 10 architecture tests.
- All 474 frontend unit tests across 84 files.
- Canonical content validation: 11,687 questions across 111 quizzes; 1,712 flashcards across 98 decks and 13 shared subjects.
- Backend Ruff and mypy; all 39 backend tests.
- TypeScript checking and fresh learner production build.
- All 16 learner browser tests with retries disabled, including the three original regressions and mobile drawer/keyboard/navigation coverage.
- Enabled admin production build and all 12 admin browser tests.
- `git diff --check`.

No additional test failures were found. Existing non-failing advisories remain: content answer-review warnings, large Vite chunks, the FastAPI/Starlette test-client deprecation, and Playwright color-environment warnings. No content changes were made to silence these advisories. The initial sandbox IPC/socket restrictions are environment failures, not application regressions.

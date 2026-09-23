# Repository refactor plan

Status: implemented (2026-09-23). The completed refactor preserved quiz behavior, canonical content, persistence formats, wording, layout, styles, and themes.

## Current baseline and constraints

The earlier maintainability refactor in `docs/work/done/maintainability-refactor-plan.md` is complete. The current boundaries in `docs/architecture.md` are sound: pure quiz rules in `src/domain`, the canonical JSON bank and its read adapter in `src/content`, browser storage behind `AttemptRepository`, application coordination in `src/app/session`, and a separate local admin tool. Preserve these boundaries and avoid a new framework, global store, backend, or runtime AI.

The working tree was clean before this plan. On 2026-09-23, `npm run validate:content` passed for 10,396 questions and 100 quizzes with 32 answer-review warnings. `npm run build` passed and reported the existing large content chunk. `npm test` failed at baseline: four failures across three files. `questionBank.test.ts` expects the older 12/98/10,196 counts while the bank currently has 13/100/10,396; two `QuizBrowseScreen.test.tsx` expectations look for a “Correct answer” label absent from the current component; and the full-bank Markdown test exceeded its 30-second timeout. These must be resolved or explicitly characterized before using the suite as a refactor gate. Do not change the product or canonical data simply to satisfy stale assertions.

## Completed refactor work

1. `useAdminEditor` now owns the shared snapshot, editor, import/bulk staging, loading, and before-unload state previously embedded in `AdminApp`; the app remains responsible for UI-specific confirmations and downloads.
2. `src/app/progress.ts` provides pure subject-stat and quiz-progress selectors. `App.tsx` is now a smaller composition layer, and no data module imports a screen type.
3. `QuestionNavigationLayout` and `useScrollCurrentQuestion` remove duplicated responsive navigator framing and scrolling from quiz modes without unifying their distinct tiles or controls.
4. `LocalAttemptRepository` and question-bank validation are expanded into readable units with the same persistence keys, history limit, fallbacks, timestamp rules, validation diagnostics, and ordering.
5. Baseline tests now reflect the canonical bank’s current counts and present answer-browser behavior. The full-bank Markdown test has a 60-second timeout because it validates all 10,396 canonical records.

## Step-by-step execution

### 0. Establish a trustworthy characterization baseline

1. Reconcile the three failing test files with current documented behavior. Make test-only corrections for stale assertions; investigate the Markdown timeout alone before changing its limit. Record the actual pass/fail outcomes. Keep canonical content unchanged.
2. Capture representative learner and admin flows: dashboard summaries, start/resume/leave/abort/finish, both feedback modes, browse-only navigation, admin single edit, bulk validate/stage, import preview/stage, delete cascade, undo/reset, and export. Record desktop and narrow viewport screenshots for the screens touched in step 3.
3. Save a checksum of `src/content/questionBank.generated.json` and fixtures for localStorage data and deterministic admin export. These are parity references for later phases.

### 1. Make the admin workflow composable

4. Define one workflow state model for snapshot revision, selection, editor mode, pending validated bulk change, imported change set, issues, dirty/exported status, and summary. Move gateway calls and transitions from `AdminApp.tsx` into a focused hook/controller. Keep `preview` before every `apply` and retain stale-revision handling.
5. Extract the catalog/selection, JSON editor/actions, and preview/status regions only after the controller interface is stable. Leave user-facing copy, DOM semantics, confirmations, button states, and MUI `sx` values unchanged. Keep the gateway interface as the async boundary.
6. Add focused workflow tests with an in-memory gateway for validate→stage, stale drafts, undo/reset, import, and export state; rely on existing core tests for operation semantics. Compare exported bank and change set to the baseline fixtures.

### 2. Separate learner read models from React composition

7. Introduce pure functions for subject summaries and per-subject quiz progress. Pass `QuizRepository`, `AttemptRepository`, and completed attempts explicitly. Keep analytics formulas in `src/analytics` and canonical ordering in the content adapter. Move `QuizProgress` out of `SubjectScreen.tsx` so data code no longer imports a screen.
8. Have `App.tsx` call those selectors while preserving when fresh repository data is read. Add fixture tests for active counts, recent activity ordering, latest/lowest/trend values, history-pruned scores, and no-attempt states. Confirm the same dashboard and subject snapshots after completion and resumption.

### 3. Extract only stable presentation primitives

9. Share the responsive question-navigation shell and its scroll-to-current behavior across quiz and browse screens. Keep mode-specific question tiles, answer controls, feedback, and footer buttons in their screens. Compare accessibility labels, keyboard/focus behavior, narrow/desktop screenshots, and reduced-motion scrolling.
10. Consider a small question header/progress primitive only if the duplicated JSX remains identical after the navigation extraction. Stop if the prop API becomes broader than the repeated markup.

### 4. Clarify content and persistence internals

11. Isolate common stored question field checks only where they are semantically identical across admin parsing and canonical validation. Preserve draft-only constraints and all existing diagnostics. Add parity fixtures for accepted/rejected drafts and change sets, including nested paths, choice order, source/verified answer distinction, and metadata.
12. Reformat persistence and validation modules separately. Extract limited helpers for score-map initialization and updates; keep the repository interface and write order stable. Verify legacy browser fixtures, 200-entry pruning, count/lowest/latest summaries, active timing, and activity fallback.

### 5. Close each phase with parity checks

13. For every phase run relevant focused tests, then `npm test`, `npm run validate:content`, `npm run build`, and `git diff --check`. A phase is not complete with new failures. Compare the canonical JSON checksum, admin export bytes, localStorage fixtures, and affected screenshots before merging or starting the next phase.
14. Update `docs/architecture.md` and `docs/testing.md` only for boundaries that actually changed. Move this tracker to `docs/work/done` after all phases are implemented and verified.

## Explicit non-goals

No canonical question or answer edits, schema/ID changes, new persistence format, visual redesign, theme cleanup, route changes, feature work, broad state-management library, or generalized component system. Treat any discovered product defect as separate work so this refactor remains behavior-preserving and reviewable.

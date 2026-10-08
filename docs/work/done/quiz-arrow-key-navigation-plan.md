# Shared study arrow-key navigation

Status: complete.

## Goal

Add Left/Right Arrow question navigation to active quizzes (Fast Feedback and Exam Mode), Browse Answers, and results review, matching flashcard study behavior. Reuse composable study UI and keyboard logic across all four screens.

## Findings and design

- `FlashcardStudyScreen.tsx` currently owns the Space/arrow listener, interactive-target exclusions, modal detection, bounds, and Next-to-Finish focus bookkeeping.
- All four screens already compose `QuestionNavigationLayout` and `StudyNavigationFooter`; Browse and Review use `ReadOnlyQuizFooter` as an adapter. Reuse these components without introducing another screen wrapper.
- Active quiz navigation must call `navigateToQuestion`, which clears the answer burst and routes through `onCheckpoint`. `useQuizSession` saves before changing the displayed index and retains the current question when saving fails.
- Browse and Review must retain their existing `onNavigate` callbacks and read-only semantics. Navigator filters affect tiles only; arrows follow canonical question order.
- Shared behavior belongs under `src/shared/ui/study`, because feature-to-feature imports are prohibited.

## Behavior contract

- Left moves to the previous item; Right moves to the next item. Stop at the first/last item, with no wrapping. Right on the last item never submits, finishes, exits, or opens a confirmation. A single-item collection cannot navigate.
- Shortcuts work from the page and ordinary buttons, including Previous, Next/Continue, flags, and navigator tiles. They do not select or commit answers.
- Preserve native behavior for inputs (especially quiz answer radios), textareas, selects, editable regions and their descendants, links, and widgets that own arrow keys, using the existing flashcard exclusions as the baseline.
- Ignore modified, composing, and already-handled events. Repeated eligible arrow events are consumed without advancing. Consume eligible arrow events at boundaries to prevent horizontal page scrolling; leave excluded events untouched.
- Suspend shortcuts when disabled, the current item is absent/out of range, a question/card drawer is open, or any visible modal is open. Modal guarding must cover parent-owned exit dialogs and the application navigation overlay as well as the quiz's submit dialog. Closing the overlay restores shortcuts.
- Preserve flashcard saving guards, Space reveal/advance behavior, concealment on navigation, opened/flagged state, and focus transfer from Next to Finish. Space on ordinary buttons must continue to use native button behavior.
- Quiz arrows must not gain flashcard Space behavior. Preserve explicit Finish/Submit/Done actions, existing exit confirmations, attempt data, timing rules, and read-only navigation.

## Implementation steps

- [x] Add `useStudyArrowNavigation` under `src/shared/ui/study` for bounded movement, disabled states, latest callbacks, and listener cleanup.
- [x] Extract shared guards for modifiers, composition, already-handled events, editable/link/widget exclusions, and visible modals. Reuse the key-specific guard for flashcard Space while preserving its button behavior.
- [x] Refactor flashcard study to use the shared hook and retain existing Space behavior and Next-to-Finish focus transfer.
- [x] Compose the hook into active quiz, Browse, and Review screens using their existing navigation callbacks. Drawer and submit state suspend shortcuts; modal detection covers parent-owned overlays.
- [x] Keep focus on the destination terminal action when advancing from a focused Next/Continue button. Page-originated navigation does not move focus.
- [x] Update product, design, regression, and architecture documentation.

## Tests

### Shared hook and guard tests

Use a small rendered harness with fixture items and callback spies. Test the detailed event policy here once rather than copying the matrix into each screen suite.

- [x] Both directions, first/last boundaries, single/empty collections, and disabled state; eligible boundaries are consumed without terminal actions.
- [x] Modified, composing, already-prevented, and repeated events are ignored; eligible keys are consumed.
- [x] Ordinary buttons allow arrows; editable controls, links, radios, and tab widgets retain native behavior.
- [x] Visible modal and explicit disabled state suspend navigation; rerendering and unmounting update/remove listeners correctly.

### Screen tests

- [x] `QuizScreen.test.tsx`: Left/Right call the checkpoint callback with the expected destination, do not change answers, and do not submit. Existing Continue/submit tests remain in place.
- [x] `QuizBrowseScreen.test.tsx` and `QuizReviewScreen.test.tsx`: cover direction, boundary behavior, no exit/Done action, and review's canonical order under a navigator filter.
- [x] Existing flashcard screen tests continue to cover arrow/Space behavior, saving, drawer, reveal, and Next-to-Finish focus transfer.

### Integration and browser tests

- [x] Existing session tests verify read-only Browse/Review navigation does not write progress. Browser coverage verifies active-quiz keyboard navigation preserves the checkpoint for leave/resume.
- [x] Shared hook tests verify visible modal suspension; existing Review browser tests continue to cover exit confirmation.
- [x] Fixture-based learner browser flow covers arrows in active quiz, Browse, and Review; active quiz uses an ordinary focused button and Review retains canonical sequential order after filtering.
- [x] Component tests verify radio keys are not intercepted; existing flashcard browser keyboard flow remains passing.

## Verification and completion

- [x] Focused shared hook, screen, and flashcard tests pass: 5 test files, 38 tests.
- [x] Full `npm test` passes: 64 files, 391 tests.
- [x] `npm run lint`, `npm run format:check`, `npm run test:architecture` (10 tests), and the standard production build pass. TypeScript checks are included in the build.
- [x] Enabled-admin production build passes with `VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build`.
- [x] Learner browser suite passes: 11 tests. Admin browser suite passes: 2 tests. Suites were run sequentially because they share Playwright artifact paths.
- [x] `git diff --check` passes. Both production builds retain the repository's existing large-chunk advisory; no content changed, so content validation was not needed.
- [x] Move this completed tracker to `docs/work/done`.

No backend, persistence schema, canonical content, stable IDs, answer provenance, dependency, or runtime-AI changes are required.

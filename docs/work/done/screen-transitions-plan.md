# Subtle screen transitions

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

## Status

Complete. Question transitions remain excluded.

## Goal and motion specification

Make navigation between Dashboard, Subject, Quiz, Browse Answers, and Results feel smooth and consistent while keeping study interactions immediate.

- Animate incoming screen content as one unit: opacity 0 to 1 and vertical offset 6px to 0.
- Use a shared duration of 170ms and an ease-out curve, initially `cubic-bezier(0.2, 0, 0, 1)`.
- Replace the outgoing screen immediately. Do not introduce an exit delay, duplicate live screens, or an empty interval between screens.
- Keep the app header and global exit dialog outside the animated region.
- Respect `prefers-reduced-motion: reduce` with instant replacement and no animation.
- Skip the animation on the initial app render. Animate subsequent screen changes only.
- Keep controls usable throughout; do not block navigation until an animation finishes.
- Use the same treatment for forward and return navigation.

## Scope boundaries

- Question changes in both Quiz and Browse Answers remain instant, including Next, Previous, Continue, and question-grid jumps.
- Answer selection, checkpoint updates, timer ticks, flags, feedback, and celebrations do not restart the screen animation.
- Existing dialog, carousel, hover, and celebration motion remains unchanged. Dialog timing alignment can be considered separately after this feature is evaluated.
- Preserve existing scroll behavior for this change; do not add automatic scrolling.
- Preserve quiz state, submission/exit confirmation, stopwatch behavior, persistence, and canonical content.
- No new animation library, router, backend, or runtime AI dependency.

## Implementation steps

### 1. Add a shared presentation primitive

- [ ] Add `src/app/components/ScreenTransition.tsx`, using the existing Emotion keyframes and MUI styling patterns.
- [ ] Keep duration, offset, and easing together as reusable motion constants in the primitive, or in a small motion module if reuse warrants it.
- [ ] Use a CSS reduced-motion media query so preference changes apply without coupling screen motion to celebration logic.
- [ ] End with normal opacity and transform styles; avoid retaining a transformed containing block after the animation.
- [ ] Check fixed-position descendants such as celebration overlays and mobile question navigation. Keep viewport-anchored UI correctly positioned during the transition as well as afterward; adjust the animation boundary where necessary.

### 2. Integrate at the existing screen boundary

- [ ] Wrap the screen content composed in `src/app/App.tsx`; retain `AppHeader` and `ExitQuizDialog` outside that wrapper.
- [ ] Derive a stable screen identity from the navigation view: `dashboard`, `subject:<subjectId>`, `quiz:<quizId>:<attemptId>`, `quiz-browse:<quizId>`, and `results:<attemptId>`.
- [ ] Exclude question index, responses, elapsed time, and other changing attempt data from the identity.
- [ ] Replay the entry animation only when that identity changes; preserve mounted screen state on same-screen updates.
- [ ] Suppress entry motion on the first app render, including React development Strict Mode behavior.
- [ ] Keep session callbacks immediate and retain only the current screen. Rapid navigation should show the latest destination without queued animations or stale screens.
- [ ] Treat the Results warning and results content as one screen region.

### 3. Verify behavior and appearance

- [ ] Add focused boundary/integration coverage for initial render, screen identity changes, same-screen updates, and rapid navigation. Assert screen mount/state preservation rather than testing every animation constant.
- [ ] Cover unchanged question navigation in Quiz and Browse Answers: updating the index must not remount the screen or replay entry motion.
- [ ] Confirm existing quiz/session tests still cover start, resume, checkpoint, leave, abort, and submit correctly.
- [ ] In the browser, inspect Dashboard → Subject → setup dialog → Quiz, confirmed exit to Subject/Dashboard, Browse Answers entry/exit, and Quiz → Results → Subject.
- [ ] Check desktop and mobile layouts, reduced-motion mode, keyboard focus visibility, dialog dismissal, and fixed overlays. Verify animation does not clip content or create scrollbars.
- [ ] Confirm Next/Previous, timer updates, and answer feedback have no new motion. Check that opening or cancelling a dialog does not replay screen entry.
- [ ] Run `npm test` and `npm run build` (includes TypeScript checking), then `git diff --check`. Content validation is required only if scope later includes content changes.

### 4. Document and close

- [ ] Record the motion specification and reduced-motion behavior in `docs/design-system.md`.
- [ ] Briefly document the shared screen boundary in `docs/architecture.md` and relevant regression coverage in `docs/testing.md`.
- [ ] Record verification results here and move this tracker to `docs/work/done` once implementation and checks pass.

## Acceptance criteria

Every top-level screen change uses the same short entry treatment. The header remains stationary, screen content is immediately interactive, and reduced-motion navigation is instant. Question navigation and other in-screen updates never trigger the transition. Attempt state, timers, focus behavior, overlays, and existing confirmations continue to work correctly.

## Implementation and verification record

- Added a shared entry transition and stable `screenIdentity` for Dashboard, Subject, Quiz attempt, Browse Answers quiz, and Results attempt destinations.
- Kept the app header and exit dialog outside the transition. Quiz index, responses, and timer changes do not change screen identity.
- Added regression tests for initial render, destination changes, retained same-screen state, and stable identity across quiz progress updates.
- Updated architecture, design system, and testing documentation.
- `npm test -- src/app/components/ScreenTransition.test.tsx src/app/navigation.test.ts src/app/screens/QuizScreen.test.tsx src/app/screens/QuizBrowseScreen.test.tsx src/app/session/useQuizSession.test.tsx` — passed (5 files, 24 tests).
- `npm run build` — passed, with the existing large-chunk warning.
- `git diff --check` — passed.
- `npm test` — 23 of 24 files passed; the unrelated canonical question-bank count assertion in `src/content/questionBank.test.ts` expects 108 quizzes while the current bank exposes 110. This feature did not change question-bank content.
- Browser smoke check confirmed navigation from Results back to the Subject screen. Reduced-motion and mobile layout were not separately exercised in the browser.

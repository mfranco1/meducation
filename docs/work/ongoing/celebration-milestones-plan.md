# Correct-answer streak and perfect-test celebrations

## Status

Implemented — automated verification complete; manual browser verification pending

## Goal

Add brief, encouraging celebrations when a learner reaches a correct-answer streak of 3, 5, 10, 25, or 50 in Fast Feedback, plus a distinct celebration after completing any test with every question correct. Keep the interaction smooth, accessible, non-blocking, and easy to extend without coupling animation details to quiz rules.

## Product decisions

- Count a streak in the order answers are committed, not by question number. Navigating out of order therefore behaves naturally.
- Only committed Fast Feedback answers affect the live streak. Exam Mode must not reveal correctness before submission, so it has no live streak celebration.
- Increment the streak after a correct committed answer and reset it to zero after an incorrect committed answer. Moving between questions or leaving an answer unanswered does not itself change the streak.
- Trigger streak milestones exactly at 3, 5, 10, 25, and 50 correct answers. An incorrect answer clears the active streak and its earned tiers, so rebuilding a streak can celebrate again.
- Persist streak progress and awarded milestones with the active attempt so leaving and resuming preserves progress without replaying an old celebration.
- Treat older saved attempts with no streak metadata as having zero tracked progress. Do not infer an event order from their response map or replay celebrations retroactively.
- Define a perfect test using exact score counts: `score.total > 0 && score.correct === score.total`. Do not rely on the rounded percentage.
- If the final Fast Feedback answer reaches a streak milestone, show that brief celebration on the quiz screen. Show the separate perfect-test celebration only after the learner presses **Finish** and reaches results.
- Keep celebrations encouraging but restrained: no blocking dialog, no focus capture, no layout shift, and no delay before navigation or finishing.

## Experience specification

### Streak celebration

- Present a small overlay/badge above the quiz content after feedback appears, with concise copy such as **5 in a row!** and a short escalating encouragement.
- Use a quick entrance, a short hold, and a gentle exit (roughly 1.5–2 seconds total).
- Use a clear green checkmark rather than sparkles or confetti.
- Keep `pointer-events: none` on decorative layers so answering, scrolling, and **Continue** remain usable.
- Ensure the overlay does not cover the selected answer or primary navigation on narrow screens.

### Perfect-test celebration

- Reuse the same presentation primitive with a more prominent configuration on the results screen.
- Reinforce the existing score instead of replacing it: retain **Quiz complete**, the exact score, timing, and topic breakdown.
- Use distinct copy such as **Perfect test!** and a slightly richer but still short animation.

### Accessibility and motion

- Announce the milestone through a polite live region, while marking purely decorative particles `aria-hidden`.
- Do not move focus or require dismissal.
- Respect `prefers-reduced-motion`: render a short fade/static highlight and omit particle travel, bounce, scale bursts, and repeated motion.
- Preserve readable text contrast and do not use color or motion as the only signal.

## Step-by-step implementation plan

### 1. Document the behavior and create the tracker

- [x] Add the celebration rules to `docs/product.md`, including Fast Feedback versus Exam Mode behavior, milestone frequency, reset rules, resume behavior, and the exact perfect-test definition.
- [x] Add motion, reduced-motion, overlay, and non-blocking interaction guidance to `docs/design-system.md`.
- [ ] Keep this tracker in `docs/work/ongoing` until implementation and verification are complete.

### 2. Model attempt-scoped streak progress

- [x] Extend `Attempt` in `src/domain/types.ts` with optional backward-compatible celebration progress containing the current correct streak and the streak milestones already awarded.
- [x] Initialize this progress for new attempts in `src/app/session/useQuizSession.ts`.
- [x] Keep the field optional when reading existing localStorage data; centralize defaulting in a pure helper instead of scattering null checks through React components.
- [x] Store only serializable quiz state. Do not persist animation-open state, timers, display copy, or DOM/UI details.

### 3. Add pure domain rules for committed answers

- [x] Add a pure transition in `src/domain/quizEngine.ts` that accepts the attempt, question, and selected choice, then returns the updated attempt plus an optional newly reached streak milestone.
- [x] Reuse the existing verified-answer-aware `isCorrect` and `selectChoice` behavior so answer provenance and scoring remain unchanged.
- [x] In Fast Feedback, count only the first commit of an unlocked response, increment or reset the streak, and record a newly reached milestone once.
- [x] In Exam Mode, preserve editable selection behavior and return no live milestone.
- [x] Make repeated calls for an already locked response idempotent so React rerenders, keyboard events, or resumed state cannot double-count an answer.
- [x] Keep the milestone list in one exported constant or policy function so the rule and tests cannot drift.

### 4. Cover streak policy with domain tests

- [x] Extend `src/domain/quizEngine.test.ts` for correct increments and incorrect resets.
- [x] Prove milestones fire at exactly 3, 5, 10, 25, and 50—not immediately before or after.
- [x] Prove a milestone can fire again after the streak is broken and rebuilt.
- [x] Prove out-of-order question answering follows commit order.
- [x] Prove locked answers cannot increment twice and Exam Mode emits no live celebration.
- [x] Prove a legacy attempt with missing progress starts safely without corrupting responses, timing, flags, or checkpoints.

### 5. Build reusable celebration presentation

- [x] Add a presentation-only component under `src/app/components/celebration/`, for example `CelebrationOverlay.tsx`, with props for title, supporting text, visual intensity/variant, visibility, and completion/dismissal.
- [x] Keep the base component generic: it should render the overlay, live-region text, themed decorations, and reduced-motion fallback without knowing quiz scoring rules.
- [x] Add a small configuration/catalog module that maps streak milestones and the perfect-test event to copy and visual intensity. Keep copy out of the domain layer.
- [x] Use MUI styling/keyframes and the existing theme rather than adding an animation dependency for this small effect.
- [ ] If event timing becomes awkward in consumers, add a focused `CelebrationHost` or queue hook that serializes events and owns auto-dismiss timers; do not embed that lifecycle in the quiz engine.

### 6. Integrate live milestones into the quiz screen

- [x] Update the answer-selection path in `src/app/screens/QuizScreen.tsx` to use the new domain transition and persist its returned attempt through `onCheckpoint`.
- [x] When the transition returns a milestone, enqueue/show its presentation event after the normal correctness feedback is available.
- [x] Keep the event ephemeral so navigating between questions does not replay it; rely on persisted awarded milestones only for deduplication and resume continuity.
- [x] Confirm the overlay does not block radio inputs, flags, question navigation, scrolling, **Continue**, **Previous**, **Finish**, or the leave-test dialog by keeping it pointer-events-free.
- [x] Preserve current question text, choices, answer ordering, answer provenance, rationale content, stopwatch behavior, and checkpoints unchanged.

### 7. Integrate perfect-test feedback into results

- [x] Add a pure `isPerfectScore` helper near scoring rules, based on exact counts and a nonzero total, with focused tests.
- [x] In `src/app/screens/ResultsScreen.tsx`, trigger the perfect configuration once when a newly completed attempt is perfect.
- [x] Compose it with the same celebration presentation used for streaks, while keeping the standard results content visible and immediately interactive.
- [x] Ensure perfect results work for both Fast Feedback and Exam Mode and do not depend on live streak metadata.

### 8. Add component and integration coverage

- [ ] Add component tests for visible copy, polite announcement, decorative `aria-hidden` treatment, auto-dismiss/queue behavior, and the reduced-motion branch. If the repository lacks a DOM test setup, add the smallest test setup needed rather than introducing an end-to-end framework solely for this feature.
- [ ] Add a quiz integration test proving the third consecutive correct Fast Feedback answer produces one milestone and a wrong answer resets the counter.
- [ ] Add a results test proving an exact all-correct score celebrates while rounded-to-100, incomplete, zero-question, and non-perfect scores do not.
- [ ] Use fake timers for deterministic animation lifecycle tests; do not make tests wait in real time.

### 9. Manually verify the complete journeys

- [ ] Fast Feedback: verify 3, 5, 10, 25, and 50 fire once at the correct committed answer.
- [ ] Verify an incorrect answer resets the active streak and a rebuilt streak can celebrate again.
- [ ] Verify leaving and resuming retains the current streak and does not replay the last animation.
- [ ] Verify out-of-order navigation, flags, long feedback, the mobile question drawer, and rapid **Continue** interactions remain smooth.
- [ ] Exam Mode: verify no correctness or streak signal appears before submission.
- [ ] Results: verify perfect tests celebrate in both modes and every non-perfect case keeps the normal results experience.
- [ ] Verify keyboard-only and screen-reader behavior, and test both normal motion and operating-system reduced-motion settings.
- [ ] Check narrow mobile and desktop layouts for overlap, clipping, unexpected scrollbars, and layout shift.

### 10. Run repository verification and close the work

- [x] Run `npm test`.
- [x] Run `npm run validate:content` and confirm no question-bank content changed.
- [x] Run `npm run build`.
- [ ] Record results below, change the status to complete, and move this tracker to `docs/work/done` only when all acceptance criteria pass.

## Acceptance criteria

- Fast Feedback celebrates correct streaks at 3, 5, 10, 25, and 50 committed answers exactly once per milestone per attempt.
- An incorrect committed Fast Feedback answer resets the current streak; navigation and unanswered questions do not.
- Exam Mode reveals no live correctness or streak information.
- A perfect completed test produces a distinct results celebration in either mode, using exact counts rather than rounded percentage.
- Leaving and resuming preserves streak progress without replaying a prior celebration.
- Celebration UI is brief, non-blocking, responsive, keyboard-safe, screen-reader understandable, and compliant with reduced-motion preferences.
- The animation primitives are reusable and scoring/streak rules remain pure and independent from React presentation.
- No question, choice, answer key, rationale, identifier, or content-pipeline data changes.
- Existing persistence, navigation, feedback, flags, timing, scoring, and result analytics continue to work.
- Tests, content validation, and the production build pass.

## Out of scope

- Cross-test/global streaks, daily streaks, badges, leaderboards, sound, vibration, push notifications, or cloud synchronization.
- Retrofactively reconstructing answer order or celebration progress for legacy active attempts.
- Changing answer keys, scoring policy, question content, feedback content, or results analytics.
- Adding a general-purpose animation library solely for this effect.

## Verification results

- `npm test` — passed: 8 test files, 34 tests.
- `npm run validate:content` — passed: 10,196 questions across 98 quizzes; existing source-answer review warnings remain.
- `npm run build` — passed; Vite emitted its existing large-chunk advisory.
- Visual browser verification remains pending because the sandboxed preview server could not bind to its local port.

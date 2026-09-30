# Stop the Fast Feedback clock when all questions are answered

## Status

Complete

## Goal

Freeze a Fast Feedback attempt's elapsed time as soon as its final unanswered question receives a locked answer. The learner can then review questions and feedback, navigate, and confirm submission without increasing the recorded completion time.

## Implementation

- Added `isFullyAnsweredFastFeedback` in `src/domain/quizEngine.ts`. It checks the nonempty canonical question list and requires every question to have a selected, locked response; Exam Mode never qualifies.
- `useQuizSession.checkpoint` pauses and saves the attempt with the final Fast Feedback answer. The visible stopwatch and persisted attempt therefore use the same frozen elapsed time.
- `resumeQuiz` preserves the paused state for a fully answered Fast Feedback attempt. Incomplete Fast Feedback and Exam Mode attempts continue to resume their timers.
- The existing explicit Finish/Submit flow remains responsible for completion. It scores from the paused elapsed time.
- Updated `docs/product.md` and `docs/architecture.md` to describe the freeze and review behavior.
- Added domain and session tests for completion rules, out-of-order answers, timer freeze, review navigation, leave/resume, submission scoring, incomplete Fast Feedback, Exam Mode, and an already fully answered saved attempt. Added a screen test confirming the stopwatch remains frozen while the learner navigates.

## Acceptance criteria

- [x] The clock stops when the final Fast Feedback answer is locked, regardless of question order or current location.
- [x] The elapsed time shown on the quiz and saved in the completed score stays fixed while the learner reviews, waits, or leaves and resumes.
- [x] The attempt remains active until explicit submission; finishing still creates exactly one completed attempt.
- [x] Incomplete Fast Feedback and Exam Mode retain their existing timing behavior.
- [x] Question content, answer provenance, IDs, and persistence format remain unchanged.

## Verification

- Focused tests: `npm test -- src/domain/quizEngine.test.ts src/app/session/useQuizSession.test.tsx src/app/screens/QuizScreen.test.tsx` — passed, 30 tests.
- Full `npm test` — 121 passed, 1 failed. The existing `src/content/questionBank.test.ts` assertion expects 108 quizzes; the canonical bank currently exposes 109. The failure is unrelated to this timer change. Canonical Markdown validation passed (about 29 seconds).
- `npm run build` — passed. Vite reported the existing large validation bundle warning.
- `git diff --check` — passed.

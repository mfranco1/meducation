# Confirm quiz submission

## Status

Complete

## Goal

Require an explicit confirmation before completing a quiz so a learner cannot accidentally submit while they still intend to answer unanswered questions or review answered and flagged questions.

## Current behavior

- On the final question, `QuizScreen` shows **Finish** in Fast Feedback mode and **Submit** in Exam Mode.
- Clicking either action opens the confirmation dialog without calling `onFinish`.
- Only the dialog's **Submit** action calls the existing `session.finishQuiz` pipeline, which pauses the timer, scores and saves the completed attempt, clears the active attempt, and navigates to results.
- The existing exit and setup flows establish Material UI `Dialog` patterns with labelled titles, dismissible backdrops, Escape-key handling, and explicit close controls.

## Product decisions

- Show the confirmation in both Fast Feedback and Exam Mode. Both actions complete the attempt even though their current button labels differ.
- Keep the existing last-question button labels. Clicking either opens the same **Submit Test?** dialog instead of completing the attempt.
- Use **Cancel** as the safe dismissal action and **Submit** as the explicit confirmation action. The close icon, backdrop click, and Escape key must behave like **Cancel**.
- Do not prevent submission when questions are unanswered or flagged. The dialog warns and offers a clear route back, while preserving the learner's ability to intentionally submit an incomplete quiz.
- Confirmation is presentation state only. Opening or dismissing the dialog must not checkpoint, score, pause the timer, clear the active attempt, or change the current question.
- Reuse the existing `finishQuiz` session behavior after confirmation; do not duplicate scoring or persistence logic in the screen or dialog.
- Do not change question-bank content, answer provenance, domain scoring rules, persistence schemas, or runtime architecture.

## Implementation plan

### 1. Document the product behavior

- [x] Update `docs/product.md` to state that completing either learning mode requires confirmation.
- [x] Keep terminology aligned with the existing UI: **Finish** for Fast Feedback, **Submit** for Exam Mode, and **Submit Test?** in the shared confirmation.

### 2. Add a focused submission dialog

- [x] Add `src/app/components/quiz/SubmitQuizDialog.tsx` using Material UI `Dialog`, `DialogTitle`, `DialogContent`, and `DialogActions`.
- [x] Give the dialog an accessible labelled title and a close icon whose accessible name communicates the outcome, such as **Cancel**.
- [x] Accept `open`, `onClose`, and `onConfirm` callbacks. Keep attempt traversal and session mutation outside this presentation component.
- [x] State that submitting ends the attempt and shows results.
- [x] Make **Cancel** the safe secondary action and **Submit** the explicit contained action. Preserve visible focus states and sensible narrow-screen wrapping through existing MUI patterns.

### 3. Intercept completion in `QuizScreen`

- [x] Add local submission-dialog state to `QuizScreen`.
- [x] Change the final-question **Finish** / **Submit** button to open the dialog rather than invoke `onFinish` directly.
- [x] Dismiss the dialog without side effects from **Cancel**, the close icon, backdrop click, or Escape.
- [x] Invoke the existing `onFinish` callback only from the dialog's **Submit** action. Guard the interaction so one confirmation produces one completion.
- [x] Leave previous/next navigation, the question navigator, answer locking, flags, celebrations, exit confirmation, checkpoints, and stopwatch behavior unchanged.

### 4. Add interaction coverage

- [x] Extend `src/app/screens/QuizScreen.test.tsx` with a reusable render helper that can inject an `onFinish` spy.
- [x] Verify that clicking **Finish** in Fast Feedback opens the confirmation and does not call `onFinish`.
- [x] Verify that clicking **Submit** in Exam Mode has the same confirmation behavior.
- [x] Verify **Cancel**, the close icon, and Escape close the dialog without calling `onFinish` or changing the current question. Backdrop dismissal uses the shared Material UI `Dialog` `onClose` path.
- [x] Verify **Submit** calls `onFinish` exactly once.

### 5. Verify the complete flow

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
- [x] Browser-check Fast Feedback at the final question: the dialog opens, Cancel returns to the unchanged question, and the stopwatch continues. Component tests cover Exam Mode, explicit confirmation, Cancel, close icon, and Escape dismissal; the existing session logic remains responsible for completion persistence and results navigation.
- [x] Record verification results, change the status to complete, and move this tracker to `docs/work/done`.

## Verification

- `npm test` — passed (70 tests)
- `npm run build` — passed
- `git diff --check` — passed
- Browser verification — Fast Feedback **Finish** opened **Submit Test?**; **Cancel** returned to the unchanged final question and the stopwatch continued.
- Completion behavior — the dialog delegates its sole confirmation callback to the unchanged `onFinish` session pipeline; tests prove that callback is invoked exactly once only after confirmation.

## Acceptance criteria

- Completing a quiz always requires a second, explicit **Submit** action in a modal.
- The first click on **Finish** or **Submit** never completes, scores, or clears the active attempt.
- A learner can return to the quiz through **Cancel**, the close icon, backdrop click, or Escape without losing state or changing questions.
- A learner may intentionally submit with unanswered or flagged questions.
- Confirming submission preserves the existing scoring, persistence, timer, and results behavior.
- The dialog is keyboard accessible, responsive, and consistent with existing Material UI dialogs.
- No canonical question content or answer data changes.

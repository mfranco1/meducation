# Quiz answer browse mode

## Status

Complete

## Goal

Add a third Learning Mode option that opens a quiz as read-only study material. Every question must show its correct answer and explanation immediately, and browsing must not create activity, an active attempt, a completion, a score, or any other analytics/statistics data.

## Product decisions

- Label the setup option **Browse Answers** and describe it as a read-only way to move through every question with the answer and explanation already visible.
- Keep **Fast Feedback** as the default whenever the setup dialog opens. Selecting and then dismissing or reopening the dialog must not retain **Browse Answers**.
- Treat browsing as a transient view, not as a third `FeedbackMode`. `FeedbackMode` remains limited to persisted, scoreable attempts (`immediate` and `exam`).
- Use the runtime answer policy already defined by `answerFor(question)`: prefer `verifiedAnswer`, otherwise use the provided source answer. Preserve the existing **Answer key under review** warning when applicable.
- Make answer choices read-only. Visually highlight the correct choice and include explicit text such as **Correct answer** so correctness is not communicated by color alone.
- Show the existing explanation content, sources, choice explanations, pearls, and review notes without requiring a choice or any other interaction first.
- Keep Previous, Next, and direct question-number navigation. Do not show unanswered/flagged filters because those concepts do not apply to read-only browsing.
- Replace the final submission action with **Done**, which returns directly to the subject screen. The back button and app-header navigation also leave directly because there is no progress to save or discard.
- Do not show the stopwatch, answer inputs, flags, answer-locking behavior, streaks, celebrations, submission confirmation, score calculation, or results screen.
- Preserve the current subject-screen rule that an existing active attempt gets the primary **Resume quiz** action. This feature only adds an option to the existing setup dialog shown by **Start quiz** and **Retake quiz**; it does not change active-attempt precedence.

## Architecture and data-flow guardrail

Model browsing as its own navigation state, for example:

```ts
{ page: 'quiz-browse'; quiz: Quiz; index: number }
```

Opening or navigating this view may update React state only. It must never construct an `Attempt` or call any `AttemptRepository` method. In particular, the browse flow must not call:

- `saveActive`, which would create a resumable quiz and update `meducation.quiz-activity.v1`;
- `saveCompleted`, which would update attempt history, completion counts, low/latest scores, activity ordering, and dashboard analytics;
- `clearActive`, so a future entry point cannot disturb a real in-progress attempt.

Keep the launch callbacks separate rather than widening `startQuiz` to accept a browse value. `startQuiz(quiz, FeedbackMode)` should remain the only setup path that creates an attempt; add a distinct `browseQuiz(quiz)` callback for the read-only view. This separation makes accidental persistence a type-level and control-flow error instead of relying on conditionals inside the attempt pipeline.

## Implementation plan

### 1. Document the behavior and terminology

- [x] Update `docs/product.md` with **Browse Answers**, its always-visible answer/explanation behavior, read-only controls, direct exit behavior, and explicit exclusion from activity, attempts, completions, scores, trends, and statistics.
- [x] Update `docs/architecture.md` to identify the browse view as transient UI state outside the attempt repository and quiz-attempt lifecycle.
- [x] Keep question content and answer provenance unchanged; this feature only reads the canonical bank through `QuizRepository`.

### 2. Add the setup-modal option without changing attempt types

- [x] In `QuizSetupDialog.tsx`, introduce a setup-only selection type such as `FeedbackMode | 'browse'`; do not add `browse` to the domain `FeedbackMode` union or persisted `Attempt.feedbackMode`.
- [x] Add **Browse Answers** to the Learning Mode control, with copy explaining that answers and explanations are already shown and no results are recorded.
- [x] Keep the existing reset-to-`immediate` effect when the dialog opens or changes quiz.
- [x] Give the dialog separate callbacks for starting a persisted attempt and opening browse mode, and dispatch the selected option from the existing primary action. Consider changing its label to **Open quiz** only while **Browse Answers** is selected; retain **Begin quiz** for the two attempt modes.
- [x] Thread a distinct `onBrowseQuiz` callback through `SubjectScreen` and `App`; leave `onStartQuiz` typed to `FeedbackMode`.

### 3. Add a persistence-free browse session

- [x] Extend the `View` union in `navigation.ts` with a `quiz-browse` state containing only the `Quiz` and current question index.
- [x] Add `browseQuiz`, `navigateBrowse`, and `leaveBrowse` transitions to `useQuizSession`. These functions should use only `setView`; they must not generate IDs/timestamps, create responses, pause/resume timers, normalize answers, or touch `AttemptRepository`.
- [x] Return browse mode to its quiz's subject with the existing `subjectForQuiz` lookup.
- [x] Update `App.tsx` to render the browse screen for this view. App-header navigation from browse mode should leave directly rather than opening `ExitQuizDialog`; keep the exit dialog exclusive to active attempts.

### 4. Build a dedicated read-only browse screen

- [x] Add `QuizBrowseScreen.tsx` rather than branching throughout `QuizScreen`. Reuse `MarkdownContent`, `ExplanationContent`/`FeedbackPanel`, layout tokens, and responsive card patterns, but keep mutation controls and attempt-only effects out of the component by construction.
- [x] Render the question stem and all choices. Resolve the displayed correct answer with `answerFor(question)`, mark that choice visually, and add a visible/accessible **Correct answer** label. Render no radios or other selectable controls.
- [x] Show `FeedbackPanel` immediately using the resolved answer, preserving the under-review presentation and all static explanation content.
- [x] Provide Previous/Next controls and a final **Done** action. Direct question navigation should update only the transient browse index.
- [x] Adapt the neutral question-number grid for browse mode. Hide answer-state filters, flag/error icons, and answered/unanswered styling; retain current-question focus, `aria-current`, responsive drawer behavior, and direct navigation.
- [x] Handle a missing resolved answer defensively by showing an **Answer unavailable** state rather than falsely marking a choice. This does not alter canonical content at runtime.

### 5. Prove there are no persistence or analytics side effects

- [x] Add session tests using a spy/fake `AttemptRepository`: opening browse mode, moving between questions, and leaving must produce zero calls to `saveActive`, `saveCompleted`, or `clearActive`.
- [x] Assert that browse entry does not alter a saved active attempt, completed-attempt list, completion count, latest/lowest score, or latest activity timestamp.
- [x] The browse state is not passed into activity ordering or dashboard aggregation; repository storage keys and schemas are unchanged.

### 6. Add focused interaction and accessibility coverage

- [x] Extend `SubjectScreen.test.tsx` to verify the new option, explanatory copy, selection behavior, separate browse callback, unchanged attempt callback types, default Fast Feedback selection, and reset-on-reopen behavior.
- [x] Add `QuizBrowseScreen.test.tsx` to verify that the correct choice and explanation are visible immediately, controls are non-interactive, review warnings remain visible, Previous/Next/direct navigation work, and **Done** exits without a submit dialog.
- [x] Verify that browse mode contains no timer/flag/input/submission controls.
- [x] Cover accessible current-question labeling and correct-answer text in component tests; manually confirm setup and question navigation in the browser.

### 7. Verify and finish the tracker

- [x] Run `npm test` (103 tests passed; two unrelated existing failures: stale canonical-bank counts and the full-bank Markdown test timed out at 30 seconds).
- [x] Run `npm run build` (passed).
- [x] Run `npm run validate:content` (passed: 10,396 questions across 100 quizzes; existing answer-review warnings remain).
- [x] Run `git diff --check` (passed).
- [x] Browser-check the setup option and browse navigation in the local app. The browser’s page-evaluation surface could not expose `localStorage`; repository-spy tests verify browse actions perform no writes instead.
- [x] Record verification results and mark this tracker complete.

## Verification

- Focused browse, setup, and session tests: 21 passed.
- Full `npm test`: 103 passed, 2 failed. `questionBank.test.ts` expects 12 subjects, 98 quizzes, and 10,196 questions, while the current canonical bank has 13 subjects, 100 quizzes, and 10,396 questions. `markdownValidation.test.ts` timed out while parsing the full current bank at 30 seconds.
- `npm run build` — passed; Vite reports the pre-existing large content/validation bundle warning.
- `npm run validate:content` — passed; 10,396 questions across 100 quizzes.
- Browser check — selected **Browse Answers**, saw the correct choice and rationale immediately, and navigated to the next question. Automated session tests verified repository methods and attempt summaries remain untouched.
- `git diff --check` — passed.

## Acceptance criteria

- The setup dialog offers **Fast Feedback**, **Exam Mode**, and **Browse Answers**, with Fast Feedback still selected by default.
- Entering **Browse Answers** opens the quiz without creating or updating any active or completed attempt.
- Every question shows the resolved correct answer and its explanation immediately, without requiring or accepting an answer selection.
- The learner can move backward, forward, or directly to any question and can leave with one action.
- Browse mode never changes quiz/subject activity ordering, active-test indicators, completion counts, latest/lowest scores, score trends, dashboard statistics, or attempt history.
- Browse mode has no timer, flags, streaks, celebrations, scoring, submission confirmation, results screen, or resume behavior.
- Existing Fast Feedback, Exam Mode, resume, submit, results, persistence, and analytics behavior remains unchanged.
- No canonical question text, choice order, answer provenance, IDs, or content schema is modified.

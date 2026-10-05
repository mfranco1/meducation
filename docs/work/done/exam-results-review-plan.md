# Exam results review

## Status

Complete

## Goal

After submitting an Exam Mode quiz, learners can open a read-only review of their submitted answers and every item's explanation. Leaving the review requires confirmation and ends access to that attempt's review.

## Existing implementation

- `ResultsScreen.tsx` has only a Back to quizzes button.
- `QuizScreen.tsx` reveals feedback only for locked Fast Feedback responses. Exam responses remain editable until submission and do not reveal feedback.
- `useQuizSession.ts` saves a completed attempt before navigating to results. Completed attempts retain responses and the final score; the active attempt is removed by the repository.
- Navigation is React state in `navigation.ts`, rather than URL routes or browser-history entries. Results and Browse Answers are already transient views.
- The shared question navigation layout, Markdown renderer, feedback components, and theme tokens can support the review presentation. Browse Answers does not display the learner's submitted responses.

## Product decisions

- Show **Review results** beside **Back to quizzes** for newly submitted Exam Mode results. On narrow screens, allow the actions to stack.
- Start review at the first question. Keep the quiz's canonical question and choice order and allow Previous, Next, and direct question navigation across all items.
- Display the submitted selection, correct answer, and a written Correct, Incorrect, or Unanswered status. Use the same verified-answer precedence as scoring. Preserve answer-key-under-review warnings and avoid presenting uncertain keys as verified.
- Show each item's existing rationale, sources, optional choice explanations, and pearls, including for unanswered items. If explanation content is absent, show a clear unavailable message rather than inventing content.
- Answers and flags are read-only. Show the final elapsed time as static text; reviewing adds no time and changes no score, completion count, activity, or attempt data.
- The review back arrow and final **Done** action request exit to the subject's quiz list. The header logo requests exit to Dashboard. There is no return-to-results control inside review.
- Confirmation copy: **Leave review?** / **Once you leave, you won't be able to return to this attempt's review. Your score will remain saved.** Actions: **Keep reviewing** and **Leave review**. Escape, backdrop dismissal, and closing the modal keep the learner on the current question.
- Review access exists only in the current results/review flow. Leaving results without reviewing also ends that flow. Confirmed review exit discards its transient context; history and quiz cards do not offer an entry back into the completed attempt's review. A new submission creates its own review opportunity. Existing Browse Answers remains a separate content-browsing feature.
- Refreshing or closing the page ends this transient review too. While reviewing, attach `beforeunload` for the browser's standard leave warning where supported; browsers control its wording and may suppress it. Use the custom modal for all in-app exits. Do not add browser-history entries solely for this feature.

## Implementation steps

1. [x] Extend `View` in `src/app/navigation.ts` with a `quiz-review` variant carrying the quiz, completed attempt, and question index. Add an attempt-specific screen identity that remains stable while changing questions.
2. [x] Add session operations in `src/app/session/useQuizSession.ts` to enter review only from Exam Mode results, navigate within valid question bounds, and leave review for the requested subject/dashboard destination. Use the completed attempt already held in memory. Do not convert it into an active attempt or call repository write operations during review. Transition away from review releases the transient review context, so entry cannot be reconstructed from completed history.
3. [x] Add an optional review callback to `ResultsScreen.tsx` and render the Review results action when eligible. Wire it in `App.tsx`. Retain existing score presentation and perfect-score behavior.
4. [x] Add `QuizReviewScreen.tsx` using `QuestionNavigationLayout`, the existing content renderer, and feedback components to reproduce the quiz layout with read-only controls. Keep the submitted selection visible even when the correct answer is another choice. Provide textual selection/correct-answer labels as well as semantic colors. Render Unanswered explicitly rather than passing an absent selection into the existing Not quite status unchanged. Reuse small presentation pieces where useful without sharing active answer-commit or timer behavior.
5. [x] Extend `QuestionNavigator` presentation with an explicit revealed-review option, using submitted selections to show correct/incorrect/unanswered states independently of Exam Mode's unlocked responses. Preserve existing active-exam concealment and existing All/Open/Flagged filters. Do not change the stored feedback mode to make review work.
6. [x] Add a dedicated accessible MUI review-exit dialog. In `App.tsx`, route the review back arrow, Done, and header logo through a single exit request with a pending destination. Navigate only after confirmation; cancelling preserves index and review state. Keep the dialog outside the animated screen boundary, following the current global dialog pattern.
7. [x] Add lazy loading for the review screen in `lazyScreens.tsx`. Preload it when Exam Mode results become available, and retain the existing screen-load recovery boundary. Register and clean up `beforeunload` only while reviewing.
8. [x] Update `docs/product.md`, `docs/architecture.md`, and `docs/testing.md` with the review lifecycle, exit behavior, and verification coverage. Update design guidance only if introducing a new shared presentation convention.
9. [x] Run the checks below, record outcomes, and move this tracker to `docs/work/done` only after implementation and verification are complete.

## Verification and acceptance criteria

- Results tests: Review results appears beside Back to quizzes for eligible Exam Mode results; Fast Feedback results keep their existing behavior; score summaries and celebrations remain correct.
- Session tests: successful submission permits review; failed completion persistence does not; review uses the same completed attempt; index bounds work; entry is rejected outside eligible results; confirmed exit prevents re-entry; a later submission has independent eligibility.
- Review screen tests: correct, incorrect, unanswered, verified answers, keys under review, and missing-content cases; every item is reachable; selections and flags cannot change; explanations are visible without answer interaction; elapsed time stays fixed.
- Navigator tests: reveal correctness in review, including unlocked submitted exam responses, while retaining concealment before submission.
- App integration tests: each in-app exit opens confirmation; cancel/Escape/backdrop preserve the question; confirmed back/Done opens quizzes; confirmed header exit opens Dashboard; completed data and progress statistics are unchanged by review. Verify `beforeunload` listener registration and cleanup.
- Navigation identity tests: results and review have distinct identities; moving between review questions does not remount the screen.
- Extend the fixture-based Chromium smoke flow to submit Exam Mode, enter review, inspect a submitted answer and explanation, cancel exit, confirm exit, and confirm no attempt-review entry is available afterward. Inspect mobile/desktop layout, focus restoration, keyboard navigation, long rich explanations, and browser-native leave-warning behavior.
- `npm test` (243 tests), `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e` (5 browser tests), and `git diff --check` passed. The browser smoke flow covers Exam Mode submission, review content, cancellation, confirmed exit, and no re-entry. Canonical content is unchanged.

## Scope

No canonical content edits, new backend infrastructure, persistence-schema migration, or runtime AI are required. The saved score and completed history remain available after the one-time review ends.

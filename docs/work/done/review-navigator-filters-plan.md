# Results review navigator filters

## Status

Complete

## Goal

In the quiz results review screen, offer navigator filters for **All**, **Wrong**, and **Flagged** items.

## Current implementation

- `QuizReviewScreen.tsx` shares `QuestionNavigator` with the active quiz screen and passes `revealAnswers`.
- The shared navigator currently offers All, Open (unanswered), and Flagged in both screens.
- Its rendered item calculation already identifies incorrect submitted exam responses, but the exported `questionNavigationItems` helper uses a separate calculation. The filtering helper does not yet support Wrong.

## Behavior

- Results review displays exactly **All**, **Wrong**, and **Flagged**, with All selected initially.
- All includes every quiz item. Wrong includes answered items whose submitted selection is incorrect, using the same verified-answer precedence as the existing review. Unanswered items and items with answer-key-under-review warnings are excluded from Wrong, consistent with the review's distinct statuses.
- Flagged includes every item flagged in the submitted attempt, regardless of whether it was answered correctly, incorrectly, or left unanswered.
- Filtering preserves original question numbering and canonical order. Accessible labels include each filter's item count.
- A filter changes the navigator tiles only. The current question remains open even when absent from the filtered list; Previous and Next continue through canonical quiz order. Clicking a visible tile opens that item and retains the selected filter.
- An empty Wrong list displays **No wrong answers.** An empty Flagged list displays **No flagged questions.**
- Filter state stays local to the review screen. Answers, flags, score, timer, and saved progress remain read-only; the existing exit confirmation continues to apply.
- Active quizzes retain All, Open, and Flagged, and Exam Mode continues to hide correctness before submission.

## Implementation steps

1. [x] Extend `QuestionNavigatorFilter` with `wrong`, and add Wrong handling to `filterQuestionNavigationItems`.
2. [x] Consolidate item derivation in `questionNavigationItems`, accepting an explicit reveal option. Preserve locked-answer rules for active Fast Feedback and hide correctness during an active exam; reveal submitted exam responses during results review without changing the stored feedback mode.
3. [x] Make the shared navigator's available filters explicit for each screen, defaulting to the existing active-quiz set. Have `QuizReviewScreen.tsx` supply All/Wrong/Flagged. Add Wrong counts, accessible labels, and its empty-state copy.
4. [x] Preserve tile navigation, current-question behavior, mobile drawer behavior, and filter state while moving between items. Ensure desktop and mobile use the same filter configuration.
5. [x] Update `docs/product.md` and `docs/testing.md` to document review filter semantics and regression coverage.
6. [x] Complete the browser verification below, record results, and move this tracker to `docs/work/done` after all checks pass.

## Verification

- Pure navigator tests: mixed correct/incorrect/unanswered/flagged responses, verified-answer precedence, answer keys under review, original indexes/order, and active-exam concealment. Exercise the shared item derivation used by the rendered navigator.
- Review component tests: exact filter set, initial All selection, Wrong and Flagged tile membership, counts, empty states, filter persistence after navigation, and unchanged current question when filtered out.
- Active quiz regression: All/Open/Flagged remain available; Wrong is absent and active Exam Mode reveals no correctness.
- Extend the existing Chromium review smoke flow with incorrect and flagged items, filter switching, tile navigation, and retained exit confirmation. Check desktop and narrow-screen drawer behavior with keyboard-accessible controls.
- `npm test` (246 tests), `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e` (5 browser tests), and `git diff --check` passed. The fixture API uses port 8765 by default (`MEDUCATION_E2E_API_PORT` can override it), separate from the development API on port 8000. Canonical content is unchanged.

## Scope

This change affects results review navigator filtering and its shared presentation helper. It requires no persistence migration, canonical question-bank changes, or backend changes.

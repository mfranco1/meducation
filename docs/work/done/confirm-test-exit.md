# Confirm leaving or aborting a test

## Status

Complete

## Goal

Give learners one clear exit control above the question. Its dialog lets them save and leave the test, discard the attempt, or continue testing.

## Current behavior

- The quiz toolbar shows the question count and stopwatch, with no exit control above them.
- Separate **Leave test** and **Abort test** buttons sit below the question card.
- The existing dialog opens only from **Abort test**. Its backdrop already closes the dialog, but it has no close icon and offers **Keep testing** and **Abort test** only.
- The header logo can leave an active quiz without showing the dialog.
- Leaving already saves the current question and pauses the stopwatch; aborting clears the active attempt.

## Implementation steps

1. [x] Rename the dialog state from `abortOpen` to a neutral exit-dialog name. Keep the exit decision in `src/app/App.tsx` and reuse the existing MUI `Dialog`.
2. [x] Add an accessible back-arrow button above the question count, aligned with the quiz content. Give it a clear accessible name such as **Leave test**. Clicking it opens the exit dialog without changing the attempt or navigating.
3. [x] Change the dialog title and copy to explain both outcomes: **Leave test** saves progress and pauses the stopwatch; **Abort test** discards this attempt. Add an upper-right close icon with an accessible name such as **Continue test**.
4. [x] Make **Leave test** the visually primary action (`contained`, primary color). Make **Abort test** a distinct destructive secondary action (`color="error"`, non-primary emphasis). Place both actions in the dialog footer. The close icon, backdrop click, and Escape key all dismiss the dialog and keep the learner on the same question; verify MUI `onClose` handles both backdrop and Escape.
5. [x] Reuse the existing leave and abort handlers. On leave, save the current question checkpoint, pause and persist the timer, close the dialog, and return to that subject's quiz list. On abort, clear only the active attempt for this quiz, close the dialog, and return to the subject list.
6. [x] Route the header logo through the same dialog whenever a quiz is active, so it cannot bypass the exit decision. Decide its destination after confirmation: **Leave test** returns to the subject's quiz list, consistent with the quiz back arrow.
7. [x] Remove the bottom **Leave test** and **Abort test** buttons. Keep **Previous**, **Next/Continue**, and **Finish/Submit test** in the bottom navigation and confirm their layout still works at narrow widths.
8. [x] Update `docs/product.md` for the new exit flow. Run `npm test` and `npm run build`, then check the dialog and all three decisions in the browser. Move this tracker to `docs/work/done` only after implementation and verification.

## Acceptance criteria

- The back arrow sits above the question and opens the exit dialog.
- Clicking **Leave test** saves progress and pauses time; reopening the quiz resumes at the saved question and duration.
- Clicking **Abort test** discards the active attempt.
- Clicking the close icon or backdrop, or pressing Escape, closes the dialog without leaving or changing the attempt.
- The header logo cannot bypass confirmation during a quiz.
- The bottom of the quiz shows navigation controls without separate leave or abort buttons.

## Verification

- `npm test` — passed (20 tests)
- `npm run build` — passed
- `git diff --check` — passed
- Browser verification — confirmed the top back arrow opens the dialog, Leave is primary, the close button and Escape cancel, and the header logo uses the same confirmation dialog.

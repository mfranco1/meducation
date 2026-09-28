# Header logo navigation to Dashboard from quiz views

## Status

Complete

## Goal

Clicking the Meducation header logo from an active quiz or Browse Answers lands on the Dashboard. An active quiz still requires the existing exit decision before navigation.

## Implemented behavior

- `App.tsx` records whether the exit dialog was opened by the quiz back arrow or the header logo.
- The quiz back arrow keeps its subject-screen destination. The header logo opens the same confirmation dialog but sends a confirmed Leave or Abort to Dashboard.
- `useQuizSession` preserves the existing leave checkpoint and paused timer behavior, or clears only the active attempt on abort, before navigating to the requested destination.
- The Browse Answers header-logo path opens Dashboard directly. Its back arrow and Done action still return to the subject screen.

## Verification

- `npm test -- src/app/session/useQuizSession.test.tsx` — passed (4 tests).
- `npm test` — passed (22 test files, 110 tests).
- `npm run build` — passed. Vite reported the existing large output-chunk warning.
- `git diff --check` — passed.

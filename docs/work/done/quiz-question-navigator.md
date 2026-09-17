# Quiz question navigator

## Completed scope

Added a responsive, accessible question-number navigator to the active quiz screen. It derives answered, unanswered, and flagged states from the existing attempt, filters by all/open/flagged, and checkpoints direct navigation through the existing session flow.

## Verification

- Added status-derivation and filtering tests.
- `npm test` — 27 tests passed.
- `npm run build` — passed (existing bundle-size warning remains).

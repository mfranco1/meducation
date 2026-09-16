# Remove redundant feedback answer summaries

## Status

Complete

## Scope

Remove the two redundant feedback summaries identified in browser annotations:

- The incorrect-feedback **Correct answer** callout.
- The correct-feedback **You chose …** line.

Correct and incorrect choices remain clear through their existing highlighted answer rows, and the feedback status header and explanation remain unchanged.

## Checklist

- [x] Remove answer-summary markup and unused data lookups from `FeedbackPanel`.
- [x] Update feedback design guidance to rely on choice highlighting rather than duplicate text.
- [x] Run tests and production build.
- [x] Verify correct and incorrect feedback in the browser at the reviewed viewport.
- [x] Move this tracker to `docs/work/done`.

## Verification

- `npm test` — passed (7 tests).
- `npm run build` — passed; Vite emitted its existing large-chunk advisory.
- Browser verification — correct and incorrect feedback each render only their status header and explanation after the highlighted answer choices.

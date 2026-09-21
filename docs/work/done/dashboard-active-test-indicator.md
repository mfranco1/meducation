# Dashboard active-test indicator

## Status

Complete

## Checklist

- [x] Aggregate saved active tests by subject for dashboard cards.
- [x] Render a compact, text-labelled in-progress count.
- [x] Add dashboard coverage for visible and absent indicator states.
- [x] Document the dashboard behavior.
- [x] Run verification and move this tracker to completed work.

## Verification

- `npm test` — passed (13 files, 51 tests)
- `npm run build` — passed; existing bundle-size warning remains
- `npm run validate:content` — passed; existing source-answer review warnings remain
- `git diff --check` — passed

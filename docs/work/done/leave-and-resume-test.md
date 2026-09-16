# Leave and resume an in-progress test

## Status

Complete

## Checklist

- [x] Review current attempt persistence and quiz navigation.
- [x] Persist the current question checkpoint for active attempts.
- [x] Add leave and resume controls to the learner flow.
- [x] Verify compatibility, tests, build, and content validation.
- [x] Move this tracker to `docs/work/done`.

## Verification

- `npm test` — passed (3 tests)
- `npm run build` — passed
- `npm run validate:content` — passed; existing missing-rationale warnings remain

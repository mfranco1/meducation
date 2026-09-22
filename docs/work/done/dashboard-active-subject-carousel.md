# Dashboard active-subject carousel

## Status

Complete

## Checklist

- [x] Derive the most-recent active quiz activity for each dashboard subject.
- [x] Add an accessible, wraparound active-subject carousel below the Subjects heading.
- [x] Keep the complete subject catalog below the carousel.
- [x] Cover filtering, order, wraparound navigation, and subject selection with tests.
- [x] Update product, design, architecture, and testing documentation.
- [x] Run tests, content validation, production build, and whitespace checks.

## Verification

- `npm test -- --maxWorkers=1 --minWorkers=1` — passed (17 files, 80 tests). The default parallel run timed out in two existing slow tests under machine contention; both pass in the serial verification run.
- `npm run validate:content` — passed (existing source-answer review warnings remain).
- `npm run build` — passed (existing bundle-size warning remains).
- `git diff --check` — passed.

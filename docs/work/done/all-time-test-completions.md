# All-time test completions

Completed 2026-09-16.

## Delivered

- Added a persistent completion count for each quiz. On its first use, the count is seeded from the completed attempts currently stored in the browser.
- Incremented the quiz count whenever a learner completes a test.
- Added a compact subject-page card indicator for tests completed at least once.

## Verification

- `npm test` — 20 tests passed.
- `npm run validate:content` — passed with 32 existing source-answer review warnings.
- `npm run build` — passed; Vite reported its existing large-chunk advisory.

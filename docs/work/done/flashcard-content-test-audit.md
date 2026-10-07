# Expanded flashcard bank test audit

- [x] Inspect test isolation and repository verification guidance.
- [x] Run frontend/backend tests and admin browser tests against the expanded bank.
- [x] Update any stale content-dependent browser selectors or expectations.
- [x] Validate canonical content and verify TypeScript/build and affected checks.
- [x] Record results and complete this tracker.

Frontend unit tests already mock canonical imports with fixed fixtures; backend tests and learner browser tests use explicit banks. Admin browser tests load authored content and include positional deck action selectors, which need verification with the expanded catalog. Preserve the existing canonical content edits.

Both admin browser tests timed out on the expanded authored bank (CRUD: 60 seconds; bulk add: 30 seconds). They now intercept the Vite flashcard JSON module before navigation with the existing populated contract fixture. This preserves one baseline for initial state, reset, and exported replay without editing application code or canonical files. Card actions target their named test-created deck instead of the first or second deck in the catalog. The CRUD export also verifies that existing fixture cards are preserved. Documented this isolation in `docs/testing.md`.

Verification:

- `npm test`: 63 files, 384 tests passed.
- `.venv/bin/python -m pytest backend/tests -q`: 39 passed.
- `npm run test:e2e:admin`: both passed (30.2 seconds total); existing timeout limits unchanged.
- `npm run validate:content`: passed, 11,687 questions / 111 quizzes and 1,712 cards / 98 decks / 13 shared subjects.
- `npm run build`: TypeScript and default production build passed.
- `npm run lint`: passed, including architecture boundaries.
- `npm run format:check` and `git diff --check`: passed.

The first fixture implementation used a JSON import unsupported by the local Playwright Node runtime; replaced it with `readFile`/`JSON.parse` before the successful browser run. Existing answer-review advisories, large-build-chunk warning, and FastAPI test-client deprecation warning remain. Learner browser tests were inspected for fixture isolation but were not rerun; their files, fixtures, and configuration are unchanged. The pre-existing flashcard bank expansion is preserved untouched.

# Isolate CI tests from authored flashcard content

- [x] Inspect CI failures, existing tests, and repository documentation.
- [x] Add a shared empty flashcard fixture for authoring and quiz API tests.
- [x] Use the fixture in the frontend panel suite and backend question API settings.
- [x] Run frontend/backend tests, lint/style/types, content validation, and both build modes.
- [x] Record verification and complete the tracker.

The populated canonical flashcard bank broke tests that relied on an empty catalog or a smaller subject catalog. Tests now use explicit paired fixtures; production loading and validation remain unchanged.

`FlashcardAdminPanel.test.tsx` mocks the canonical flashcard JSON import with `tests/fixtures/empty-flashcard-bank.json`, so panel initialization and import/export replay use the same fixed baseline. Backend quiz request tests use a `bank_settings` fixture that pairs the temporary question bank with that empty flashcard fixture. Flashcard repository tests continue to verify nonempty catalogs and reject invalid shared-subject references. Updated `docs/testing.md` to describe this isolation instead of assuming canonical flashcards stay empty.

Verification:

- Frontend panel suite: 12 tests passed.
- Full frontend suite: 61 files, 364 tests passed.
- Full backend suite: 40 tests passed.
- Frontend lint and scoped formatting passed.
- Backend Ruff and mypy passed.
- Content validation passed: 11,687 questions, 111 quizzes, 674 cards, 13 decks, 13 shared subjects.
- TypeScript and both learner/default and optional admin production builds passed.
- `git diff --check` passed; both canonical JSON files have no diff.

An initial full frontend run overlapped the builds and timed out in the existing 60-second canonical Markdown validation test (363 other tests passed). Reran the full suite without concurrent build work: all 364 tests passed in 107.03 seconds. No timeout limits were changed. Existing answer-review warnings, build chunk-size warnings, and the FastAPI test-client deprecation warning remain.

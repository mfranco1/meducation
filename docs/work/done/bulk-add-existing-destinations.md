# Bulk add to existing subjects and quizzes

## Outcome

Implemented the existing-destination bulk-add workflows within **Bulk add**. **Add quizzes** now opens a subject picker and loads the content-only `quizzes` template for the selected subject. **Add items** now opens a subject picker followed by a quiz picker and loads the content-only `items` template for that quiz.

The selected destination is retained separately from the Record tab selection. Changing the subject or quiz clears the prior draft and validation preview before loading a template for the new destination. The compiler continues to generate IDs, preserve item and choice order, preview atomically, and stage the grouped change set.

Added core coverage for multiple quizzes with different item counts under one existing subject and multiple appended items in an existing quiz. Updated content-management documentation with both workflows.

## Verification

- `npm test` — passed, 22 files and 109 tests.
- `npm run validate:content` — passed: 10,496 questions across 101 quizzes, with the existing 32 answer-review warnings.
- `npm run build` — passed. Vite reports the existing large validation chunk warning.
- Inspected `/admin.html`: selected an existing subject for **Add quizzes** and confirmed the `quizzes` template; opened **Add items** and confirmed subject and quiz pickers appear in order.

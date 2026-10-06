# Frontend flashcard CI investigation

Scope: investigate the frontend unit-test failure in GitHub Actions run 37476162949 for commit 9b3430b. No production or canonical-content changes are requested.

- [x] Confirm frontend failed at `npm test`; lint and format checks passed, later frontend build steps were skipped.
- [x] Retrieve GitHub check annotations: all 10 frontend failures are in `src/admin/FlashcardAdminPanel.test.tsx`.
- [x] Reproduce the coordinated-bundle subject validation error and an import-preview timeout locally.
- [x] Run a temporary empty-catalog mock to verify the suite's dependency on its previous baseline.
- [x] Remove the diagnostic mock and record findings and recommended correction.

The latest commit populated the canonical flashcard bank from zero decks/cards to 13 decks and 674 cards. This panel suite still imports that canonical bank, while several assertions require an empty starting bank and some subject fixtures retain only one or two subjects.

## Findings

GitHub frontend annotations identify 10 failing tests, all in `FlashcardAdminPanel.test.tsx`:

- One coordinated-bundle test validates all canonical decks against a single retained subject, producing 13 unknown-subject errors.
- One reorder test expects exactly three newly created decks but receives those three plus the 13 canonical decks. Its reset assertions also assume the original bank is empty.
- Two tests use singular role queries for `Add card` or `Bulk add cards`; every existing deck adds another matching button.
- Six tests exceed their 5-second timeout. The panel renders the canonical 674 cards, making the suite's repeated broad accessibility queries and updates much more expensive. The controlled empty-catalog experiment eliminated every timeout.

## Verification and recommendation

Ran the original panel suite and reproduced the subject-reference error, import/history timeouts, and reordered-deck assertion mismatch. Stopped that slow diagnostic run once those failures were confirmed.

Temporarily mocked `../content/flashcardBank.generated.json` to `{ schemaVersion: 2, decks: [], cards: [] }` in this test file and reran `npm test -- src/admin/FlashcardAdminPanel.test.tsx --reporter=verbose`. All 12 tests passed in 9.72 seconds. Removed the mock afterward; no application, test, or canonical-content changes remain from this investigation.

Recommended correction: make the panel suite use an explicit small flashcard fixture, including its import/export baseline. Preserve canonical-content checks in dedicated content tests. These failures do not justify increasing global test timeouts. The workflow remains failing until a correction is implemented; this tracker records completion of the investigation only.

Evidence: https://github.com/mfranco1/meducation/actions/runs/37476162949/job/112311993834

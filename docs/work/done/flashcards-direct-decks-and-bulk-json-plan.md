# Direct subject decks and flashcard bulk JSON

Status: Complete. Stages 1 and 2 are implemented and verified.

## Goal and scope

Replace flashcard subject → topic → deck → card with subject → deck → card throughout storage, existing content API, learner UI, and admin. Add JSON batch creation of cards in an existing deck, empty decks in an existing subject, and decks with nested cards in an existing subject.

Use the existing read-only FastAPI service and local admin staging/export workflow. No new backend infrastructure, database, publishing endpoint, or runtime AI is needed. Shared subjects remain authoritative in `questionBank.generated.json`; quiz `metadata.topic` and `metadata.subtopic` are outside this change.

## Baseline findings before implementation

- `flashcardBank.generated.json` is schema v1 and currently contains no topics, decks, or cards. Populated contract and browser fixtures still exercise topic relationships.
- `schema.ts`, `flashcardBank.ts`, structural/Markdown validators, and runtime/API decoders currently depend on topics. Flashcard revision hashing uses the `flashcards-v1` domain prefix.
- Python flashcard models and indexes live in `backend/src/meducation_api/repositories/question_bank.py`; flashcard response models/routes live in `main.py`.
- Learner topic selection is carried through `navigation.ts`, `App.tsx`, `useFlashcardSession.ts`, selectors, and subject-screen props. Study checkpoints are keyed by deck and card IDs, without topic references.
- `FlashcardAdminPanel.tsx` supports single-record topic/deck/card JSON editing and a separate change-set import flow. `flashcardChangeSet.ts` already applies operation arrays to a clone and validates the final bank.
- Quiz authoring has a content-only bulk draft parser/compiler in `bulkAddDraft.ts`. Reuse its workflow conventions, but keep flashcard parsing and compilation separate from quiz-specific fields and choice allocation.
- Coordinated bundles and `validateAdminBank.ts` protect shared-subject references. They also need the new deck-to-subject relationship.

## Proposed storage contract and migration policy

Use schema v2 with flat arrays:

```ts
interface StoredFlashcardDeck {
  id: string;
  subjectId: string;
  name: string;
  description?: string;
}

interface StoredFlashcardBank {
  schemaVersion: 2;
  decks: StoredFlashcardDeck[];
  cards: StoredFlashcard[]; // existing card fields remain unchanged
}
```

The only relationship chain becomes `card.deckId → deck.subjectId → subject.id`. Remove `StoredFlashcardTopic`, `topics`, `topicId`, and `topicCount` from active flashcard contracts. Continue allowing empty decks and subjects with no decks. Preserve immutable IDs, exact card content, optional fields, and parent-scoped canonical array ordering.

Provide a one-time v1-to-v2 candidate migration for populated banks: resolve each deck's subject through its old topic, replace `topicId` with `subjectId`, and omit topics. Preserve the entire deck-array order and card-array order; do not regroup by topic. Validate input references and the final candidate against shared subjects. Produce a review report listing removed topics and mapped decks; orphan references fail instead of dropping records. Empty topics are intentionally removed. Deck names that become siblings retain their names and IDs, with the existing duplicate-name warning policy applied at subject scope.

The checked-in empty bank can be updated directly after contract changes. Keep legacy input types confined to the migration tool/tests; learner and backend runtime accept v2 only. Old flashcard v1 change sets and coordinated bundles containing them should fail with an explicit migration message. Do not silently reinterpret historical operations or revisions. If an old change set must be recovered, replay it with its matching old bank/tooling, migrate the resulting bank, and review it separately. Existing quiz change-set compatibility remains intact.

Bump flashcard change sets to version 2 with `base.schemaVersion: 2`, removing topic operations. Preserve deck/card create, update, delete, and move semantics, subject/base/result revision checks, required reason, and explicit deck cascades. Moving a deck between subjects updates `subjectId`; sibling insertion/reordering checks use the new subject parent. The coordinated outer bundle may remain version 1 because its envelope shape is unchanged; validate its embedded flashcard version explicitly.

Use `flashcards-v2` for content revision hashing in TypeScript and Python and update the shared hash fixture. Catalog revisions will change, but deck study signatures must retain their current ordered-card inputs. No checkpoint-storage migration or signature-version change is required solely for removing topics; verify existing saved positions still resume.

## Bulk authoring JSON

The selected destination supplies parent IDs. Templates contain authorable content only, with generated IDs, schema versions, revisions, and operation envelopes handled internally.

### Add cards to a selected deck

```json
{
  "cards": [
    {
      "front": "Question text",
      "back": "Answer text",
      "sources": "Optional source Markdown",
      "reviewNote": "Optional plain-text note"
    }
  ]
}
```

### Add decks to a selected subject

```json
{
  "decks": [
    { "name": "Deck A", "description": "Optional description" },
    { "name": "Deck B" }
  ]
}
```

### Add decks and their cards to a selected subject

```json
{
  "decks": [
    {
      "name": "Deck A",
      "cards": [
        { "front": "Question 1", "back": "Answer 1" },
        { "front": "Question 2", "back": "Answer 2" }
      ]
    },
    {
      "name": "Deck B",
      "cards": [{ "front": "Question 3", "back": "Answer 3" }]
    }
  ]
}
```

Use one subject-level deck format with optional `cards`: omission or `[]` creates an empty deck, while nested lists create decks and cards together. Both kinds can appear in the same batch. A deck-level `cards` batch and the top-level `decks` batch must each contain at least one record.

Reject malformed JSON, null/wrong types, unknown fields at every depth, supplied IDs/parent IDs, blank required text, and invalid rich content. Preserve valid submitted strings verbatim rather than trimming or rewriting them. Return actionable paths such as `$.decks[1].cards[2].back`. Duplicate deck names warn without merging records; duplicate card text remains distinct content. Optional fields follow existing validation rules and are omitted when absent.

All batches append to the destination's existing siblings in input order. This feature creates records only; editing, moving, replacing, and merging existing records remain separate operations.

## Admin workflow and atomicity

1. Show **Add deck** and **Bulk add decks** under each subject; show **Add card** and **Bulk add cards** under each deck. Remove topic controls and nesting.
2. Open a contextual JSON editor with destination name, copyable template, paste support, and JSON file loading into the same draft. Keep technical **Import change set** separate.
3. Require a change reason and parse/validate before preview. Compile nested input into ordered `deck.create` followed by its `card.create` operations; ordinary operation arrays are sufficient, so no new recursive replay operation is needed.
4. Allocate collision-checked `d-UUID` and `f-UUID` IDs once per compiled preview. Retain the exact operations and candidate for staging/export; never regenerate IDs during Stage.
5. Preview destination, ordered decks/cards, generated IDs, counts, and warnings. Map final-bank diagnostics back to draft paths. Require a deliberate Stage action after preview.
6. Bind preview to flashcard snapshot, subject snapshot, destination, draft text, reason, and coordinated export context. Any relevant change invalidates it. Preserve existing generation guards for asynchronous hashes and ignore late results.
7. Commit the entire validated operation array as one history entry and one bank-change notification. One Undo removes the complete batch. Failed parsing, validation, stale checks, or staging leaves banks, history, and operation logs unchanged.
8. Include bulk drafts in unsaved-edit, section-switch, reset, and unload protections; prevent duplicate preview/stage requests while busy. Preserve coordinated import/export/reset behavior and shared-subject guards.

Consider a focused `FlashcardBulkAddDialog` and pure `flashcardBulkAddDraft.ts` module to avoid embedding parsing and compilation in the existing panel. Share lightweight JSON-editor presentation where practical without rewriting quiz authoring.

## Implementation sequence and progress

- [x] **1. Contract and migration:** introduce v2 storage types; implement candidate migration/parity checks; update structural validation, flashcard adapter/indexes/serialization, schema/revision fixtures, and the canonical empty bank. Remove topic operations and version the change-set parser/export/replay. Change shared-subject protection to inspect decks, including coordinated replay and reset candidates.
- [x] **2. Existing API and runtime:** update Python models, repository protocol/indexes, response DTOs/routes, TypeScript API decoders, and local/API runtime setup. Keep existing route paths; subject catalogs return `{ revision, decks }`, with deck `subjectId`. Subject summaries retain deck membership/counts and empty-deck IDs. Preserve strict membership/order validation, ETags, 409/reload handling, cancellation, deduplication, retry, and safe errors. Release frontend and service together and reload old clients; no mixed-contract compatibility layer is planned.
- [x] **3. Learner simplification:** remove topic filters, labels, counts, callbacks, and navigation/session state. Subjects list decks directly; study/back/finish return to the subject. Preserve Continue Studying, activity ordering, saved-card resume, empty-deck disabling, failed-load recovery, and quiz exit confirmations.
- [x] **4. Admin hierarchy:** show subject → deck → card, create decks directly under subjects, and update move/reorder/cascade controls and selection handling. Preserve staged snapshots, bounded Undo, change reasons, shared-subject guards, paired imports, and export replay parity.
- [x] **5. Bulk parser/compiler:** add both contextual draft contracts, templates, strict path diagnostics, ID allocation, operation compilation, full-candidate validation, and preview snapshot checks. Test the three requested import scenarios and mixed empty/populated decks.
- [x] **6. Bulk UI:** connect paste/file input, preview, atomic Stage, batch Undo, stale-preview invalidation, and draft guards to the existing admin workspace.
- [x] **7. Verification and documentation:** update the active flashcard schema/content-management/testing documentation and admin/learner browser acceptance coverage. Keep completed historical trackers as historical records; this plan supersedes their flashcard topic design. Move this tracker to `docs/work/done` after implementation and required checks pass.

Steps 1–4 are a coherent cross-layer migration; do not ship an intermediate application with mismatched storage/API contracts. Steps 5–6 build on the simplified hierarchy.

## Required verification and acceptance

- Migration tests: populated/empty banks, interleaved former topics, preserved IDs/content/order, removed empty topics, duplicate-name warnings, unknown subject/topic rejection, and unchanged deck signatures/checkpoints.
- Storage/API tests: missing or unknown `subjectId`, rejected legacy topic fields/schema, duplicate IDs, strict DTO keys, empty subjects/decks, exact deck/card membership, deterministic TypeScript/Python revisions, safe failures, and revision-conflict recovery.
- Learner tests: direct subject deck list, no topic UI/state, activity order, study/reveal/save/reload/resume/finish, failed saves/loads, mobile/keyboard layouts, and coexistence with quiz progress.
- Admin core/component tests: direct CRUD/moves/reorders/cascades, all JSON modes, optional fields and rich text, nested diagnostics, unknown/null/technical fields, empty batches, source immutability, stable preview IDs, stale draft/subject/bank/destination checks, one-step Undo, invalid-batch rollback, and export/replay equality. Verify coordinated bundle subject changes and reset/undo reference guards now follow decks.
- Browser acceptance: load/paste each template, preview and stage several records, reject one invalid nested card without partial changes, undo the whole batch, export/replay, and study/resume an imported deck in an isolated fixture setup. Browser tests must never replace canonical medical content.

Run `npm run lint`, `npm run format:check`, `npm test`, `npm run validate:content`, `npm run build`, `VITE_BUILD_ADMIN=true npm run build`, `npm run test:e2e`, and `npm run test:e2e:admin`. Run `.venv/bin/python -m pytest backend/tests -q`, `.venv/bin/ruff check backend/src backend/tests`, and `.venv/bin/mypy backend/src`. Finish with `git diff --check` and confirm the question bank and quiz metadata are unchanged.

The work is complete when there is no active flashcard topic contract or UI, decks belong directly to shared subjects, all three bulk creation modes stage atomically and replay exactly, saved deck positions survive the hierarchy migration, and required checks pass.

Stage 2 verification: `npm test` (61 files, 352 tests), `npm run lint`, Prettier on changed files, `npm run validate:content`, `npm run build`, `VITE_BUILD_ADMIN=true npm run build`, `npm run test:e2e` (11 tests), `npm run test:e2e:admin` (2 tests), and `git diff --check` all pass. Content validation reports 11,687 questions and an empty canonical flashcard bank; the quiz content remains untouched. Both Vite builds complete with the existing large-chunk advisory (learner Markdown bundle and admin bundle).

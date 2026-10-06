# Flashcard schema

The canonical flashcard store is `src/content/flashcardBank.generated.json`, a schema-v2 JSON document with flat `decks` and `cards` arrays. Shared subject records remain authoritative in `src/content/questionBank.generated.json`; flashcards refer to stable subject IDs and never copy subject rows.

The relationship chain is `card.deckId → deck.subjectId → subject.id`. A deck belongs directly to one subject, and a card belongs to one deck. Do not store repeated subject names, child ID arrays, or derived card counts in canonical records. Runtime summaries may derive parent details and counts.

## Stored records

```ts
interface StoredFlashcardDeck {
  id: string; // stable opaque ID prefixed with d
  subjectId: string; // existing shared subject ID
  name: string;
  description?: string;
}

interface StoredFlashcard {
  id: string; // stable opaque ID prefixed with f
  deckId: string;
  front: string;
  back: string;
  sources?: string;
  reviewNote?: string;
}

interface StoredFlashcardBank {
  schemaVersion: 2;
  decks: StoredFlashcardDeck[];
  cards: StoredFlashcard[];
}
```

IDs are immutable and never encode ordering. New authoring flows allocate IDs once and preserve them through preview, stage, and export. Optional fields are omitted rather than set to `null`. Unknown keys, duplicate IDs, empty names or card faces, and broken references are invalid. Empty decks are allowed for authoring; the learner cannot launch an empty deck.

Array order is canonical within each parent: deck order within a subject and card order within a deck. Moves update parent membership and order while preserving entity IDs and card content. Duplicate sibling deck names warn; distinct IDs remain authoritative.

Card `front` and `back` use the same restricted rich Markdown, HTML, image, URL, and math policy as quiz stems and rationales. `sources` uses the restricted source Markdown policy. `reviewNote` is plain text. The learner renders both faces using the shared sanitized Markdown renderer. Quiz `metadata.topic` remains free text and is not a foreign key to the flashcard hierarchy.

## Schema v1 migration

`migrateFlashcardBankV1` builds a v2 candidate from a v1 bank without modifying the input or canonical file. It resolves each old deck's `topicId` to the topic's `subjectId`, preserves deck/card IDs, content, and array order, removes topics, and returns a report of removed topics, mapped decks, and duplicate-name warnings. Orphan topic or subject references fail. Review the report and candidate before replacing the canonical bank. The checked-in bank is already schema v2.

The runtime accepts v2 only. Flashcard change sets use version 2 and schema-v2 revisions; v1 flashcard change sets require replay against their matching v1 bank/tooling followed by candidate migration. Quiz schema and change sets are unaffected.

## Admin bulk JSON

The local admin accepts content-only JSON from the selected destination. For a deck, use `{ "cards": [...] }`, where each card requires non-empty `front` and `back` strings and may include `sources` and `reviewNote`. For a subject, use `{ "decks": [...] }`, where each deck requires a non-empty `name` and may include `description` and `cards`; omitted or empty `cards` creates an empty deck. Nested cards use the same fields as cards added to an existing deck.

The admin rejects unknown fields, IDs, parent references, null values, blank required text, invalid Markdown, and empty top-level batches with JSON-path diagnostics. It allocates IDs, previews the ordered candidate and warnings, then stages all records as one undoable batch. Editing the draft or changing the bank, subjects, destination, reason, or coordinated export context makes the preview stale. Paste JSON into the editor or load a `.json` file; technical change-set import remains a separate workflow.

## PostgreSQL mapping

The normalized mapping is `subjects(id, name, accent, position)`, `decks(id, subject_id, name, description, position)`, and `flashcards(id, deck_id, front, back, sources, review_note, position)`. The `subjects` table is shared with quizzes. Foreign keys are indexed and parent deletes are restricted by default; explicit admin cascades are transactional and report affected child records.

Learner checkpoints are not content. They belong in a separate progress repository and, eventually, a user-scoped table keyed by `(user_id, deck_id)` with current card ID, content signature, update time, and opened/flagged card IDs. They must not be written into this canonical bank. The local progress envelope is schema v2; it reads v1 position checkpoints in memory as having no opened or flagged cards, retains their legacy bytes, and writes v2 on the next successful checkpoint. Malformed v2 state is preserved and surfaced for recovery. Older application builds cannot read the v2 key. Removing topics does not change deck IDs or ordered study content, so existing saved deck positions remain valid.

## Validation

Run `npm run validate:content` to validate both canonical banks and cross-bank subject references. Do not edit the generated flashcard JSON without reviewing stable IDs, parent relationships, order, rich content, and the corresponding authoring change set.

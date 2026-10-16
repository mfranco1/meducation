# Flashcard schema

PostgreSQL is the sole writable content authority. This page defines the schema-v2 flashcard representation used in paired drafts/releases and deterministic JSON exports. The paired quiz subject registry remains authoritative for deck references. Preserve exact strings, array order, omitted fields and stable server-reserved IDs. JSON file editing below describes fixture/archive representations only. See [the recovery runbook](L4-authoritative-recovery.md).

The PostgreSQL flashcard document and its deterministic `flashcardBank.json` exports use schema v2 with flat `decks` and `cards` arrays. Shared subject records remain authoritative in the paired database quiz bank (represented in its deterministic `questionBank.json` export); flashcards refer to stable subject IDs and never copy subject rows.

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

The runtime and authoring change sets accept version 2 only. The completed schema-v1 migration tool has been retired.

## Admin bulk JSON

The local admin accepts content-only JSON from the selected destination. For a deck, use `{ "cards": [...] }`, where each card requires non-empty `front` and `back` strings and may include `sources` and `reviewNote`. For a subject, use `{ "decks": [...] }`, where each deck requires a non-empty `name` and may include `description` and `cards`; omitted or empty `cards` creates an empty deck. Nested cards use the same fields as cards added to an existing deck.

The admin rejects unknown fields, IDs, parent references, null values, blank required text, invalid Markdown, and empty top-level batches with JSON-path diagnostics. It allocates IDs, previews the ordered candidate and warnings, then stages all records as one undoable batch. Editing the draft or changing the bank, subjects, destination, reason, or coordinated export context makes the preview stale. Paste JSON into the editor or load a `.json` file; technical change-set import remains a separate workflow.

## PostgreSQL mapping

The [selected L3 database mapping](decisions/0005-paired-content-releases-and-postgres-schema.md) adds `release_id` to `subjects(id, name, accent, position)`, `decks(id, subject_id, name, description, position)`, and `flashcards(id, deck_id, front, back, sources, review_note, position)`. Composite keys and foreign keys keep relationships within one paired release. `position` is a zero-based global collection ordinal; filtering that order gives canonical sibling order. The `subjects` table is shared with quizzes. Foreign keys are indexed and parent deletes are restricted. Finalized release rows are immutable; L4 admin cascades affect the paired draft before publication. Migration `0001_content` implements these constraints; the learner Postgres adapter now reads decks/cards and subject summaries from the same pinned release as quiz content.

Learner checkpoints are not content. They belong in a separate progress repository and, eventually, a user-scoped table keyed by `(user_id, deck_id)` with current card ID, content signature, update time, and opened/flagged card IDs. They must not be written into this canonical bank. The local progress envelope is schema v2 under `meducation.flashcards.progress.v2`; only this key is read. Checkpoints contain a SHA-256 content signature and opened/flagged ID arrays. Serialized-content signatures and v1 checkpoints are no longer supported. Malformed current state is preserved and surfaced for recovery.

## Validation

Edit flashcards through the authenticated paired PostgreSQL draft, preserving stable IDs, parent relationships, order, and rich content. Validate a fresh selected database export with `validate-export`; `npm run validate:content -- <quiz-file> <flashcard-file>` checks only the explicitly selected pair and its shared-subject references.

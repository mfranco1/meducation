# Flashcard schema

Defines the schema-v2 flashcard document stored in paired drafts and releases and written to deterministic `flashcardBank.json` exports. The shared subject registry in the quiz document stays authoritative for deck references. Preserve exact strings, array order, omitted fields and server-reserved IDs.

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

## Bulk JSON

Bulk adds are content-only: a deck takes `{ "cards": [...] }` and a subject takes `{ "decks": [...] }` ([content management](content-management.md#editor-workflow)). The editor rejects unknown fields, IDs, parent references, nulls, blank required text and invalid Markdown with JSON-path diagnostics, then previews the ordered candidate before the server reserves IDs.

## PostgreSQL mapping

Tables `subjects`, `decks` and `flashcards` carry `release_id` and a zero-based global `position`; composite keys keep relationships inside one paired release, and finalized rows are immutable ([ADR 0005](decisions/0005-paired-content-releases-and-postgres-schema.md)). Learner checkpoints are not content: they are stored separately in browser progress under `meducation.flashcards.progress.v2` with a SHA-256 content signature and opened and flagged card IDs, and are never written into this bank.

## Validation

Validate a fresh selected database export with `validate-export`; `npm run validate:content -- <quiz-file> <flashcard-file>` checks only an explicitly selected pair and its shared-subject references.

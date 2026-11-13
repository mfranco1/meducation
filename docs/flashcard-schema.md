# Flashcard schema

Defines the schema-v4 flashcard document stored in paired drafts and releases and written to deterministic `flashcardBank.json` exports, with flat `decks` and `cards` arrays. Subjects and topics live in the paired [quiz document](question-schema.md); flashcards refer to stable topic IDs and never copy subject or topic rows. Preserve exact strings, array order, omitted fields and IDs. Keys are written in canonical order: record fields as documented.

The relationship chain is `card.deckId → deck.topicId → topic.subjectId → subject.id`. A deck belongs to one topic, and a card belongs to one deck. Do not store repeated subject names, child ID arrays, or derived card counts in canonical records. Runtime summaries may derive parent details and counts.

## Stored records

The types are `StoredFlashcardBank`, `StoredFlashcardDeck` and `StoredFlashcard` in `src/content/schema/schema.ts`. A deck has `id` (prefixed `d`), `topicId`, `name` and an optional `description`. A card has `id` (prefixed `f`), `deckId`, `front`, `back` and optional `sources`.

IDs are assigned by the server on create, are immutable and never encode ordering. Optional fields are omitted rather than set to `null`. Unknown keys, duplicate IDs, empty names or card faces, and broken references are invalid. Empty decks are allowed for authoring; the learner cannot launch an empty deck.

Array order is canonical within each parent: deck order within a topic and card order within a deck. Moves update parent membership and order while preserving entity IDs and card content. Duplicate sibling deck names warn; distinct IDs remain authoritative.

Card `front` and `back` use the same restricted rich Markdown, HTML, image, URL, and math policy as quiz stems and rationales. `sources` uses the restricted Markdown policy for quiz choices and pearls (emphasis and math, no HTML or images). The learner renders both faces using the shared sanitized Markdown renderer. Quiz `metadata.topic` remains free text and is not a foreign key to the flashcard hierarchy.

Bulk-add JSON is described in [content management](content-management.md#editor-workflow). Learner checkpoints are not content; they live in browser progress and are never written into this bank.

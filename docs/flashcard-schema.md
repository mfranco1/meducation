# Flashcard schema

The canonical flashcard store is `src/content/flashcardBank.generated.json`, a versioned JSON document with flat `topics`, `decks`, and `cards` arrays. Shared subject records remain authoritative in `src/content/questionBank.generated.json`; flashcards refer to their stable subject IDs and never copy subject rows.

The relationship chain is `card.deckId → deck.topicId → topic.subjectId → subject.id`. A topic belongs to one subject, a deck belongs to one topic, and a card belongs to one deck. Do not store derivable subject/topic IDs on lower-level records, repeated names, child ID arrays, or derived card counts. Runtime summaries may derive parent details and counts.

## Stored records

```ts
interface StoredFlashcardTopic {
  id: string;        // stable opaque ID prefixed with t
  subjectId: string; // existing shared subject ID
  name: string;
}

interface StoredFlashcardDeck {
  id: string;        // stable opaque ID prefixed with d
  topicId: string;
  name: string;
  description?: string;
}

interface StoredFlashcard {
  id: string;        // stable opaque ID prefixed with f
  deckId: string;
  front: string;
  back: string;
  sources?: string;
  reviewNote?: string;
}

interface StoredFlashcardBank {
  schemaVersion: 1;
  topics: StoredFlashcardTopic[];
  decks: StoredFlashcardDeck[];
  cards: StoredFlashcard[];
}
```

IDs are immutable and never encode ordering. New authoring flows allocate IDs once and preserve them through preview, stage, and export. Optional fields are omitted rather than set to `null`. Unknown keys, duplicate IDs, empty names or card faces, and broken references are invalid. Empty topics and decks are allowed for authoring; the learner cannot launch an empty deck.

Array order is canonical within each parent: topic order within a subject, deck order within a topic, and card order within a deck. Future SQL imports map these positions to one-based `position` columns. A move changes parent membership and order but preserves the entity ID and card content.

Card `front` and `back` use the same restricted rich Markdown, HTML, image, URL, and math policy as quiz stems and rationales. `sources` uses the restricted source Markdown policy. `reviewNote` is plain text. The learner renders both faces using the shared sanitized Markdown renderer. Quiz `metadata.topic` remains free text and is not a foreign key to this topic catalog.

## PostgreSQL mapping

The normalized mapping is `subjects(id, name, accent, position)`, `topics(id, subject_id, name, position)`, `decks(id, topic_id, name, description, position)`, and `flashcards(id, deck_id, front, back, sources, review_note, position)`. The `subjects` table is shared with quizzes. Foreign keys are indexed and parent deletes are restricted by default; explicit admin cascades are transactional and report affected child records.

Learner checkpoints are not content. They belong in a separate progress repository and, eventually, a user-scoped table keyed by `(user_id, deck_id)` with current card ID, content signature, and update time. They must not be written into this canonical bank.

## Validation

Run `npm run validate:content` to validate both canonical banks and cross-bank subject references. Do not edit the generated flashcard JSON without reviewing stable IDs, parent relationships, order, rich content, and the corresponding authoring change set.

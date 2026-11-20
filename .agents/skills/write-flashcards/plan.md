# Plan

Read this when a subject has no approved `plan.json`. `D` is the alias in [SKILL.md](SKILL.md).

## Find the gaps

1. `D coverage` lists every topic with its decks, card counts and question count, and flags topics with no decks, `THIN` topics (fewer cards than half the topic's questions) and decks outside 15 to 80 cards.
2. `D coverage "<Topic>"` adds the topic's quiz subtopics with a `GAP?` mark where no card mentions the subtopic's name. The match is by word, so confirm a gap with a grep of `fronts.txt` (run `D brief` once for any planned topic to create it) before planning cards for it.
3. With sources, extract them as plain text to `<work>/src/main.txt` (form-feed-separated pages) and note the page range for each deck.

Quiz subtopics are the coverage map: a point worth a question is worth a card. Add the high-yield content a well-prepared examinee and a safe new physician should know even where quizzes and sources are silent.

## Write `plan.json`

List only the topics and decks in scope.

```json
{ "topics": [ { "name": "Neonatology", "decks": [
  { "name": "Neonatal Jaundice", "description": "One sentence on scope.", "add": 30, "pages": "10-12",
    "focus": "Phototherapy and exchange thresholds, causes by age at onset." },
  { "name": "Neonatal Sepsis", "add": 10, "focus": "Late-onset organisms; empiric regimens." },
  { "name": "Respiratory Distress", "audit": true } ] } ] }
```

- `add`: the number of new cards, for a new deck or a top-up. `audit`: review the deck's existing cards for accuracy and currency. A deck can have both.
- `focus`: the points the new cards cover, named without asserting a threshold, dose or guideline position (writers verify those). For a top-up, name only points the deck lacks.
- `description`: one sentence, required for a new deck. A new topic also takes a `description` (1 to 2 sentences); existing topics and decks keep theirs.
- Use existing topics. A new deck holds 25 to 60 cards on one coherent area; split a larger area into decks by subarea, never "Part 2". Deck names are specific and don't repeat the topic name.
- Each point belongs to one deck. Where two decks could hold a point, give it to one and say so in the other's `focus`.
- Order a topic's new decks for learner progression; staging appends them after the existing decks.

## Audits

Audit when the user asks, when a guideline, classification or law the deck depends on has changed, or when [currency-notes.md](../write-quizzes/currency-notes.md) gains a term the deck uses (`grep -il "<term>" <work>/fronts.txt` finds the decks). An audit changes only what is wrong, outdated or unclear; it never restyles cards.

## Approval

Show the user a summary (per topic: decks, new card counts, audits) and wait for approval before writing.

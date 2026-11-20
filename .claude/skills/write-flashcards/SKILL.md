---
name: write-flashcards
description: Write new flashcard decks, top up thin decks, and audit or correct existing cards for a subject, then stage the changes in the editor draft for review and publishing. Use when asked to create, expand, fill, review, update or fix flashcard decks or cards.
---

Read and follow `.agents/skills/write-flashcards/SKILL.md` (the agent-neutral workflow). In Claude Code:

- Models: Sonnet subagents (`model: sonnet`) for writers (`effort: "low"`) and reviewers.
- Spawn prompt: only "Read `<path>` and follow it.", with the path that `deck_work.py prompt` printed.

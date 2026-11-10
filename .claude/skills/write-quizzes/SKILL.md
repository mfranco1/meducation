---
name: write-quizzes
description: Write new board-style quizzes for a subject and stage them in the editor draft for review and publishing. Use when asked to create, expand or fill quizzes or question banks for a subject or topic, from source documents or from medical knowledge alone.
---

Read and follow `.agents/skills/write-quizzes/SKILL.md` (the agent-neutral workflow) and the files it links. In Claude Code:

- Models: Sonnet subagents (`model: sonnet`) for writers, blind solves, the standards pass and replacements; an Opus subagent (`model: opus`) for the judgment pass.
- Point each subagent at its files by path (brief, round directory, review inputs) and ask for a short summary back, not the items.
- Keep spawn prompts short: tell the subagent to read its template in `prompts/` and follow it, then list the placeholder values. Put the subject notes and each topic's boundary block in scratchpad files that `SUBJECT_NOTES` names, so every spawn in a topic reuses them.

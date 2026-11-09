---
name: write-quizzes
description: Write new board-style quizzes for a subject and stage them in the editor draft for review and publishing. Use when asked to create, expand or fill quizzes or question banks for a subject or topic, from source documents or from medical knowledge alone.
---

Read and follow `.agents/skills/write-quizzes/SKILL.md` (the agent-neutral workflow) and the files it links. In Claude Code:

- Models: Sonnet subagents (`model: sonnet`) for writers, blind solves, the standards pass and replacements; an Opus subagent (`model: opus`) for the judgment pass.
- Point each subagent at its files by path (brief, round directory, review inputs) and ask for a short summary back, not the items.

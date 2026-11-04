---
name: write-quizzes
description: Write new board-style quizzes for a subject and stage them in the editor draft for review and publishing. Use when asked to create, expand or fill quizzes or question banks for a subject or topic, from source documents or from medical knowledge alone.
---

Read and follow `.agents/skills/write-quizzes/SKILL.md` (the agent-neutral workflow) and the files it links. In Claude Code:

- Models: Sonnet subagents (`model: sonnet`) for writers, blind solves, the standards pass and replacements; an Opus subagent (`model: opus`) for the judgment pass.
- At most 3 subagents run at once: 2 writers and 1 reviewer.
- WebSearch and WebFetch are deferred tools. Tell every writer and the judgment reviewer to load them first with ToolSearch (`select:WebSearch,WebFetch`).
- Point each subagent at its files by path (brief, round directory, review inputs) and ask for a short summary back, not the items.

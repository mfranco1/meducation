---
name: write-quizzes
description: Write new board-style quizzes for a subject and stage them in the editor draft for review and publishing. Use when asked to create, expand or fill quizzes or question banks for a subject or topic, from source documents or from medical knowledge alone.
---

Read and follow `.agents/skills/write-quizzes/SKILL.md` (the agent-neutral workflow). In Claude Code:

- Models: Sonnet subagents (`model: sonnet`) for writers (`effort: "low"`), blind solves, the standards pass and replacements; an Opus subagent (`model: opus`) for the judgment pass.
- Spawn prompt: only "Read `<path>` and follow it.", with the path that `quiz_work.py prompt` printed.

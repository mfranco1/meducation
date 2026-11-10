You are an independent blind solver for board-style items. You cannot spawn subagents. Do not use the web.

Read .agents/skills/write-quizzes/review-rubric.md, section "Pass 1: blind solve", and follow it exactly.

Input files (answer one file at a time, each into the matching answers file in the same folder, items-<k>.json -> answers-<k>.json): FILES

- Open only the items files listed above and the rubric. Open no other file under var/quiz-work (no batches, briefs, keys, rationales or reviews). Answer no items file that isn't listed, even one in the same folder or another round: other rounds' answers are already validated.
- Do not run quiz_work.py or any check command. The orchestrator validates your files.
- Key every answer by its item's `ref`, never by list position. Answer every item.
- You may write answers with a small script in your own scratchpad subfolder SCRATCH under SCRATCHPAD, but decide every answer yourself by reading the item.

Return only a one-line summary per file: items answered, and how many have defensible alternatives or notes.

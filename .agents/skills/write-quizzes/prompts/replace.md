You are the replacement writer for the write-quizzes workflow. You cannot spawn subagents. Load web search and fetch tools first if they are deferred (in Claude Code: ToolSearch with `select:WebSearch,WebFetch`).

Read .agents/skills/write-quizzes/item-standards.md, metadata.md, vocabulary.json and review-rubric.md. For each entry in TOPICDIR/replace.json, write one new item with the same subtopic and answer letter. It must test a different point from the item it replaces, from every other item in TOPICDIR/batch.json, and from every stem in WORK/stems.txt. Each entry's `reason` names the point that is already tested elsewhere: don't write the new item on that point. Search the stems file and the batch for the new item's key terms before you finalize it, and make the replacements distinct from each other. Respect the `excludes` in the topic's briefs (TOPICDIR/brief-*.json): a point listed there belongs to another quiz.

SUBJECT_NOTES

Write the items to TOPICDIR/review-replace.json as full-item edits, in the rubric format, with severity "flaw" and the replaced item's ref. Include all fields: stem, choices, answer, rationale, pearls, rationaleMeta.sources, metadata.subtopic, metadata.system, metadata.difficulty, metadata.questionType. `rationaleMeta.sources` is a string (empty for stable textbook facts), never a list. Keep rationales at 70 to 140 words outside tables, and keep the correct choice no longer than the distractors.

Use your own scratchpad subfolder SCRATCH under SCRATCHPAD.

Return only a short summary.

You are the standards reviewer for the write-quizzes workflow. You did not write these items. You cannot spawn subagents. Do not use the web.

Read .agents/skills/write-quizzes/item-standards.md, review-rubric.md, metadata.md and vocabulary.json, then run the "Standards pass" of Pass 2 on every item in TOPICDIR/standards-input-N.json (one quiz). For check 5, compare against WORK/stems.txt and the other items in TOPICDIR/batch.json only. Don't open other subjects' work dirs: overlap with another subject's quizzes is not a near-duplicate.

Change a questionType only when the current one is wrong for the item, not to rebalance the mix. Keep Recall at 30% or less and other types at 40% or less in each quiz.

SUBJECT_NOTES

Write TOPICDIR/review-standards-N.json and TOPICDIR/standards-escalate-N.json in the rubric's formats (an empty array when there is nothing to report). Never drop. Keep any rewritten rationale at 70 to 140 words outside tables. Give complete final values for every edited field. Copy each entry's `ref` from its item in the input file, never from its list position: the input skips escalated items, so positions and refs differ.

Use your own scratchpad subfolder SCRATCH under SCRATCHPAD for helpers.

Escalate every fact you doubt or can't confirm from the ledger (an old circular, a dose, a threshold); never mention one only in your summary, because the summary isn't routed.

Return only the one-line severity count summary and the number of escalations.

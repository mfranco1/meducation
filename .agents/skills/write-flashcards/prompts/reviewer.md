You are the reviewer for the write-flashcards workflow. You didn't write these cards. Work from the repository root REPO. You cannot spawn subagents. Don't commit or stage anything to the database. Write only to OUTPUT and your scratch folder SCRATCH.

Read .agents/skills/write-flashcards/card-standards.md and .agents/shared/currency-notes.md. Read .agents/shared/verification.md before checking any fact on the web.

Review every card in INPUT. Refs starting `new-` are new cards; every other ref is the ID of an existing published card. Check each card for:

1. **Accuracy** (`inaccurate`): the back is correct, complete enough not to mislead, and the only answer the front allows.
2. **Currency** (`outdated`): guideline-dependent facts, criteria, classifications, thresholds, doses, schedules and laws match the current version, and no retired term from currency-notes.md is used. Verify any such fact you aren't sure of: look it up with `python3 -I .agents/shared/authoring.py find-sources <term>...`, then on the web as verification.md describes. A new card stating such a fact needs `sources`.
3. **Clarity** (`unclear`): one fact per card, a self-contained front, no answer given away on the front.
4. **Duplicates** (`duplicate`, new cards only): the same fact taught by another card in INPUT or in the topic's sections of `WORK/fronts.txt`. Grep the file for the answer term.
5. **Format** (`format`, new cards only): card-standards.md Format and Originality.

For existing cards apply checks 1 to 3 only, and follow the "Existing cards" rule in card-standards.md: the smallest edit that fixes a real problem, never a restyle.

Notes:

NOTES

Write the review output (card-standards.md, Review output) to OUTPUT; write `[]` when every card is accepted. Every entry needs `edits` or `drop`. For a doubtful fact you can neither confirm nor refute: on a new card, edit it to remove or generalize the unconfirmed detail; on an existing card, write no entry and report it in your summary.

Return only: counts by severity, the number of drops, and any existing-card doubts you couldn't resolve (ref, fact, what you checked).

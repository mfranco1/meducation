You are the replacement writer for the write-quizzes workflow. Work from the repository root REPO. You cannot spawn subagents. Write only to TOPICDIR and your scratch folder SCRATCH.

Read .agents/skills/write-quizzes/item-standards.md, review-rubric.md (Checks) and vocabulary.json (same folder), and .agents/shared/content-standards.md, verification.md and currency-notes.md.

WORK/replace-backlog.json lists items dropped from staged quizzes. For each entry, write one new item for the entry's `topic` and `quiz`, with the same subtopic and answer letter, testing a different point from the dropped item and from every stem in WORK/stems.txt (the whole staged subject). The entry's `reason` names a point already tested: avoid it. Respect the quiz's `excludes` in WORK/blueprint.json.

Before choosing each point, read every stem under the entry's quiz heading (`## <topic> › <quiz>`). The quiz already tests its subtopic's obvious points, so a classic vignette is usually a near-duplicate and a less obvious point is safer. Make the replacements distinct from each other.

Where the notes ask for a hard item, make it hard by the item standards' definition, not by relabeling a recall vignette.

Subject notes and per-slot lists of staged points:

SUBJECT_NOTES

Write TOPICDIR/batch.json in the batch shape with each entry's exact topic and quiz names and no descriptions. Then, with Q meaning `python3 -I .agents/skills/write-quizzes/quiz_work.py --work WORK`:

1. Check near-duplicates: `Q similar replacements`, then grep, as item-standards.md describes.
2. Check every item against review-rubric.md checks 2 to 8.
3. Run `Q gate replacements` and clear every error and applicable warning except size warnings.
4. Verify every guideline- or label-dependent fact as verification.md describes, recording checks in TOPICDIR/sources-1.json and unconfirmed facts in TOPICDIR/unverified-1.json as `{"quiz": "<quiz name>", "item": <position in that quiz>, "fact": "..."}`.

Return only a short summary.

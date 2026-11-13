# Replacements and clean up

Read this when every topic in scope is staged. `Q` is the alias defined in [SKILL.md](SKILL.md).

Write the replacement backlog as one batch. Skip to `clean` if `Q backlog` is empty.

1. Refresh the outline and rerun `slices` for any topic, so `stems.txt` holds the whole staged subject.
2. Spawn one replacement writer (mid tier) with [prompts/replace.md](prompts/replace.md). It writes one new item per backlog entry into `<work>/replacements/batch.json`, under the entry's topic and quiz names. In `SUBJECT_NOTES`, name the quizzes whose share of hard items is below the [difficulty mix](item-standards.md) (about 20%), and ask for hard replacements there.
3. Run the gate on that batch and ignore its size warnings. Check each new item against `stems.txt` and the blueprint's `excludes`.
4. Blind-solve it like a topic named `replacements`: `Q blind replacements --batch batch.json --round initial`, `check-blind`, then `triage`. One standards reviewer takes every `standards-input-<n>.json` of this batch (each holds 1 to 3 items); tell it to ignore the questionType mix rule. Send any escalated item to the judge, apply and recheck as in step 5 of the workflow. Run `Q ready replacements` on the final batch.
5. Stage the batch. Staging adds the items to their existing quizzes by name. Refresh the outline to confirm the quizzes are back at their targets, then run `Q backlog --clear`. It keeps the replacements the review dropped, each with its slot's earlier reason appended. If it kept any, move `replacements/` aside, rerun `slices`, and repeat from step 2 for them.

Then run `Q clean`. It refuses while the backlog has entries. It merges any remaining source records into the shared ledger, then deletes the work dir except `blueprint.json` (the coverage map for later expansion or revision). Make the last lessons pass (Sessions and lessons in [SKILL.md](SKILL.md)), then delete the tracker in `docs/work/ongoing/`.

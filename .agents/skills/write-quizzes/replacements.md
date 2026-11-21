# Replacements and clean up

Read this when every topic in scope is staged. `Q` is the alias in [SKILL.md](SKILL.md). If `Q backlog` is empty, skip to clean up.

1. Refresh the outline and rerun `slices` for any topic, so `stems.txt` holds the whole staged subject. Run `Q backlog`: it lists the slots per quiz and each quiz's staged hard share.
2. Write `<work>/replacements/notes.md`: ask for hard replacements in quizzes below about 20% hard, and for each slot, grep `stems.txt` for its subtopic and list the staged points as "already staged, don't retest". The backlog reasons alone don't keep writers off staged vignettes. Before suggesting a candidate point, grep for its entity and concept terms, not its question wording: a staged item often asks the same fact in other words. Also grep the presentation (setting, age, finding), since a "most likely cause" vignette keys the entity without naming it.
3. Spawn one replacement writer (mid tier) with `Q prompt replace`.
4. Review the batch like a topic named `replacements`: `Q gate replacements` (ignore size warnings), `Q blind replacements`, blind solve, `Q check-blind replacements && Q triage replacements`. One standards reviewer takes every input file (`Q prompt standards replacements`); tell it in the notes to ignore the questionType mix. Judge, apply and recheck as in [SKILL.md](SKILL.md#5-review), then `Q ready replacements --batch <final>`.
5. Stage the batch: staging adds the items to their quizzes by name. Refresh the outline to confirm the quizzes are back at their targets, then run `Q backlog --clear`. It keeps any replacements the review dropped, with the slot's earlier reason, and moves `replacements/` aside. If it kept any, rerun `slices` and repeat from step 2.

## Clean up

Run `Q clean`. It refuses while the backlog has entries, merges remaining source records into the shared ledger, and deletes the work dir except `blueprint.json`. Make the last lessons pass ([SKILL.md](SKILL.md#lessons)), then delete the tracker.

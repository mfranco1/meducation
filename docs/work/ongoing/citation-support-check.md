# Citation support check

## Scope

Find out how often an item disagrees with the source it cites, then check in full only the kinds of item that fail often. Starts after [source-citation-cleanup](source-citation-cleanup.md) closes (its Phases 9 to 11 correct the disagreements already known). The bank has about 11,700 citations on 10,500 items, so every citation is not checked.

This is a content audit: it changes stems, keys, rationales and card faces under the audit rules of [write-quizzes](../../../.agents/skills/write-quizzes/SKILL.md) and [write-flashcards](../../../.agents/skills/write-flashcards/SKILL.md). Never publish: stage in the draft under actor `agent:support-check`; the user reviews and publishes. The user commits.

## Decisions

- Sample first (user, 2026-11-28): about 300 items, stratified by subject and by whether the key, rationale or card back carries a number, dose, regimen, cutoff or "most common" ranking.
- A source that cannot be read (paywalled or blocked) is recorded as unread and left out of the rate.
- Full checks go only to strata the sample shows fail often. Items that test a mechanism or a textbook fact stay with the normal subject audits unless the sample says otherwise.

## Steps

- [ ] Draw the sample: a seeded draw per stratum, saved as a list of item IDs. Record the strata and their sizes here.
- [ ] Check the sample (about 3 sessions, 100 items each): for each item, read the cited source for the tested point and record `supported`, `partly`, `disagrees` or `unread` with the quoted sentence. Correct an item that disagrees and log old and new wording for the user.
- [ ] Report the rate per stratum to the user and agree which strata get a full check.
- [ ] Full check of the agreed strata (boxes added here by subject).

## Status

Not started. Waiting for the source citation cleanup to close.

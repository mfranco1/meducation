# "Most common" recall top-ups, round 2

Shared method for the subjects still in progress. Status lives in each subject's tracker: [Pathology](pathology-quizzes.md). The other subjects in scope are done and staged.

Goal: fill the gap in direct "most common / leading / principal X" recall questions (cause, organism, site, type, complication, risk factor, route, reservoir, cause of death). "Most likely cause" vignettes do not count.

Method: follow the [write-quizzes skill](../../../.agents/skills/write-quizzes/SKILL.md), blueprint "Gap-filling top-ups". Each batch is a top-up of one staged quiz (blueprint `add` with notes), not a new quiz. One topic per session. Never publish.

Coverage approved 2026-11-20: up to 5 items per quiz (highest-yield MISSING rows; fewer where the list is thin). Within a subject, topics by MISSING count, most first.

## Files (gitignored, in the subject's work dir `var/quiz-work/<subject-slug>/`)

- `most-common-gaps.md`: the gap list. Statuses come from keyword search and expected keys are unverified prompts: re-search a MISSING row before writing, and confirm CLUED and STAGED calls before striking or writing. It ends with "Done topics: unverified and skipped": add each staged topic's weak-source facts and skipped points there and check it before writing a neighboring topic.
- `notes.md` for subagents and `replace-backlog.json` (`Q backlog`).

Count the stems that match the required form before review.

## Running sessions in parallel

- A session writes only its own work dir and tracker. The source ledger is locked by `Q ledger`; re-read a skill or `.agents/shared/` file right before a lessons edit.
- Check near-duplicates within the subject only (`stems.txt`). A point another subject also tests is still written if it is in this subject's scope.

## Finishing a subject

1. Top up topic by topic.
2. Replacement batch from the backlog ([replacements.md](../../../.agents/skills/write-quizzes/replacements.md)), then `Q clean`, the lessons pass and delete the subject's tracker. Remove the subject from the tracker list above.
3. The session that deletes the last subject tracker deletes this file. The user reviews and publishes.

# "Most common" recall top-ups, round 2

Shared method for all subjects. Status lives in each subject's tracker: [Microbiology & Parasitology](microbiology-parasitology-quizzes.md), [Pediatrics](pediatrics-quizzes.md), [Pathology](pathology-quizzes.md), [Surgery](surgery-quizzes.md), [OB-GYN](obstetrics-gynecology-quizzes.md), [Anatomy & Histology](anatomy-histology-quizzes.md). Sessions don't edit this file while others run.

Goal: fill the gap in direct "most common / leading / principal X" recall questions (cause, organism, site, type, complication, risk factor, route, reservoir, cause of death). "Most likely cause" vignettes do not count. Measured on the draft 2026-11-20 (non-vignette stems with ranking wording): Surgery 0.8%, Pathology 0.4%, Pediatrics 0.4%, Anatomy & Histology 0.4%, OB-GYN 0.2%, Microbiology & Parasitology 0.1%.

Scope: the six subjects above. Internal Medicine, Pharmacology and Preventive Medicine were done in round 1. Legal Medicine, Biochemistry and Physiology are out of scope.

Method: follow the [write-quizzes skill](../../../.agents/skills/write-quizzes/SKILL.md), blueprint "Gap-filling top-ups". Each batch is a top-up of one staged quiz (blueprint `add` with notes), not a new quiz. One topic per session. Never publish.

Coverage approved 2026-11-20: up to 5 items per quiz (highest-yield MISSING rows; fewer where the list is thin). Within a subject, topics by MISSING count, most first.

## Files (gitignored, in the subject's work dir `var/quiz-work/<subject-slug>/`)

- `most-common-gaps.md`: the gap list. Statuses come from keyword search and expected keys are unverified prompts: re-search a MISSING row before writing, and confirm CLUED and STAGED calls before striking or writing. It ends with "Done topics: unverified and skipped": add each staged topic's weak-source facts and skipped points there and check it before writing a neighboring topic.
- `cross-subject-stems.txt`: rebuild it at the start of each session by running `draft-outline` for all 12 subjects into the scratchpad and combining the stems. Line format `Subject › Topic › Quiz |  | stem`; the outline's `subject` is an object, use its `name`. Topic notes point writers to it.
- `notes.md` for subagents and `replace-backlog.json` (`Q backlog`).

Count the stems that match the required form before review.

## Running subjects in parallel

- One session per subject at a time. A session writes only its own work dir and tracker, never another subject's gap list, notes or tracker. The source ledger is locked by `Q ledger`; re-read a skill or `.agents/shared/` file right before a lessons edit.
- A point listed under a gap list's "Belongs elsewhere" belongs to that subject. Microbiology & Parasitology left HPV 16 to OB-GYN, NPC, Kaposi and ATLL to Pathology, and roseola, measles, HFMD and RSV to Pediatrics.
- Any other point shared by two subjects goes to whichever stages it first. Rebuild `cross-subject-stems.txt` again right before the blind solve and drop items that now duplicate a stem another session staged. Overlap is likeliest between Pediatrics and Pathology › Infancy and Childhood or Surgery › Pediatric Surgery, and between Pathology › Female Genital Tract and OB-GYN › Gynecologic Oncology.

## Finishing a subject

1. Top up topic by topic.
2. Replacement batch from the backlog ([replacements.md](../../../.agents/skills/write-quizzes/replacements.md)), then `Q clean` (it deletes the gap list and stems file too), the lessons pass and delete the subject's tracker.
3. The session that deletes the last subject tracker deletes this file. The user reviews and publishes.

# "Most common" recall top-ups, round 2

Goal: fill the gap in direct "most common / leading / principal X" recall questions (cause, organism, site, type, complication, risk factor, route, reservoir, cause of death). "Most likely cause" vignettes do not count. Measured on the draft 2026-11-20 (non-vignette stems with ranking wording): Surgery 0.8%, Pathology 0.4%, Pediatrics 0.4%, Anatomy & Histology 0.4%, OB-GYN 0.2%, Microbiology & Parasitology 0.1%.

Scope: Pathology, Microbiology & Parasitology, Obstetrics & Gynecology, Pediatrics, Surgery, Anatomy & Histology. Internal Medicine, Pharmacology and Preventive Medicine were done in round 1. Legal Medicine, Biochemistry and Physiology are out of scope.

Method: follow the [write-quizzes skill](../../../.agents/skills/write-quizzes/SKILL.md), blueprint "Gap-filling top-ups". Each batch is a top-up of one staged quiz (blueprint `add` with notes), not a new quiz. One topic per session. Never publish.

## Files (gitignored, `var/quiz-work/`)

- Gap lists: `most-common-gaps/<subject-slug>.md`, built by subagents from `most-common-gaps/BRIEF.md`. Statuses come from keyword search and expected keys are unverified prompts: re-search a MISSING row before writing. Each file ends with "Done topics: unverified and skipped": add each staged topic's weak-source facts and skipped points there and check it before writing a neighboring topic. Pathology's file shows at most 4 MISSING rows per quiz and omits STAGED rows; the cut MISSING rows are in `most-common-gaps/pathology-extra/`. Surgery's file keeps about 5 rows per quiz.
- Work dirs: `<subject-slug>/` with `notes.md` for subagents and `replace-backlog.json` (`Q backlog`).
- Cross-subject stems: `cross-subject-stems.txt`. Rebuild each session by running `draft-outline` for all 12 subjects into the scratchpad and combining the stems. Line format `Subject › Topic › Quiz |  | stem`; the outline's `subject` is an object, use its `name`. Topic notes point writers to it.

Count the stems that match the required form before review.

## Status

- Gap lists: done 2026-11-20. MISSING rows: Pathology 431 (file shows up to 4 per quiz), Surgery 265, Pediatrics 143, Microbiology & Parasitology 134, Anatomy & Histology 93, OB-GYN 45. CLUED and STAGED calls rest on keyword grep: confirm before striking or writing.
- Coverage approved 2026-11-20: up to 5 items per quiz (highest-yield MISSING rows; fewer where the list is thin). Subject order: Microbiology & Parasitology, Pediatrics, Pathology, Surgery, OB-GYN, Anatomy & Histology. Within a subject, topics by MISSING count, most first.
- Next: Microbiology & Parasitology › Virology.

## Staged (not published)

(none yet)

## Remaining

1. Finish gap lists; user approves coverage.
2. Top up topic by topic, one per session.
3. Replacement batch per work dir's backlog ([replacements.md](../../../.agents/skills/write-quizzes/replacements.md)), then `Q clean`.
4. User reviews and publishes. Then delete this tracker and `var/quiz-work/cross-subject-stems.txt`.

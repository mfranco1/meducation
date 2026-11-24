# Flashcard audit

Goal: audit the 20,121 pre-skill flashcards for accuracy, currency, clarity and relevance, then top up thin topics. Follow the [write-flashcards skill](../../../.agents/skills/write-flashcards/SKILL.md). Never publish.

This file holds the rules for every subject and each subject's phase. Topic status, staged counts, the Unverified list and Top-ups live in the subject's tracker.

## Phases

Each subject moves through three phases, in order. A session works on one subject in its current phase.

1. **Audit**: `audit: true` decks, one Sonnet reviewer per deck. Start: "Audit the `<Subject>` flashcards: read `docs/work/ongoing/flashcard-audit.md`, then the subject's tracker, and do the next topic."
2. **Top-up**: write the cards listed in the tracker's Top-ups. Rerun `D coverage` for THIN topics, SMALL decks and subtopic counts; its counts are heuristic (false zeros and false lows are common), so confirm with a grep of `fronts.txt` before planning. Top-ups need a plan the user approves ([plan.md](../../../.agents/skills/write-flashcards/plan.md)). Start: "Top up the `<Subject>` flashcards: read `docs/work/ongoing/flashcard-audit.md`, then the subject's tracker, and do the next step."
3. **Publish check**: read each staged `sources` (the gate can't match narrative reviews or single-hospital protocols) and settle the Unverified list. Then the user reviews and publishes.

Moving a subject to the next phase:

- When the last topic of a phase is staged, the session moves the subject's row to the next phase's table below and sets the tracker's Status to the new phase. Re-read this file right before the edit and change only that row.
- After the audit phase, don't run `D clean` or delete the tracker: Top-ups and Unverified carry into the next phases. Run `D clean` and delete the tracker only after the publish check, once the user has published.

## Parallel sessions

- One session per subject at a time; sessions for different subjects run at the same time. Within a subject, one topic per session.
- A session writes its subject's tracker, its work dir `var/flashcard-work/<slug>/`, and in this file only its subject's row at a phase change.
- At session start, set `In progress: <Topic>` in the subject tracker. If a topic is already in progress, stop and ask the user. Clear it when the topic is staged.
- A subject with no `plan.json` yet: refresh the outline, write an audit-only `plan.json` with every topic (a plain audit is its own approval), write `notes.md` where the subject needs one, fill in the tracker's header and Status, move the subject's row to Audit, then audit the first topic.
- Shared state is safe across sessions: `D ledger` merges under a file lock, and staging serializes on the draft lock and checks each card's version. If staging times out on the lock while another session stages, handle it as a partial failure (SKILL.md, step 5) and rerun.
- Each session keeps the skill's limit of 3 subagents at a time.
- Lessons that change shared skill files: re-read the file right before editing, make a narrow edit, and don't undo lines another session wrote. Run both skills' tests and the shared tests after a change to `.agents/shared/`.
- Fix only your own subject's cards. Note a problem in another subject in your report to the user, not in that subject's tracker. Run no cross-subject pass (math, sources, retired terms) while subject sessions are active: it makes their review inputs stale.

## Decisions

- Start subjects by risk: Preventive Medicine, Legal Medicine, Surgery, Microbiology & Parasitology, Pathology. Anatomy & Histology, Biochemistry and Physiology last, possibly a lighter pass.
- Delete the reviewers' trivia and duplicate cards on your own judgment; keep classic exam facts and cards relevant in the Philippines. Ask only about fixes that rest on judgment, not a source. Add coverage gaps to the subject's Top-ups.
- Reviewers skip web checks on facts they feel sure of and misreport card counts. Send back any reviewer that leaves a guideline-dependent fact on an existing card unchecked, naming the facts.

## Subjects

Tracker for each subject: `<slug>-flashcards.md` in this folder.

### Publish check

None yet.

### Top-up

| Subject | Topics |
| --- | --- |
| [Internal Medicine](internal-medicine-flashcards.md) | 19 |
| [Pharmacology](pharmacology-flashcards.md) | 15 |
| [Pediatrics](pediatrics-flashcards.md) | 14 |
| [Obstetrics & Gynecology](obstetrics-gynecology-flashcards.md) | 7 |
| [Preventive Medicine](preventive-medicine-flashcards.md) | 10 |

### Audit

| Subject | Topics |
| --- | --- |
| [Pathology](pathology-flashcards.md) | 27 |
| [Biochemistry](biochemistry-flashcards.md) | 21 |

### Not started

| Subject | Topics |
| --- | --- |
| [Legal Medicine](legal-medicine-flashcards.md) | 7 |
| [Surgery](surgery-flashcards.md) | 26 |
| [Microbiology & Parasitology](microbiology-parasitology-flashcards.md) | 9 |
| [Anatomy & Histology](anatomy-histology-flashcards.md) | 14 |
| [Physiology](physiology-flashcards.md) | 11 |

## Cross-subject passes (staged, not published)

- Math pass: 67 edits converting `\(...\)` and `\[...\]` to `$...$` and `$$...$$` (45 Preventive Medicine, 8 Pharmacology, 7 Surgery, 4 Pathology, 2 Pediatrics, 1 OB-GYN).
- Source passes (backfill, re-source of non-citable and narrative-review citations, full check of weak cards): 95 edits, 2 deletes.

## Subject tracker template

```md
# <Subject> flashcards

Subject `<Subject>`, work dir `var/flashcard-work/<slug>/`, audit-only `plan.json` with <n> topics. Rules: [flashcard-audit](flashcard-audit.md).

## Status

Phase: Audit. In progress: none. Done: <topics>. Next: <topic>.

## Carried over

## Staged (not published)

## Unverified (check before publishing)

## Top-ups
```

- Status: the phase, the topic in progress, and the next step. List done topics only in the current phase.
- Carried over: notes from earlier topics or passes that a later topic must act on. Delete an entry once handled.
- Staged: counts per topic and the few changes worth a second look. Per-card reasons are in the draft change history.

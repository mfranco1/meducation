# Flashcard audit

Goal: audit the 20,121 pre-skill flashcards for accuracy, currency, clarity and relevance, then top up thin topics. Follow the [write-flashcards skill](../../../.agents/skills/write-flashcards/SKILL.md): `audit: true` decks, one Sonnet reviewer per deck. Never publish.

This file holds the rules for every subject. Each subject's status, staged counts, Unverified list and top-ups live in its own tracker (see Subjects).

## Parallel sessions

- One session per subject at a time; sessions for different subjects run at the same time. Within a subject, one topic per session.
- Start a session with: "Audit the `<Subject>` flashcards: read `docs/work/ongoing/flashcard-audit.md`, then the subject's tracker, and do the next topic."
- A session writes only its subject's tracker and work dir `var/flashcard-work/<slug>/`. Don't edit this file during parallel work; the user does.
- At session start, set `In progress: <Topic>` in the subject tracker. If a topic is already in progress, stop and ask the user. Clear it when the topic is staged.
- A subject without a tracker: refresh the outline, write an audit-only `plan.json` with every topic (a plain audit is its own approval), write `notes.md` where the subject needs one, create the tracker from the template below, then audit the first topic.
- Shared state is safe across sessions: `D ledger` merges under a file lock, and staging serializes on the draft lock and checks each card's version. If staging times out on the lock while another session stages, handle it as a partial failure (SKILL.md, step 5) and rerun.
- Each session keeps the skill's limit of 3 subagents at a time.
- Lessons that change shared skill files: re-read the file right before editing, make a narrow edit, and don't undo lines another session wrote. Run both skills' tests and the shared tests after a change to `.agents/shared/`.
- Fix only your own subject's cards. Note a problem in another subject in your report to the user, not in that subject's tracker. Run no cross-subject pass (math, sources, retired terms) while subject sessions are active: it makes their review inputs stale.

## Decisions

- Start subjects by risk: Preventive Medicine, Legal Medicine, Surgery, Microbiology & Parasitology, Pathology. Anatomy & Histology, Biochemistry and Physiology last, possibly a lighter pass.
- Delete the reviewers' trivia and duplicate cards on your own judgment; keep classic exam facts and cards relevant in the Philippines. Ask only about fixes that rest on judgment, not a source. Add coverage gaps to the subject's Top-ups.
- Reviewers skip web checks on facts they feel sure of and misreport card counts. Send back any reviewer that leaves a guideline-dependent fact on an existing card unchecked, naming the facts.
- Before publishing: read each staged `sources` (the gate can't match narrative reviews or single-hospital protocols) and settle each subject's Unverified list.
- Top-ups come after a subject's audit. Rerun `D coverage` for THIN topics, SMALL decks and subtopic counts; its counts are heuristic (false zeros and false lows are common), so confirm with a grep of `fronts.txt` before writing.

## Subjects

| Subject | Tracker | Topics |
| --- | --- | --- |
| Internal Medicine | [internal-medicine-flashcards.md](internal-medicine-flashcards.md) | 19, audited |
| Pharmacology | [pharmacology-flashcards.md](pharmacology-flashcards.md) | 15, audited |
| Pediatrics | [pediatrics-flashcards.md](pediatrics-flashcards.md) | 14, audited |
| Obstetrics & Gynecology | [obstetrics-gynecology-flashcards.md](obstetrics-gynecology-flashcards.md) | 7, audited |
| Preventive Medicine | [preventive-medicine-flashcards.md](preventive-medicine-flashcards.md) | 10 |
| Legal Medicine | `legal-medicine-flashcards.md` (not started) | 7 |
| Surgery | `surgery-flashcards.md` (not started) | 26 |
| Microbiology & Parasitology | [microbiology-parasitology-flashcards.md](microbiology-parasitology-flashcards.md) | 9 |
| Pathology | [pathology-flashcards.md](pathology-flashcards.md) | 27 |
| Anatomy & Histology | `anatomy-histology-flashcards.md` (not started) | 14 |
| Biochemistry | [biochemistry-flashcards.md](biochemistry-flashcards.md) | 21 |
| Physiology | `physiology-flashcards.md` (not started) | 11 |

## Cross-subject passes (staged, not published)

- Math pass: 67 edits converting `\(...\)` and `\[...\]` to `$...$` and `$$...$$` (45 Preventive Medicine, 8 Pharmacology, 7 Surgery, 4 Pathology, 2 Pediatrics, 1 OB-GYN).
- Source passes (backfill, re-source of non-citable and narrative-review citations, full check of weak cards): 95 edits, 2 deletes.

## Subject tracker template

```md
# <Subject> flashcards

Subject `<Subject>`, work dir `var/flashcard-work/<slug>/`, audit-only `plan.json` with <n> topics. Rules: [flashcard-audit](flashcard-audit.md).

## Status

In progress: none. Done: <topics>. Next: <topic>.

## Staged (not published)

## Unverified (check before publishing)

## Top-ups
```

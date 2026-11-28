# Source citation cleanup

## Scope

Bring every `rationaleMeta.sources` and card `sources` value to the form in [content-standards.md](../../../.agents/shared/content-standards.md#citations), remove barred and weak sources, confirm every cited document exists, replace superseded editions, and correct the items already found to disagree with their source. Out of scope: a support check of citations (a sample-first check follows in [citation-support-check](citation-support-check.md)), and adding sources to items that have none.

Only the sources field changes, except in Phases 9 to 11, which correct an item whose fact changed in the newer edition or disagrees with its source. Otherwise never touch stems, choices, keys, rationales or card faces here. Never publish: stage in the draft under actor `agent:source-cleanup`; the user reviews and publishes. The user commits.

## How each session works

One session does one unchecked box, then updates Status and stops. Orchestrate in the main session; give batches of about 25 strings to Sonnet subagents that return only a map file.

1. Follow [audit-sources](../../../.agents/skills/audit-sources/SKILL.md), including its Pitfalls: `A summary`, then `A list <class or flag> [Subject]` for the box. Stage with `--actor agent:source-cleanup`.
2. Write the map to `var/source-audit/maps/<box>.json`. A `"KEEP: <reason>"` value is the record of why a string stays.
3. `A apply` the map (dry run first), rerun `A summary` and confirm the count moved as expected.
4. Update Status (next box and counts only). Put what a later box or the user needs in `var/source-audit/notes.md`: kept strings that need a decision, leads for Phases 7 and 8, and items for a later content audit. The maps hold the rest.

Add a command to `source_audit.py` when a phase first needs it, with a test on a small synthetic fixture. `var/source-audit/` (not in git) holds only this run's maps and outputs.

## Decisions

- Forms (laws, cases, labels, PDQ, NICE, web pages, chapters) are in [content-standards.md](../../../.agents/shared/content-standards.md#citations). No URLs in any citation.
- Summary pages (WHO fact sheets, CDC clinical overview and clinical care pages, Yellow Book chapters, pocket guides): keep them for epidemiology and descriptive facts. Replace them where the item tests a dose, threshold, regimen or criterion.
- A program or agency name that is not a document is dropped, even when the item is left without a source.
- A page updated in place (CDC, WHO fact sheets, PDQ) takes the year of the date it prints, whether that date says updated or reviewed. A page that prints no date keeps the year it was read.
- A drug label takes the labeler DailyMed lists, not the parent company. A generic whose cited labeler has no such label takes the FDA-as-author form.


## Done

Everything is staged, unpublished. Maps are in `var/source-audit/maps/`.

- Phases 0 to 5: tooling, barred sources, classes `L`, `Lg`, `I` and `M`, and one wording per document.
- Phase 6: URLs and program names removed; summary pages replaced by the guideline behind the tested point where the item tests a dose, threshold, regimen or criterion (250 items staged; `phase6-replace.json` holds the list).
- Phase 7: strings flagged `pre2010` and `2010-15` checked for a newer edition from the same body. Flag only: the list is `superseded.json`, verdicts per string in `maps/phase7-*-verdicts.json`.
- Phase 8: every string has an existence verdict in `existence.json` (`A check`, then manual reads with the brief in `maps/phase8-brief.md`); mismatches fixed through maps `phase8-fix-a` to `-d`. The user settled the `not found` and unsettled strings on 2026-11-27 (`phase8-for-user.md`).

## Phase 9: superseded editions corrected

Work through `var/source-audit/superseded-by-subject.md` (108 citations, 307 items), one citation at a time, in the first box whose subject holds it. Read the newer edition in full text for the point each item tests, then:

- The newer edition states the same point: swap the citation through a map.
- The point changed: correct the item (key, rationale, card face) under the audit rules of [write-quizzes](../../../.agents/skills/write-quizzes/SKILL.md) or [write-flashcards](../../../.agents/skills/write-flashcards/SKILL.md), cite the newer edition, and list the item with old and new wording in `var/source-audit/phase9-changed.md` for the user's review. A key never changes silently: the rationale says why.
- The newer edition does not cover the point (a partial replacement), or could not be read: keep the citation and record the reason as the entry's `verdict` in `superseded.json`.
- An amended law: cite the provision as amended. Legal Medicine tests current law only.

Record a `verdict` on every entry. Entries marked unconfirmed or "not recorded" need the newer document found first.

- [x] Pediatrics, first 15 citations
- [x] Pediatrics, the rest (29 citations, 63 items in all)
- [x] Preventive Medicine, first 12 citations
- [x] Preventive Medicine, the rest (24 citations, 72 items in all)
- [x] Surgery (14 citations, 45 items)
- [x] Internal Medicine (13 citations, 39 items)
- [ ] Microbiology & Parasitology and Obstetrics & Gynecology (23 citations, 44 items)
- [ ] Legal Medicine (10 citations, 20 items)
- [ ] Biochemistry, Pharmacology, Physiology, Anatomy & Histology, Pathology (17 citations, 25 items)

## Phase 10: strings dated 2016 or later (size the correction boxes after the flag boxes)

No string without a `pre2010` or `2010-15` flag was checked in Phase 7: 2,785 strings. Leave out drug labels and court cases (about 440). Flag as in Phase 7, adding to `superseded.json` and writing verdicts to `maps/phase10-<box>-verdicts.json`; a trial, cohort or other primary study gets `not an edition` without a search. Add a `source_audit.py` list for these strings by year band in the first box. Batches of 25 to Sonnet subagents, about 150 strings a box. Then correct the flagged ones under the Phase 9 rules.

- [ ] Flag: no year or before 2016, unflagged (about 185 strings, 1 box)
- [ ] Flag: 2016 to 2020 (about 755 strings, 5 boxes; tick when all are done and note the position reached in Status)
- [ ] Flag: 2021 to 2024 (about 825 strings, 6 boxes)
- [ ] Flag: 2025 and 2026 (about 580 strings, 4 boxes)
- [ ] Correct the flagged citations, by subject (boxes added here after flagging)

## Phase 11: content audit list

The items under "Content audit list" in `notes.md` (about 150): the source disagrees with the item or supports it only in part. For each, read the source for the tested point and correct the item under the `write-quizzes` or `write-flashcards` audit rules, or correct the citation where the item is right. Log every changed item with old and new wording in `phase9-changed.md`. Ask the user only where the fix is a judgment call (two bodies differ, or the key itself is in doubt).

- [ ] No source left, draft or replaced documents, single-item entries, figures not in the source, partial support (the list's first eight bullets)
- [ ] From Phase 6: guideline details, CDC pages 28 to 54
- [ ] From Phase 6: CDC pages 55 to 79, Yellow Book and other bodies
- [ ] From Phase 6: WHO Pocket Book and fact sheets, card faces, news releases cited as sources

## Phase 12: close

- [ ] Rerun the audit: classes `L`, `M`, `Lg`, `I` and flags `refsite`, `narrative` at zero or explained. Report to the user the final counts, `phase9-changed.md` and the kept strings in `notes.md`.
- [ ] Bring `audit-sources/SKILL.md` in line with what the phases taught, check its tests pass, then delete `var/source-audit/` and this tracker.

## Status

Next: Phase 9, Microbiology & Parasitology and Obstetrics & Gynecology (23 citations, 44 items). Move the two Phase 8 rules in Decisions into `content-standards.md` when the skill is brought in line.

- Counts (2026-11-28): 8,135 questions and 2,359 cards have sources. `P` 11,697 citations in 3,324 strings, `L` 1 (kept), `Lg` 0, `I` 0, `M` 0. Flags: `refsite` 0, `summarypage` 78 strings (161 citations), `pre2010` 177, `2010-15` 326, `narrative` 2 (kept).
- Phase 9 so far: 76 of 108 citations have a verdict (a few cover only the subjects done; see "Phase 9" in `notes.md`). 76 items re-cited, 23 of them corrected (one key change, i21671), and 9 dengue items now give the WHO 2025 critical-phase figures. Two editions from one body are not a user decision: the newer one wins. Open user decisions and the documents that need a manual copy are under "Phase 9" in `notes.md`. Each box: build the item file, give batches to subagents with `var/source-audit/phase9/brief.md`, check every `changed` verdict against the saved text before editing, then stage with `phase9/build.py`.
- Phase 7 done. On 2026-11-28 `superseded.json` was matched to the current strings and the newer editions seen during Phase 8 were added: 108 citations, 307 items. Verdicts go in the JSON; the by-subject file is the worklist.
- Drafts rechecked on 2026-11-28 (`maps/phase9-recheck.json`): only the IgG4-RD guideline has published (added). Still in draft: KDIGO AKI (one lead in the file to look at), LAST, RCOG Green-top 62, WHO newborn resuscitation, WHO urinary iodine. Recheck these at Phase 12.
- Phase 8 done: every current string has a verdict in `existence.json` (41 unsettled and 6 standing mismatches are kept with a reason; see "Kept strings" in `notes.md`).

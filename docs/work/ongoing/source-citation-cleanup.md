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
- [x] Microbiology & Parasitology and Obstetrics & Gynecology (23 citations, 44 items)
- [x] Legal Medicine (10 citations, 20 items)
- [x] Biochemistry, Pharmacology, Physiology, Anatomy & Histology, Pathology (17 citations, 25 items)

## Phase 10: strings dated 2016 or later

No string without a `pre2010` or `2010-15` flag was checked in Phase 7: 2,785 strings. Leave out drug labels and court cases (about 440). Flag as in Phase 7, adding to `superseded.json` and writing verdicts to `maps/phase10-<box>-verdicts.json`; a trial, cohort or other primary study gets `not an edition` without a search. `A list <band>` gives the strings (`historic`, `2016-20`, `2021-24`, `2025-26`); `phase10/build_batches.py <band> <prefix> <size>` writes the batch files without labels, cases and strings already flagged. Batches of 25 to Sonnet subagents (three run at once), about 150 strings a box. Then correct the flagged ones under the Phase 9 rules.

- [x] Flag: laws, orders, court rules and historic documents before 2016 (184 strings; 13 flagged, 62 items)
- [x] Flag: 2016 to 2020 (755 strings in 5 boxes; 119 flagged)
- [x] Flag: 2021 to 2024 (840 strings in 6 boxes; 71 flagged)
- [x] Flag: 2025 and 2026 (595 strings in 4 boxes; 21 flagged)

Correct the 224 flagged citations under the Phase 9 rules, working through `var/source-audit/phase10-by-subject.md` (numbered within each subject; item counts include the items of other subjects that cite the same string):

- [x] Surgery 1 to 14 (87 items)
- [ ] Surgery 15 to 28 (37 items)
- [ ] Surgery 29 to 42 (91 items)
- [ ] Surgery 43 to 52 (64 items)
- [ ] Obstetrics & Gynecology 1 to 14 (63 items)
- [ ] Obstetrics & Gynecology 15 to 28 (62 items)
- [ ] Obstetrics & Gynecology 29 to 43 (319 items, 240 of them on the CDC 2021 STI guidelines, where only prevention after exposure changed)
- [ ] Internal Medicine 1 to 14 (49 items)
- [ ] Internal Medicine 15 to 28 (61 items)
- [ ] Internal Medicine 29 to 42 (69 items)
- [ ] Pediatrics 1 to 14 (55 items)
- [ ] Pediatrics 15 to 30 (63 items)
- [ ] Preventive Medicine 1 to 14 (67 items)
- [ ] Preventive Medicine 15 to 24 (47 items)
- [ ] Pathology (12 citations, 55 items)
- [ ] Microbiology & Parasitology (9 citations, 56 items)
- [ ] Legal Medicine, Pharmacology, Biochemistry (12 citations, 36 items)

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

Next: Phase 10 correction, box "Surgery 15 to 28". Each box follows the Phase 9 method (see "Phase 9 done" below; `phase10/build_items.py <Subject> <first> <last> <prefix>` writes the item file and `phase10/build.py` stages a spec) and starts from the leads, judgment calls and re-date lists under "Phase 10" in `notes.md`; record a `verdict` on each `superseded.json` entry. Do not rebuild `phase10-by-subject.md` mid-phase: the numbering would shift. Move the two Phase 8 rules in Decisions into `content-standards.md` when the skill is brought in line.

- Counts (2026-11-28): 8,135 questions and 2,359 cards have sources. `P` 11,706 citations in 3,321 strings, `L` 1 (kept), `Lg` 0, `I` 0, `M` 0. Flags: `refsite` 0, `summarypage` 78 strings (161 citations), `narrative` 2 (kept). Year bands, labels and cases included: `historic` 210, `pre2010` 175, `2010-15` 317, `2016-20` 778, `2021-24` 937, `2025-26` 905.
- Phase 10 correction, Surgery 1 to 14 (2026-11-29): 29 items staged (17 re-cited, 12 corrected, 3 key changes under the WSES 2025 appendicitis edition: i43118, i43121, i43120). Three manual copies read since (hidradenitis, hemorrhoids, AJCC oropharynx): 15 more items staged, 7 corrected, no key change. 2 documents still need a manual copy (7 items wait on them). `stage-quizzes` edits can now reword a choice (`choices: {"B": "..."}`); i25755's choice is staged. Open choice edits and user decisions are under "Phase 10" in `notes.md`.
- Phase 10 flagging done (2026-11-29): 2,374 strings checked, 224 flagged (`superseded.json` entries with a "Phase 10 flag" note; verdicts per string in `maps/phase10-*-verdicts.json`). Partial updates, wordings to merge, years to re-date and weak `none` verdicts are listed per box under "Phase 10" in `notes.md`. Re-dating and merging wordings are map work for the box whose subject holds the string.
- Phase 9 done: all 108 citations have a verdict. 109 items re-cited and 32 corrected (one key change, i21671), and 9 dengue items now give the WHO 2025 critical-phase figures. Two editions from one body are not a user decision: the newer one wins. Open user decisions and the documents that need a manual copy (10, after the IgG4-RD guideline was read and i38449 corrected; their items keep the older citation until read) are under "Phase 9" in `notes.md`. Each correction box: build the item file, give batches to subagents with `var/source-audit/phase9/brief.md`, check every `changed` verdict against the saved text before editing, then stage with `phase9/build.py`.
- Phase 7 done. On 2026-11-28 `superseded.json` was matched to the current strings and the newer editions seen during Phase 8 were added: 108 citations, 307 items (324 entries with the Phase 10 flags). Verdicts go in the JSON; the by-subject file is the worklist.
- Drafts rechecked on 2026-11-28 (`maps/phase9-recheck.json`): only the IgG4-RD guideline has published (read, i38449 corrected). Still in draft: KDIGO AKI (one lead in the file to look at), LAST, RCOG Green-top 62, WHO newborn resuscitation, WHO urinary iodine. Recheck these at Phase 12, with the revised child witness rule (A.M. No. 25-03-23-SC; text not yet online).
- Phase 8 done: every current string has a verdict in `existence.json` (41 unsettled and 6 standing mismatches are kept with a reason; see "Kept strings" in `notes.md`).

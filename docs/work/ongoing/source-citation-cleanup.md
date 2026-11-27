# Source citation cleanup

## Scope

Bring every `rationaleMeta.sources` and card `sources` value to the form in [content-standards.md](../../../.agents/shared/content-standards.md#citations), remove barred and weak sources, and confirm every cited document exists. Out of scope: whether a source supports the fact it is attached to, and adding sources to items that have none.

Only the sources field changes. Never touch stems, choices, keys, rationales or card faces here. Never publish: stage in the draft under actor `agent:source-cleanup`; the user reviews and publishes. The user commits.

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


## Done

Everything is staged, unpublished. Maps are in `var/source-audit/maps/`.

- Phases 0 to 5: tooling, barred sources, classes `L`, `Lg`, `I` and `M`, and one wording per document.
- Phase 6: URLs and program names removed; summary pages replaced by the guideline behind the tested point where the item tests a dose, threshold, regimen or criterion (250 items staged; `phase6-replace.json` holds the list).

## Phase 7: superseded editions

Flag only. For each string, check whether the same body has issued a newer edition. Record `{ citation, newer edition, URL, note, item IDs }` in `var/source-audit/superseded.json` and the verdict for every string checked in `maps/phase7-<box>-verdicts.json`. Do not swap the citation: the fact may have changed, and that correction belongs to a later `write-quizzes` or `write-flashcards` audit. Give the user the list by subject at the end.

- [x] `pre2010`, strings 1 to 182
- [x] `2010-15`, 1 to 120
- [x] `2010-15`, 121 to 240
- [x] `2010-15`, 241 to 358

## Phase 8: every source is real (size after the first box)

Existence only: the document exists and its authors, title, journal or publisher and year match the citation. Record a verdict per distinct string in `var/source-audit/existence.json`: `real`, `mismatch` (which field, and the corrected citation) or `not found`. Start from the Phase 8 leads in `notes.md`.

- [x] Scripted pass (`A check`): DOI records, verified ledger entries, Crossref title search for journal articles without a DOI, openFDA for labels. 2,168 strings real, 35 mismatches with a corrected citation in `existence.json`.
- Manual passes on the 1,276 strings in `maps/phase8-left.json` (sorted by document type, then by name; box numbers are positions in that file). Find each on the publisher, PubMed, the issuing body's site, or lawphil.net and the Supreme Court E-Library for laws and cases. Search results may locate a document but the record page confirms it. Add each verdict to `existence.json`. A guideline published as a journal article takes its article authors: a society named as author is a `mismatch`. Give each subagent batch of 25 the brief in `maps/phase8-brief.md` and the leads for its strings from `notes.md`. A `form` key on a `real` verdict holds the string in standard form.
  - [x] 1 to 150: 102 real, 46 mismatch, 1 not found, 1 unsettled (147, stays in the list)
  - [x] 151 to 300: 113 real, 27 mismatch, 10 unsettled (202, 212 to 216, 241, 247, 260, 273, stay in the list)
  - [x] 301 to 450: 77 real, 70 mismatch, 1 not found, 2 unsettled (448, 449, stay in the list)
  - [x] 451 to 600: 108 real, 32 mismatch, 10 unsettled (464, 494 to 496, 501, 528, 529, 541, 574, 575, stay in the list)
  - [x] 601 to 750: 111 real, 28 mismatch, 11 unsettled (603, 608, 645, 646, 666, 680, 681, 686, 687, 726, 728, stay in the list)
  - [x] 751 to 900: 124 real, 21 mismatch, 5 unsettled (770, 775, 839, 841, 849, stay in the list)
  - [x] 901 to 1,050: 120 real, 27 mismatch, 1 not found, 2 unsettled (919, 920, stay in the list)
  - [x] 1,051 to 1,200: 139 real, 10 mismatch, 1 unsettled (1177, stays in the list)
  - [x] 1,201 to 1,276: 74 real, 1 mismatch, 1 unsettled (1221, stays in the list)
- [ ] Fix `mismatch` strings through a map. Give the user every `not found` string and the 43 unsettled strings (reasons in `notes.md`) with their item IDs; do not delete or replace those without their decision.

## Phase 9: close

- [ ] Rerun the audit: classes `L`, `M`, `Lg`, `I` and flags `refsite`, `narrative` at zero or explained. Report to the user the final counts and `notes.md` (kept strings and the content audit list).
- [ ] Bring `audit-sources/SKILL.md` in line with what the phases taught, check its tests pass, then delete `var/source-audit/` and this tracker.

## Status

Next: Phase 8, fix `mismatch` strings through a map. Read the "For the fix box" notes in `notes.md` first: many corrections need a user decision before applying.

- Counts (2026-11-27): 8,140 questions and 2,361 cards have sources. `P` 11,605 citations in 3,447 strings, `L` 89 in 30 (kept), `Lg` 2 (kept), `I` 0, `M` 0. Flags: `summarypage` 95 strings (168 citations), `pre2010` 182, `2010-15` 358, `narrative` 2 (kept).
- Phase 7 done: 87 strings (237 citations) in `superseded.json`, listed by subject in `var/source-audit/superseded-by-subject.md`.
- Phase 8 so far, of 3,479 strings: 3,136 real (1,245 by Crossref DOI record, 233 by Crossref title search, 398 by verified ledger entry, 226 by openFDA, 1,034 read by hand), 297 mismatch, 3 not found, 43 left (all unsettled).

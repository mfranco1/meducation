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

- [x] Scripted pass (`A check`): 1,715 strings real, 10 mismatches with a corrected citation in `existence.json`.
- Manual passes on the 1,754 strings in `maps/phase8-left.json` (sorted by document type, then by name; box numbers are positions in that file). Find each on the publisher, PubMed, the issuing body's site, or lawphil.net and the Supreme Court E-Library for laws and cases. Search results may locate a document but the record page confirms it. Add each verdict to `existence.json`.
  - [ ] 1 to 150 (journal articles without a DOI, to 398)
  - [ ] 151 to 300
  - [ ] 301 to 450 (chapters from 399; reports, pages and books from 447)
  - [ ] 451 to 600
  - [ ] 601 to 750
  - [ ] 751 to 900
  - [ ] 901 to 1,050
  - [ ] 1,051 to 1,200 (drug labels from 1,180)
  - [ ] 1,201 to 1,350
  - [ ] 1,351 to 1,500 (PDQ summaries from 1,473; laws and cases from 1,493)
  - [ ] 1,501 to 1,650
  - [ ] 1,651 to 1,754
- [ ] Fix `mismatch` strings through a map. Give the user every `not found` string with its item IDs; do not delete or replace those without their decision.

## Phase 9: close

- [ ] Rerun the audit: classes `L`, `M`, `Lg`, `I` and flags `refsite`, `narrative` at zero or explained. Report to the user the final counts and `notes.md` (kept strings and the content audit list).
- [ ] Bring `audit-sources/SKILL.md` in line with what the phases taught, check its tests pass, then delete `var/source-audit/` and this tracker.

## Status

Next: Phase 8, manual pass 1 to 150.

- Counts (2026-11-27): 8,140 questions and 2,361 cards have sources. `P` 11,605 citations in 3,447 strings, `L` 89 in 30 (kept), `Lg` 2 (kept), `I` 0, `M` 0. Flags: `summarypage` 95 strings (168 citations), `pre2010` 182, `2010-15` 358, `narrative` 2 (kept).
- Phase 7 done: 87 strings (237 citations) in `superseded.json`, listed by subject in `var/source-audit/superseded-by-subject.md`.
- Phase 8 so far, of 3,479 strings: 1,715 real (1,245 by Crossref record, 397 by verified ledger entry, 73 read by hand after a pattern flag), 10 mismatch, 1,754 left.

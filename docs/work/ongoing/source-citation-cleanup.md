# Source citation cleanup

## Scope

Bring every `rationaleMeta.sources` and card `sources` value to the form in [content-standards.md](../../../.agents/shared/content-standards.md#citations), remove barred and weak sources, and confirm every cited document exists. Out of scope: whether a source supports the fact it is attached to, and adding sources to items that have none.

Only the sources field changes. Never touch stems, choices, keys, rationales or card faces here. Never publish: stage in the draft under actor `agent:source-cleanup`; the user reviews and publishes. The user commits.

## Baseline (2026-11-26, draft equals active release)

8,194 of 24,193 questions and 2,368 of 22,061 cards have sources: 11,774 citations, about 5,200 distinct strings.

| Class | Citations | Distinct strings | Largest subjects (distinct) |
| --- | --- | --- | --- |
| `P` full AMA form | 7,934 | 3,533 | |
| `L` title and year only | 2,183 | 750 | Pediatrics 293, Surgery 234, Preventive Medicine 120, Biochemistry 43 |
| `M` elements present, no italics | 802 | 589 | Pharmacology 222, Internal Medicine 98 |
| `Lg` law or case, short form | 766 | 312 | Legal Medicine 214, Preventive Medicine 85 |
| `I` incomplete | 89 | 47 | |

Flags: `refsite` 21 strings, `narrative` 18, `summarypage` 279 (511 citations, the only source for about 420 items), `pre2010` 242, `2010-15` 497. 201 of 1,170 DOIs appear in more than one wording.

## How each session works

One session does one unchecked box, then updates Status and stops. Orchestrate in the main session; give batches of about 25 strings to Sonnet subagents that return only a map file.

1. Follow [audit-sources](../../../.agents/skills/audit-sources/SKILL.md): `A summary`, then `A list <class or flag> [Subject]` for the box. Stage with `--actor agent:source-cleanup`.
2. Work per distinct string, not per item. Write `var/source-audit/maps/<box>.json` as `{ "<old citation>": "<new citation>" }`. Use `null` to drop a citation and a `"KEEP: <reason>"` value to leave one alone.
3. Look each document up before fetching: `python3 -I .agents/shared/authoring.py find-sources <term>...` (the ledger has about 5,700 documents with title, year and URL), then `save-source`. Follow [verification.md](../../../.agents/shared/verification.md) and [fetch-access.md](../../../.agents/shared/fetch-access.md). Write only details read in the document or its publisher record. A citation without volume, pages or DOI is complete.
4. `A apply` the map (dry run first), rerun `A summary` and confirm the box's count dropped as expected.
5. Record in Status: box done, strings changed, strings kept or unresolved and why.

## Tools

The tools outlive this task. Keep them in the repository, tested, and built for reuse on any subject or a single batch, not for this one cleanup.

- `.agents/shared/authoring.py`: what the writing skills also need. The citation splitter and form classifier (so both batch gates and the audit share one definition), and `NON_CITABLE`.
- `.agents/skills/audit-sources/` (new, listed in `AGENTS.md`): `SKILL.md` and one script for bank-wide work on sources in both questions and cards. Commands as each phase needs them: summary and listing (Phase 0), `apply` a map (Phase 0), group wordings of one document (Phase 5), check DOIs against Crossref and the ledger (Phase 8). Add a command when a phase first needs it, with a test on a small synthetic fixture.
- `var/source-audit/` holds only this run's maps and outputs.

## Decisions

- Legal form: open, decide with the user at the start of Phase 3. Recommendation: one AMA-style form per type, such as `Republic Act No. 9165: Comprehensive Dangerous Drugs Act of 2002. Congress of the Philippines; 2002.` and `*People v Lim*, GR No. 231989 (Phil 2018).`, with the section or article kept after the citation where an item cites one. Add the chosen form to content-standards.md.
- Summary pages (WHO fact sheets, CDC clinical overview and clinical care pages, pocket guides): open, decide with the user at the start of Phase 6. Recommendation: keep them for epidemiology and descriptive facts, replace them where the item tests a dose, threshold, regimen or criterion.

## Phase 0: tooling (1 session)

- [x] Let `stage-quizzes` edit existing questions: an `edits` list of `{ id, version, rationaleMeta }`, mirroring the `edits` that `stage-flashcards` already accepts (`backend/src/meducation_api/admin/staging.py`), with stale-version refusal and a backend test. Update the bulk JSON note in `docs/content-management.md`.
- [x] Create the `audit-sources` skill (see Tools) from `var/source-audit/audit.py` and delete that file. Add an `apply` command: read a map, rebuild each affected item's full sources string (split, replace, drop duplicates, join with `; `), write per-subject stage files under `var/source-audit/` and run `J stage-quizzes` and `J stage-flashcards`. It must refuse an item whose stored string no longer matches the audit.
- [x] Gate: add MedlinePlus, Endotext, GeneReviews and *Nat Rev Dis Primers* to `NON_CITABLE` in `.agents/shared/authoring.py`, and make the batch gate in both skills warn on any citation the shared classifier does not put in class `P`. Run both skills' tests and the shared tests.
- [x] Trial the whole loop on 10 strings before Phase 1.

## Phase 1: barred sources (1 session)

- [x] Replace the `refsite` and `narrative` strings (39 strings, 42 items) with the primary guideline, classification or textbook that covers the same point. Drop the citation when the point is a stable textbook fact.
- [x] Narrative reviews the pattern missed (73 strings, 81 items, review journals read by title). Reviews with plain titles in general journals (*N Engl J Med* review articles, *Lancet* seminars) can't be found by title; Phase 8 sees each record.

## Phase 2: title and year only, class `L` (7 sessions)

Rewrite in AMA form. About 125 strings per session.

- [ ] Pediatrics, strings 1 to 100 by use
- [ ] Pediatrics, 101 to 200
- [ ] Pediatrics, 201 to 293
- [ ] Surgery, 1 to 120
- [ ] Surgery, 121 to 234
- [ ] Preventive Medicine (120)
- [ ] All other subjects (about 125)

## Phase 3: laws, cases and incomplete, classes `Lg` and `I` (3 sessions)

- [ ] Settle the legal form (Decisions), then Legal Medicine statutes and regulations
- [ ] Legal Medicine cases, plus `Lg` in Preventive Medicine and other subjects
- [ ] Class `I` (47 strings): complete each, or rejoin fragments such as `Section 30.` that the splitter cut from the citation before them

## Phase 4: italics and minor form, class `M` (2 sessions)

Format only: no fetch is needed when every element is already present.

- [ ] Pharmacology (222, mostly prescribing information: settle one label form first)
- [ ] All other subjects (367)

## Phase 5: one string per document (1 session)

- [ ] Group citations by DOI, then by normalized title and year. Pick the most complete wording that matches the publisher record and map the others to it. Start from the 201 DOIs with more than one wording.

## Phase 6: summary pages (1 to 3 sessions, after the decision)

- [ ] Decide (Decisions). List the `summarypage` strings that support a dose, threshold, regimen or criterion.
- [ ] Replace those with the underlying guideline, about 100 strings per session. Add boxes here once the list is sized.

## Phase 7: superseded editions (5 sessions)

Flag only. For each string, check whether the same body has issued a newer edition. Record `{ citation, newer edition, URL, item IDs }` in `var/source-audit/superseded.json`. Do not swap the citation: the fact may have changed, and that correction belongs to a later `write-quizzes` or `write-flashcards` audit. Give the user the list by subject at the end.

- [ ] `pre2010`, strings 1 to 120
- [ ] `pre2010`, 121 to 242
- [ ] `2010-15`, 1 to 170
- [ ] `2010-15`, 171 to 340
- [ ] `2010-15`, 341 to 497

## Phase 8: every source is real (size after the first box)

Existence only: the document exists and its authors, title, journal or publisher and year match the citation. Record a verdict per distinct string in `var/source-audit/existence.json`: `real`, `mismatch` (which field, and the corrected citation) or `not found`.

- [ ] Scripted pass. Resolve every DOI through the Crossref REST API (`api.crossref.org/works/<DOI>`) and compare first author, title and year. Mark strings that match a `verified` ledger entry as real. Report the count left over and add one box per 150 remaining strings below.
- [ ] Manual passes on the remainder: find each on the publisher, PubMed, the issuing body's site, or lawphil.net and the Supreme Court E-Library for laws and cases. Search results may locate a document but the record page confirms it.
- [ ] Fix `mismatch` strings through a map. Give the user every `not found` string with its item IDs; do not delete or replace those without their decision.

## Phase 9: close

- [ ] Rerun the audit: classes `L`, `M`, `Lg`, `I` and flags `refsite`, `narrative` at zero or explained. Report final counts to the user.
- [ ] Bring `audit-sources/SKILL.md` in line with what the phases taught (routes, pitfalls, batch sizes), check its tests pass, then delete `var/source-audit/` and this tracker.

## Status

Phases 0 and 1 done (2026-11-26). Next: Phase 2, Pediatrics 1 to 100.

- Phase 1, first box: 39 strings. 10 replaced, 27 dropped, 2 kept (Kalish 2024 is the AACR working group guideline; Jiang 2013 is a PRISMA systematic review). 35 questions and 5 cards staged. `refsite` is at 0. Maps in `var/source-audit/maps/phase1*.json`.
- Phase 1, second box: 73 strings. 14 replaced, 55 dropped, 4 split per item (4 of their 9 items replaced). 68 questions and 13 cards staged, unpublished; 39 questions and 4 cards lost their only source. Maps in `var/source-audit/maps/phase1-narr*.json`.
- Dropped for lack of a readable primary document, with the lead to try again: Cushing causes (Nieman 2008, OUP blocked), hypercalcemia causes (Endocrine Society 2023 read in part, does not rank PTHrP), SCA3 (Ruano 2014, abstract only), NF2 (Plotkin 2022, blocked), neonatal meningitis (Okike 2014, Gaschignard 2011, abstract only), asplenia (BSH 2024, blocked), ARDS survivors (Herridge 2003, blocked), atypical femur fracture i43470 (ASBMR 2014, Wiley blocked), acne i36358 and i36360 (AAD 2024, jaad.org blocked), DIC cause i44621 (JSTH 2024, no full text), malignant effusion i44554 (ATS 2018 and BTS 2023 blocked), AV graft stenosis i44483 (KDOQI 2019 blocked), LCNEC i42631 (WHO Thoracic 5th ed), asthma exacerbation in pregnancy i43886 (ACOG PB 90 not read), hypothyroidism cause i44384 (ATA 2012 blocked), PNH card (BSH, Wiley blocked).
- Rankings searched with no primary document that states the order (now uncited): hookworm species i44945, enterococcal species i44961, anicteric leptospirosis i44971 (WHO 2003 and the 2010 Philippine guideline give no proportion), GCA headache i44867, spinal TB i45355, stone composition i44490, SLE pericarditis i44861, OA risk factor i44841, cirrhosis cause in the Philippines i43949, VWD type 1 share i44619, TB as leading exudate cause i44553, pancreatic head i44000. Also uncited: hypercyanotic spell items i23037, i23047, i23038, calciphylaxis i43066, pectus bracing i43223 and its card, MS relapse in pregnancy i43903.
- For a later content audit (the replacement or remaining source disagrees with the item, or supports it only in part): i44380 keys infection as the top thyroid storm precipitant, JTA/JES 2016 ranks it second after stopping antithyroid drugs; i41295 links lichen sclerosus to differentiated PeIN, EAU-ASCO 2026 says it is not associated; i44486 membranous nephropathy ranking is region-dependent; i45540 and i45541 name MedlinePlus Genetics in the rationale; i45298 gives 60 to 80%, not in Fleseriu 2021; i44864 arthritis 75% rests on a CDC summary page; i45327 says warm AIHA is 70 to 80%, BSH 2017 says 65%; i45333 and i44618 say VWD affects about 1%, ASH 2021 gives 1 in 100 to 1 in 10,000; i44928 gives *E. coli* 25 to 33%, BSG 2021 lists it first without a figure; i44949 cites "a 2024 review" for 85%, Clark 2024 gives 50 to 88.2%; card f-0c29a602 names "Zhai 2016 review" on its back, now cited to Aggarwal 2019; card f-39765d83 says "0.9%" and "until volume is restored", not in Endocrine Society 2023; card f-9ef97ef9: Lucas 2014 read in part, supports HIVAN in untreated HIV only; i43885: GINA 2026 supports continuing ICS and reports omalizumab registry safety but does not say "continue omalizumab"; i45328: NHLBI 2014 supports pain as the most common complication and admission reason, not the emergency department wording; i42940 says ΔP "30 mm Hg or less", ACS TQIP 2015 says less than 30 (AAOS updated its compartment syndrome guideline in November 2025, not read); i36357: NICE NG198 has no 3 to 4 month limit.
- Phase 0 trial: 14 strings, 245 questions staged. The actor `agent:source-cleanup` also has 281 changes from 2026-11-20, before this tracker.
- Counts now: `L` 1,954 citations and 733 strings, `P` 8,095, `M` 791, `Lg` 767, `I` 87. Box sizes in Phase 2 are a little smaller than listed. The 2 strings under `narrative` are the kept ones.
- Pitfall: a listed string can still hold two documents (about 5 remain, such as `Jeffrey Modell Foundation 10 Warning Signs ...; 2025 Inborn Errors ...`). Never map those; stage the items by hand. Do the same when the items under one string need different documents (`"KEEP: per-item"` in the map, then an `edits` file through `J stage-quizzes`).
- Pitfall: a trailing fragment the splitter cut off (`updated 2026.`) stays behind when its citation is dropped. Check the items' full sources and map the fragment to `null` too.
- Crossref (`api.crossref.org/works/<DOI>`, or `?query.bibliographic=<title>`) gives the publisher record for journal articles without a fetch. Title search often returns comments and corrigenda first: confirm the DOI's own record.
- A replacement needs the tested point read in full text. Many "most common" keys have no guideline that ranks them: allow about 15 minutes per string, then drop.
- Subagent briefs: name the likely guideline per string and require the supporting sentence quoted for each replacement and a search before any ranking is dropped. Without that, first passes dropped nearly everything unsearched and needed a second pass. Give each batch the items' stems, keys and full sources.

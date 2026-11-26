# Source citation cleanup

## Scope

Bring every `rationaleMeta.sources` and card `sources` value to the form in [content-standards.md](../../../.agents/shared/content-standards.md#citations), remove barred and weak sources, and confirm every cited document exists. Out of scope: whether a source supports the fact it is attached to, and adding sources to items that have none.

Only the sources field changes. Never touch stems, choices, keys, rationales or card faces here. Never publish: stage in the draft under actor `agent:source-cleanup`; the user reviews and publishes. The user commits.

## How each session works

One session does one unchecked box, then updates Status and stops. Orchestrate in the main session; give batches of about 25 strings to Sonnet subagents that return only a map file.

1. Follow [audit-sources](../../../.agents/skills/audit-sources/SKILL.md), including its Pitfalls: `A summary`, then `A list <class or flag> [Subject]` for the box. Stage with `--actor agent:source-cleanup`.
2. Write the map to `var/source-audit/maps/<box>.json`. A `"KEEP: <reason>"` value is the record of why a string stays.
3. `A apply` the map (dry run first), rerun `A summary` and confirm the count moved as expected.
4. Record in Status only what a later box or the user needs: counts, kept strings that need a decision, leads for Phases 7 and 8, and items for a later content audit. The maps and git history hold the rest.

Add a command to `source_audit.py` when a phase first needs it, with a test on a small synthetic fixture. `var/source-audit/` (not in git) holds only this run's maps and outputs.

## Decisions

- Forms (laws, cases, labels, PDQ, NICE, web pages, chapters) are in [content-standards.md](../../../.agents/shared/content-standards.md#citations). No URLs in any citation.
- Summary pages (WHO fact sheets, CDC clinical overview and clinical care pages, Yellow Book chapters, pocket guides): keep them for epidemiology and descriptive facts. Replace them where the item tests a dose, threshold, regimen or criterion.
- A program or agency name that is not a document is dropped, even when the item is left without a source.

## Done

Phases 0 to 5 (2026-11-26): tooling, barred sources, classes `L`, `Lg`, `I` and `M`, and one wording per document. Maps are in `var/source-audit/maps/phase0*` to `phase5*`. Everything is staged, unpublished.

## Phase 6: summary pages (6 sessions)

`var/source-audit/phase6-replace.json` lists each summary-page string with the items to `replace` (`tests`, the tested `point`, and `covered` when the item already cites a guideline for it) and the items to `keep`. Work from it in file order (grouped CDC, CDC Yellow Book, WHO, other).

For each string, find the guideline or official issuance behind the tested point (IDSA, ACIP or *MMWR*, a WHO guideline, a DOH order) and read the point in it. Stage per item with an `edits` file, since most strings also have items that keep the page: a `covered` item only loses the page; the others take the guideline in its place. When the page is the body's only statement of the point, keep it with that reason.

- [x] List the strings and items (see Status)
- [x] CDC pages, strings 1 to 27 of the 79 with items to replace
- [x] CDC pages, 28 to 54
- [ ] CDC pages, 55 to 79
- [ ] CDC Yellow Book chapters (6 strings) and other bodies (4 strings)
- [ ] WHO, the *Pocket Book of Hospital Care for Children* and fact sheets A to L
- [ ] WHO, fact sheets M to Z

## Phase 7: superseded editions (5 sessions)

Flag only. For each string, check whether the same body has issued a newer edition. Record `{ citation, newer edition, URL, item IDs }` in `var/source-audit/superseded.json`. Do not swap the citation: the fact may have changed, and that correction belongs to a later `write-quizzes` or `write-flashcards` audit. Give the user the list by subject at the end.

- [ ] `pre2010`, strings 1 to 90
- [ ] `pre2010`, 91 to 175
- [ ] `2010-15`, 1 to 120
- [ ] `2010-15`, 121 to 240
- [ ] `2010-15`, 241 to 354

Already known: Fanconi anemia guidelines 4th ed. 2014 (5th ed. 2020); AAOS carpal tunnel 2016 (2024); ESVS mesenteric 2017 (2025); WHO TB Module 3, 3rd ed. 2024 (2026) and Module 4 2025 (2nd ed. 2026); Yellow Book 2024 travelers' diarrhea (2026); IHR 3rd ed. 2016 (2022 and 2024 amendments).

## Phase 8: every source is real (size after the first box)

Existence only: the document exists and its authors, title, journal or publisher and year match the citation. Record a verdict per distinct string in `var/source-audit/existence.json`: `real`, `mismatch` (which field, and the corrected citation) or `not found`.

- [ ] Scripted pass. Resolve every DOI through the Crossref REST API and compare first author, title and year. Mark strings that match a `verified` ledger entry as real. Report the count left over and add one box per 150 remaining strings below.
- [ ] Manual passes on the remainder: find each on the publisher, PubMed, the issuing body's site, or lawphil.net and the Supreme Court E-Library for laws and cases. Search results may locate a document but the record page confirms it.
- [ ] Fix `mismatch` strings through a map. Give the user every `not found` string with its item IDs; do not delete or replace those without their decision.

Check in the manual passes: narrative reviews with plain titles (*N Engl J Med* review articles, *Lancet* seminars); one document under two years (CDC Creutzfeldt-Jakob 2025 and 2026, NCI *Tumor Markers* 2022 and 2023, Pancreatic PDQ 2025 and 2026, altered immunocompetence 2024 and 2026); Dupixent cited to Sanofi and to Regeneron; repackager labelers (A-S Medication Solutions, RemedyRepack, Bryant Ranch Prepack, Henry Schein); "ACC consensus on management of anticoagulant-related bleeding" 2020; the Society for Endocrinology pituitary apoplexy guideline (2016 or 2017); the NCI Adult Non-Hodgkin Lymphoma PDQ (now two pages); NICE NG158 cited as 2020; ACOG documents in three forms.

## Phase 9: close

- [ ] Rerun the audit: classes `L`, `M`, `Lg`, `I` and flags `refsite`, `narrative` at zero or explained. Report final counts, the kept strings and the content audit list below to the user.
- [ ] Bring `audit-sources/SKILL.md` in line with what the phases taught, check its tests pass, then delete `var/source-audit/` and this tracker.

## Status

Next: Phase 6, CDC pages 55 to 79.

- Counts (2026-11-26): 8,140 questions and 2,361 cards have sources. `P` 11,629 citations in 3,441 strings, `L` 89 in 30, `Lg` 2, `I` 0, `M` 0. Flags: `summarypage` 105 strings, `pre2010` 178, `2010-15` 354, `narrative` 2 (both kept: a working group guideline and a systematic review).
- URLs and program names: 34 citations lost their URL and three program-name strings were dropped (31 questions and 14 cards staged, map `phase6-urls-programs.json`). i27408 now has no source.
- Phase 6 list: 199 strings on 535 items (the flag, 64 WHO fact sheets and 21 CDC pages the flag misses). 114 strings have items to replace: 303 items (regimen 181, criterion 50, dose 41, threshold 31), 63 of them `covered`. 85 strings and 232 items keep the page. CDC "Clinical Guidance for" pages, schedules and *General Best Practice Guidelines for Immunization* were left out as CDC's own guidance.
- CDC pages 1 to 27: 48 items staged (33 took a guideline, 15 `covered` lost the page), 16 keep the page; reasons per item are in `maps/phase6-cdc-1.json`. Guidelines now cited: IDSA babesiosis 2020 and leishmaniasis 2016, Shane 2017, PAHO Chagas 2019, WHO dengue 2009, WHO cystic echinococcosis 2025, WHO WPRO HFMD 2011, CDC pertussis 2005 and plague 2021 (*MMWR*), Workowski 2021, CDC folic acid 1991 (*MMWR*). The pertussis and folic acid documents have no newer edition (for Phase 7).
- CDC pages 28 to 54: 45 items staged (36 took a guideline or label, 9 `covered` lost the page), 14 keep the page; reasons per item are in `maps/phase6-cdc-2.json`. Now cited: the Biltricide, Egaten and Daraprim labels, Requena-Méndez 2017 (strongyloidiasis), Peyron 2019 (toxoplasmosis in pregnancy), WHO tetanus technical note 2010, WHO tularaemia 2007, Rao 2021 (botulism, *MMWR*), Shane 2017, WHO diphtheria laboratory manual 2021, PhilHealth leptospirosis 2012, Hermann 2021 and CDC *CJD Diagnostic Criteria* 2026, Conners 2023, CDC measles infection control recommendations 2026, the CDC surveillance manual chapters on measles and mumps (2025), CDC mumps isolation 2008 (*MMWR*). For Phase 7: the WHO tetanus note and tularaemia guideline have no newer edition found; the WHO 2017 tetanus position paper was not read.
- Kept because the stem asks for CDC's recommendation: i34357, i39437, i36177. Kept because the guideline is blocked: trichinellosis i34289 and i34292 (FAO/WHO/OIE 2007 guidelines; replace them if the user saves a copy in `var/sources/manual/`).
- For Phase 8: the mumps chapter of the surveillance manual is now cited as 2024 (1 item) and 2025 (1 item); the Daraprim label is cited as 2023 and openFDA gives 2021.
- Head lice (f-db57bd81, i34221, i39459) keep the CDC page: the AAP 2022 report (Nolt et al, *Pediatrics*, doi:10.1542/peds.2022-059282) is blocked. Replace them if the user saves it in `var/sources/manual/`.
- i34088 still cites *Patient Care for Giardia Infection*; Shane 2017 now covers it, so the later CDC box only drops that page.
- Kept `L` strings (30): each has its reason in a `phase2-*.json` map. They need per-item staging, a record that was blocked, or a user decision (documents that are not one document, such as "FDA approval of selumetinib" and the Millennium Development Goals).
- Kept `Lg` strings: `Philippines DOH Administrative Order 164 (2002)` (i21801, no title or record found) and DOH AO 2012-0012 "as amended by AO 2012-0012-A" (i32143, the amendment was not found).
- `A groups` prints 11 sets that are different documents with one title and year. Leave them.
- Items that lost their only source in Phase 1, with the leads tried, are in this file at commit 9a63b55.

For a later content audit (the source disagrees with the item or supports it only in part):

- i44380 keys infection as the top thyroid storm precipitant; JTA/JES 2016 ranks it second.
- i41295 links lichen sclerosus to differentiated PeIN; EAU-ASCO 2026 says it is not associated.
- i44486: the membranous nephropathy ranking depends on region. i45540, i45541: the rationale names MedlinePlus Genetics.
- Figures not in the source: i45298 (60 to 80%, Fleseriu 2021), i45327 (warm AIHA 70 to 80%; BSH 2017 says 65%), i45333 and i44618 (VWD about 1%; ASH 2021 gives 1 in 100 to 1 in 10,000), i44928 (*E. coli* 25 to 33%, BSG 2021), i44949 (85%; Clark 2024 gives 50 to 88.2%), i44864 (arthritis 75%, a CDC summary page), card f-39765d83 ("0.9%" and "until volume is restored", Endocrine Society 2023).
- Partial support: card f-9ef97ef9 (Lucas 2014, HIVAN in untreated HIV only), i43885 (GINA 2026 does not say "continue omalizumab"), i45328 (NHLBI 2014, not the emergency department wording), i42940 (ΔP "30 mm Hg or less"; ACS TQIP 2015 says less than 30, and AAOS updated its guideline in November 2025), i36357 (NICE NG198 has no 3 to 4 month limit), i27859 (cites the 2022 priapism article; tests acute treatment, covered by the 2021 one), i27504 (cites the 2021 STI guideline; a 2024 update exists).
- From Phase 6, the guideline supports the key but not a detail of the item: Chagas i34125 and i39442 call benznidazole preferred (PAHO 2019: either drug, without distinction), and i34125, i34126, i39442, i39444 give a 60-day course and age limits of 18 and 50 that PAHO does not state; i34220 lists ivermectin days 1, 2, 8 (Workowski 2021: days 1, 2, 8, 9, 15); i33367 calls fluoroquinolones alternatives (Nelson 2021: first-line with doxycycline); i39454 has surgery in 4 weeks (WHO 2025: albendazole 1 to 7 days before, hepatic cysts only, not before lung cyst surgery); card f-8397ada5 gives "falling hematocrit despite adequate fluids" (WHO 2009: a fall with unstable vital signs); i43944 says pregnant patients are admitted (WHO 2009: may need admission); i39441 says liposomal amphotericin B is the choice in pregnancy (not stated in IDSA 2016); i34101 gives 7 to 10 days (not seen in Shane 2017).
- From Phase 6, CDC pages 28 to 54: i36182 keys antibiotics for wound botulism (Rao 2021: antimicrobials give no benefit; the page was kept); i23262 and i36175 start the toxoid series after recovery (WHO 2010: first dose with TIG at presentation); i36241 and i39452 give *S. japonicum* a higher praziquantel dose than other species (label: 60 mg/kg in 3 doses for all); i34259 gives ivermectin for 1 to 2 days (Requena-Méndez 2017: a single dose); i34106 and i35023 use an 18-week spiramycin cutoff (not in Peyron 2019, which avoids pyrimethamine-sulfadiazine before 14 weeks); card f-2cf555dc names albendazole as the alternative (not in the label); i34379 and i39455 say praziquantel fails in fascioliasis (not in the label); i34369 keys praziquantel for paragonimiasis (the WHO fact sheet puts triclabendazole first); i33326 says "severe" (Shane 2017: first-line in travelers); card f-15f475d8 lists ampicillin (PhilHealth 2012: amoxicillin or azithromycin for mild disease); i22135 has a serology table row the Conners 2023 table does not; unchecked details in i23127 (2 hours airborne), i23253 (a negative test does not rule out mumps) and i36180 (FVC threshold).
- Card faces: f-0c29a602 names "Zhai 2016 review" (now cited to Aggarwal 2019); f-36b25b4e cited *Garcia v People* (the case is *Lagao v People*).
- News releases and non-primary pages cited as sources: AAP Down syndrome 2022, two WHO news items, WHO Philippines SPEED 2012, the EMA ulipristal notice, the FDA frostbite release, an NHS Specialist Pharmacy Service page.

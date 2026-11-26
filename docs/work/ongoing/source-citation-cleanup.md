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

Each box takes the first 100 strings `A list L <Subject>` prints then (done strings leave the list).

- [x] Pediatrics, first 100 by use
- [x] Pediatrics, next 100
- [x] Pediatrics, the rest (17 kept strings remain, see Status)
- [x] Surgery, first 115
- [x] Surgery, the rest (2 kept strings remain, see Status)
- [ ] Preventive Medicine (113)
- [ ] All other subjects (about 110)

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

Phases 0 and 1 and the Pediatrics and Surgery boxes of Phase 2 done (2026-11-26). Next: Phase 2, Preventive Medicine.

- Phase 1, first box: 39 strings. 10 replaced, 27 dropped, 2 kept (Kalish 2024 is the AACR working group guideline; Jiang 2013 is a PRISMA systematic review). 35 questions and 5 cards staged. `refsite` is at 0. Maps in `var/source-audit/maps/phase1*.json`.
- Phase 1, second box: 73 strings. 14 replaced, 55 dropped, 4 split per item (4 of their 9 items replaced). 68 questions and 13 cards staged, unpublished; 39 questions and 4 cards lost their only source. Maps in `var/source-audit/maps/phase1-narr*.json`.
- Dropped for lack of a readable primary document, with the lead to try again: Cushing causes (Nieman 2008, OUP blocked), hypercalcemia causes (Endocrine Society 2023 read in part, does not rank PTHrP), SCA3 (Ruano 2014, abstract only), NF2 (Plotkin 2022, blocked), neonatal meningitis (Okike 2014, Gaschignard 2011, abstract only), asplenia (BSH 2024, blocked), ARDS survivors (Herridge 2003, blocked), atypical femur fracture i43470 (ASBMR 2014, Wiley blocked), acne i36358 and i36360 (AAD 2024, jaad.org blocked), DIC cause i44621 (JSTH 2024, no full text), malignant effusion i44554 (ATS 2018 and BTS 2023 blocked), AV graft stenosis i44483 (KDOQI 2019 blocked), LCNEC i42631 (WHO Thoracic 5th ed), asthma exacerbation in pregnancy i43886 (ACOG PB 90 not read), hypothyroidism cause i44384 (ATA 2012 blocked), PNH card (BSH, Wiley blocked).
- Rankings searched with no primary document that states the order (now uncited): hookworm species i44945, enterococcal species i44961, anicteric leptospirosis i44971 (WHO 2003 and the 2010 Philippine guideline give no proportion), GCA headache i44867, spinal TB i45355, stone composition i44490, SLE pericarditis i44861, OA risk factor i44841, cirrhosis cause in the Philippines i43949, VWD type 1 share i44619, TB as leading exudate cause i44553, pancreatic head i44000. Also uncited: hypercyanotic spell items i23037, i23047, i23038, calciphylaxis i43066, pectus bracing i43223 and its card, MS relapse in pregnancy i43903.
- For a later content audit (the replacement or remaining source disagrees with the item, or supports it only in part): i44380 keys infection as the top thyroid storm precipitant, JTA/JES 2016 ranks it second after stopping antithyroid drugs; i41295 links lichen sclerosus to differentiated PeIN, EAU-ASCO 2026 says it is not associated; i44486 membranous nephropathy ranking is region-dependent; i45540 and i45541 name MedlinePlus Genetics in the rationale; i45298 gives 60 to 80%, not in Fleseriu 2021; i44864 arthritis 75% rests on a CDC summary page; i45327 says warm AIHA is 70 to 80%, BSH 2017 says 65%; i45333 and i44618 say VWD affects about 1%, ASH 2021 gives 1 in 100 to 1 in 10,000; i44928 gives *E. coli* 25 to 33%, BSG 2021 lists it first without a figure; i44949 cites "a 2024 review" for 85%, Clark 2024 gives 50 to 88.2%; card f-0c29a602 names "Zhai 2016 review" on its back, now cited to Aggarwal 2019; card f-39765d83 says "0.9%" and "until volume is restored", not in Endocrine Society 2023; card f-9ef97ef9: Lucas 2014 read in part, supports HIVAN in untreated HIV only; i43885: GINA 2026 supports continuing ICS and reports omalizumab registry safety but does not say "continue omalizumab"; i45328: NHLBI 2014 supports pain as the most common complication and admission reason, not the emergency department wording; i42940 says ΔP "30 mm Hg or less", ACS TQIP 2015 says less than 30 (AAOS updated its compartment syndrome guideline in November 2025, not read); i36357: NICE NG198 has no 3 to 4 month limit.
- Phase 0 trial: 14 strings, 245 questions staged. The actor `agent:source-cleanup` also has 281 changes from 2026-11-20, before this tracker.
- Phase 2, Pediatrics first 100: 89 rewritten, 11 kept. 571 questions staged, unpublished. Map in `var/source-audit/maps/phase2-peds1.json` (kept strings carry their reason and the records found). All 41 DOIs in the map match Crossref.
- Kept, needing per-item work or a decision: Rome IV 2016 and the 2018 Duchenne care considerations (each string covers two or three articles; stage per item); ARIA 2019 German guideline (published in both *Allergo J Int* and *Allergol Select*); AAP congenital hypothyroidism 2023 (two *Pediatrics* records with one title, e2022060419 and e2022060420; read which is the clinical report); CDC milestone checklists 2022 (a set of pages; CDC blocked); PIDSP 2015 bacterial meningitis CPG (no record reached; lead: *PIDSP Journal* 2015;16(2)); PPS/PIDSP/PFV schedule "2025" (only the 2026 schedule was found); NCI PDQ osteosarcoma and Ewing sarcoma "2025" (the pages read showed last updates of late 2024, and Ewing has a new title); two aplastic anemia narrative reviews (Peslak 2017, Hartung 2013: replace or drop as in Phase 1; the bank cites an ASH 2026 guideline).
- Phase 2, Pediatrics next 100: 98 rewritten, 2 kept. 134 questions staged, unpublished (117 Pediatrics, 17 in four other subjects). Map in `var/source-audit/maps/phase2-peds2.json`. All 56 DOIs match Crossref. Kept: WHO *Family Planning: A Global Handbook for Providers* "2022 edition" (WHO IRIS lists only 2018; fphandbook.org shows a 2022 cover without citation details) and CDC Herpes Simplex Virus and Breastfeeding 2025 (CDC blocked, no ledger entry).
- Changed to the record in that box: NICE NG224 2022 to 2025 (the bank's wording, last update); DOCK8 transplantation 2018 to 2019; CPIC carbamazepine to 2018; CDH EURO consensus to 2016; AUA Urotrauma "2014, amended 2020" to the 2020 amendment (Morey, *J Urol* 2021); "Modified Bell staging criteria" to Walsh and Kliegman 1986; "WHO Growth Reference ... 5 to 19 years" to de Onis, *Bull World Health Organ* 2007; WHO TB Module 4 2025 cited without an edition (the bank also cites the 2nd ed. 2026). CDC page titles again come from the ledger or the old string.
- Forms settled in that box: Red Book as `Kimberlin DW, Banerjee R, Barnett ED, Lynfield R, Sawyer MH, eds. *Red Book: 2024-2027 Report of the Committee on Infectious Diseases*. 33rd ed. American Academy of Pediatrics; 2024.`, a chapter as `Chapter title. In: <editors>, eds. ... 2024:pages.` ACOG documents went in with three wordings (the bank already mixes them): Phase 5 picks one.
- Phase 2, Pediatrics the rest: 84 strings, 80 rewritten (75 distinct citations), 4 kept. 76 questions staged, unpublished (73 Pediatrics, 2 Biochemistry, 1 Surgery). Map in `var/source-audit/maps/phase2-peds3.json`. All 46 DOIs match Crossref. Kept: FDA teething jewelry safety communication 2018 and FDA desmopressin information 2007 (fda.gov pages not found), "FDA approval of selumetinib" 2020 (not one document), VHL Alliance surveillance guidelines 2020 (no record on vhl.org).
- In that box: ARIA-EAACI part I 2025 to 2026 (*Allergy* record). Written from the old string or the ledger without a record read: COG Long-Term Follow-Up Guidelines version 6.0 2023, IMCI Chart Booklet 2014, JCIH 2019 position statement, the IDSA pharyngitis scoring page, six CDC pages, and the FDA benzocaine communication (title from a search listing). Co-published guidelines took one journal: Surviving Sepsis children 2020 as *Pediatr Crit Care Med*, ACR lupus nephritis as *Arthritis Rheumatol*. Lipkin 2020 and Hyman 2020 went in with `Authors; Council ...; Section ...` groups and a DOI; the bank's older wordings of both (6 items) are left for Phase 5.
- Pitfall: a title with its own `; ` (SMA care part 2, the FDA montelukast communication) splits into two citations when the part before it holds a period. Those two titles went in with commas in place of the semicolons.
- Phase 2, Surgery first 115: 113 rewritten (111 distinct citations), 2 kept. 454 questions staged, unpublished, all Surgery. Map in `var/source-audit/maps/phase2-surg1.json`. All 82 DOIs match Crossref. Kept: AAOS carpal tunnel guideline 2016 (the bank and ledger hold only the 2024 edition that replaced it: a Phase 7 case) and "CDC Adult Immunization Schedule Notes (2025 to 2026)" (two schedules; stage per item).
- Years changed to the record in that box: AUA cryptorchidism 2025 to 2014 (2025 is only a validity confirmation), SEOM-GEIS sarcoma 2024 to 2025, ACC/AHA valvular 2020 to 2021, ACR nipple discharge 2023 to 2022, BSH spherocytosis to 2012, SHEA surgical site infection 2022 to 2023, WHO *Head and Neck Tumours* 5th ed. 2022 to 2024 (print), CDC tetanus wound guidance 2025 to 2026 (ledger). AUA "amended" guidelines took the amendment: NMIBC as Clark, *J Urol* 2026 (no volume yet), microhematuria 2025 and early detection of prostate cancer 2026 in organization form. ESVS mesenteric stayed the 2017 edition although the bank also cites the 2025 one (Phase 7).
- Forms settled in that box: the three AJCC 8th edition chapter strings (Breast, Gallbladder, Oral Cavity) took the bank's book citation `Amin MB, Edge SB, Greene FL, et al, eds. *AJCC Cancer Staging Manual*. 8th ed. Springer; 2017.` because no record shows the chapter titles or pages; WHO Classification volumes as `WHO Classification of Tumours Editorial Board. *Digestive System Tumours*. 5th ed. International Agency for Research on Cancer; 2019.`; a drug label as `Labeler. *Brand (generic) prescribing information*. Labeler; year.` from DailyMed (Phase 4 still settles the label form bank-wide). Written from the old string or the ledger without a record read: ACR BI-RADS Atlas 5th ed., NPIAP Pressure Injury Stages 2016, ACPA Parameters of Care 2024, AAOS hip fracture 2021, the EAU chapters. For Phase 5: ASMBS/IFSO 2022 went in as *Surg Obes Relat Dis* (the bank also has an *Obes Surg* wording), several rewrites add a DOI or pages to an older bank wording (Kyoto IPMN, Surviving Sepsis 2026, ATA 2025, AAD basal cell carcinoma, ACR nipple discharge without its expert panel group), and two reused *J Clin Oncol* wordings have no volume or pages (Morrow 2016, Park 2025).
- Subagent brief and scripts for this box were in the session scratchpad: batches of 23, five subagents in two waves, 4 to 6 minutes each. Tell subagents to keep a `; Group Name` author group when reusing a bank wording (the splitter handles it), and to use the settled PDQ form. `A apply` on 454 questions takes over 2 minutes: run it in the background.
- Phase 2, Surgery the rest: 113 strings, 111 rewritten (106 distinct citations), the same 2 kept. 105 questions staged, unpublished (104 Surgery, 1 Microbiology & Parasitology). Map in `var/source-audit/maps/phase2-surg2.json`. All DOIs match Crossref.
- Changed to the record in that box: ACC/AHA/SCAI revascularization 2021 to 2022, ACR/Arthritis Foundation osteoarthritis 2019 to 2020, IDSA/ESCMID cystitis 2010 to 2011, AUA BPH "2021, amended 2023" to the amendment article (*J Urol* 2024). "Management of seizures in brain tumor patients: SNO and EANO consensus review (2021)" has no record under that title and went in as Walbert 2021, the SNO and EANO anticonvulsant prophylaxis guideline, which is what i27076 tests. AUA/SMSNA priapism 2022 went in as the 2022 *J Urol* article (recurrent ischemic, sickle cell and non-ischemic priapism); a separate 2021 article covers acute ischemic priapism, and i27859 tests acute treatment in a sickle cell patient (for a later content audit). "ATLS 10th edition (2018) and 11th edition (2025)" took the 11th edition only (the 10th is superseded). The "NCCN risk stratification as reproduced in the AAD guideline" string took the AAD guideline. ASCO-CAP HER2 2023 as *Arch Pathol Lab Med* (the bank's journal for it). WHO rotavirus position paper without pages (the WHO record's range is a typo). Trial strings named by acronym took the primary article's title.
- Written from the old string, the ledger or a search listing without a record read: CDC Vibrio vulnificus health advisory 2023, CDC Pink Book rotavirus and NICE NG234 (bank wordings), AAO retinal vein occlusions PPP 2024 (the ledger notes a June 2026 update), FDA SGLT2 safety communication 2018, FDA nirogacestat approval 2023, Care of Burns in Scotland fluid resuscitation 2024, American Cancer Society breast screening 2026, ATLS 11th ed., ACS TQIP orthopaedic trauma 2015. For Phase 4: Tafinlar now has two label forms (Novartis from DailyMed here, "U.S. Food and Drug Administration" in an older wording). For Phase 5: Park 2025 now has a wording with volume, pages and DOI beside the older bare one.
- That box ran as five batches of 21 to 23, three subagents at once, 6 to 13 minutes each. Europe PMC and Crossref rate-limit at times (HTTP 429 or 503): wait and retry, and pace DOI checks.
- Years changed to the record: WHO soil-transmitted helminth fact sheet 2026 to 2023, IPNA nephrotic syndrome 2022 to 2023, AAAAI/ACAAI atopic dermatitis 2023 to 2024, anaphylaxis practice parameter to 2024, PIDS/IDSA arthritis 2023 to 2024. The PhilHealth leptospirosis statements took 2012 from the file date (the text has none). CDC pages were blocked: their titles come from the ledger or search results and their years from the old strings.
- Forms settled: NCI PDQ as `National Cancer Institute. *<Title> (PDQ): Health Professional Version*. National Cancer Institute; <year>.`; ADA sections as the bank's `Standards of Care in Diabetes—2026 ... 49(Suppl 1)` wording; a web page or report as `Organization. *Title*. Organization; year.` Phase 5 still has to merge older wordings into these (PDQ has four forms; four citations give the adult Surviving Sepsis DOI 10.1097/CCM.0000000000007075 for the children's guideline).
- Subagent brief for class `L` (reuse it): give each string up to 3 items and the bank's full-form citations that share its title words, ask for the record from Crossref, Europe PMC, WHO IRIS or the ledger with no `save-source` (parallel writes to the ledger), and reuse of an existing wording when it matches the record. Three subagents run at once (the session limit). About 4 to 7 minutes per batch of 25. Afterwards check every DOI in the merged map against Crossref and run each value through `split_citations` and `citation_form`.
- Counts now: `L` 542 citations and 242 strings, `P` 9,511, `M` 791, `Lg` 767, `I` 86. The 2 strings under `narrative` are the kept ones.
- Pitfall: a listed string can still hold two documents (about 5 remain, such as `Jeffrey Modell Foundation 10 Warning Signs ...; 2025 Inborn Errors ...`). Map such a string to both full citations joined with `.; ` or `; ` (then check each part with `split_citations`), never to one. Stage by hand when the items under one string need different documents (`"KEEP: per-item"` in the map, then an `edits` file through `J stage-quizzes`).
- Pitfall: a trailing fragment the splitter cut off (`updated 2026.`) stays behind when its citation is dropped. Check the items' full sources and map the fragment to `null` too.
- Crossref (`api.crossref.org/works/<DOI>`, or `?query.bibliographic=<title>`) gives the publisher record for journal articles without a fetch. Title search often returns comments and corrigenda first: confirm the DOI's own record.
- A replacement needs the tested point read in full text. Many "most common" keys have no guideline that ranks them: allow about 15 minutes per string, then drop.
- Subagent briefs: name the likely guideline per string and require the supporting sentence quoted for each replacement and a search before any ranking is dropped. Without that, first passes dropped nearly everything unsearched and needed a second pass. Give each batch the items' stems, keys and full sources.

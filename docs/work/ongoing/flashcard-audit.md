# Flashcard audit

Goal: audit the 20,121 pre-skill flashcards for accuracy, currency, clarity and relevance, then top up thin topics. Follow the [write-flashcards skill](../../../.agents/skills/write-flashcards/SKILL.md): `audit: true` decks, one Sonnet reviewer per deck. Never publish.

Work dirs: `var/flashcard-work/<subject-slug>/` (gitignored).

## Decisions

- Order by risk: Internal Medicine, Pharmacology, Pediatrics, OB-GYN, Preventive Medicine, Legal Medicine, Surgery, Microbiology. Anatomy, Biochemistry and Physiology last, possibly a lighter pass.
- One topic per session.
- Delete the reviewers' trivia and duplicate cards on your own judgment; keep classic exam facts and cards relevant in the Philippines. Ask only about fixes that rest on judgment, not a source. Add coverage gaps to Top-ups.
- Reviewers skip web checks on facts they feel sure of and misreport card counts. Send back any reviewer that leaves a guideline-dependent fact on an existing card unchecked, naming the facts.
- Retired-term hits still to handle in their decks: 5 Biochemistry, 2 Pathology, 1 Microbiology.
- `save-source --from` archive.org fetches are denied by the permission classifier here.
- Before publishing: read each staged `sources` (the gate can't match narrative reviews or single-hospital protocols) and settle the Unverified list.

## Status

- Done: Internal Medicine (19 topics), Pharmacology (15 topics).
- Pediatrics: all 14 topics (38 decks) in `plan.json`. Done: Neonatology, Pediatric Nutrition, Preventive Pediatrics, Growth and Development, Gastroenterology, Nephrology, Hematology and Oncology, Neurology, Pulmonology. Next: Rheumatology.

## Staged (not published)

Per-card reasons are in the draft change history.

- Internal Medicine: 312 edits, 133 deletes.
- Pharmacology: 47 edits, 10 deletes.
- Pediatrics (9 topics): 33 edits, 1 delete.
- Cross-subject math pass: 67 edits converting `\(...\)` and `\[...\]` to `$...$` and `$$...$$` (45 Preventive Medicine, 8 Pharmacology, 7 Surgery, 4 Pathology, 2 Pediatrics, 1 OB-GYN).
- Cross-subject source passes (backfill, re-source of non-citable and narrative-review citations, full check of weak cards): 95 edits, 2 deletes.

## Unverified (check before publishing)

Primary text unreadable; secondary sources agree unless noted.

Manual copies in `var/sources/manual/` now cover AHA/AAP 2025 neonatal resuscitation, AAP 2022 hyperbilirubinemia and AAP 2026 UTI: recheck the Neonatology and Nephrology items against them.

- Pharm: cardiac arrest epinephrine (AHA 2025 ALS) and opioid-emergency cards (AHA hosts 403); febuxostat mortality (Uloric label from ledger); H. pylori (ACG 2024 highlights only); arsenic and mercury chelators (no source read); leprosy citation read from a mirror.
- Peds › Neonatology: 8 NRP cards (SpO2 targets, 3:1, HR thresholds, meconium suction, preductal probe), AAP 2022 hyperbilirubinemia, NEC management, human milk and NEC.
- Peds › Nutrition: vitamin K 1 mg (AAP 2022 abstract), iron (AAP 2026), inadequate-intake signs (ABM #3), 6 refeeding cards (ASPEN 2020), obesity comorbidity and treatment (AAP 2023).
- Peds › Preventive: day-28 repeat newborn screen for preterm or sick infants (only a 2014 study states it). No DOH rabies order newer than AO 2018-0013 found.
- Peds › Growth and Development: shape-copying ages (secondary tables: square 4 to 4.5, triangle 5; cards say 5 and 6), tricycle at 3, skipping at 5, hand preference "before 18 months" (secondary: 12), 3 autism and screening cards (AAP 2020).
- Peds › Gastroenterology: Kasai timing "first 1–2 months", intussusception enema first-line and contraindications, coeliac serology (ESPGHAN 2020 abstract). Plan A/B/C volumes rest on IMCI 2014 and WHO 2005 (WHO 2024 has none).
- Peds › Nephrology: HUS platelets only for bleeding or procedures, HUS supportive care, complement-mediated HUS, bag-specimen contamination, UTI confirmation by urinalysis plus culture, 48–72 hour reassessment (NICE NG224 says 24–48).
- Peds › Neurology: AAP 2008 long-term febrile seizure guideline (antipyretics, no prophylaxis, recurrence risks, no brain injury); refractory status epilepticus definition; NF2-related schwannomatosis criteria (Plotkin 2022 table); migraine cards against Oskoui 2019 full text (JAMA Neurol summary only); 7 stroke cards against AHA 2019 (403).
- Peds › Pulmonology: IMCI fast breathing ≥50 at 2–11 months (PAPP 2021 says 3–12 months) and ≥60 under 2 months (2014 booklet unreadable).
- Peds › Hematology and Oncology: TLS hypocalcemia and consequences (Coiffier 2008, BSH 2015 and 2025 all 403); severe aplastic anemia checked against adult BSH 2024 only.

## Top-ups (after audits)

Rerun `D coverage` per subject for THIN topics, SMALL decks and subtopic counts; its counts are heuristic, so confirm before writing. False zeros seen: Methylxanthines, Androgens, Thionamides, Antiproliferative Agents, Dentition. Gaps it doesn't show:

- New decks, not top-ups: IM › Psychiatry (one 15-card deck for 110 questions); Peds › Preventive Pediatrics IMCI and dehydration.
- IM: Dengue, Leprosy and autoimmune blistering disease have 0 cards; no cancer-associated VTE or preventive migraine card; anal fissure card vague (no posterior midline or sphincter spasm); obesity-associated cancers and conditions need single-answer cards; Spondyloarthropathies deck holds RA cards (Caplan, Felty) and few ankylosing spondylitis cards; Critical Care Supportive ICU Care 0 cards.
- Pharm: no Alzheimer drug cards (`D coverage` miscounts via "Disease"); no ondansetron or dopamine-antagonist antiemetic; no misoprostol, octreotide, terlipressin or nonselective beta-blocker for portal hypertension; no BRAF, ALK, BTK or CDK4/6 inhibitor; no abatacept or anakinra plus TNF inhibitor infection card (Orencia label); no acetylcysteine regimen or nomogram, no fomepizole.
- Peds › Hematology and Oncology: `D coverage` shows 0 for Thalassemias, Oncologic Emergencies and Lymphomas (heuristic; thalassemia and Hodgkin cards exist), 5 for Hemophilia (13 questions), 6 for ITP (12).
- Peds › Neurology: no SMA, Duchenne or myasthenia cards (`D coverage` shows Neuromuscular Disorders 0 for 14 questions; its Neurocutaneous 0 is a false zero). Thin: Antiseizure Medications 4 (8 questions), CSF Analysis 1 (10), Hydrocephalus 4 (12), Headache 3 (10), Neural Tube Defects 4 (10).
- Peds › Pulmonology: no obstructive sleep apnea cards (6 questions); Cystic Fibrosis 1 card (6 questions), none on sweat chloride; Childhood Tuberculosis 7 (18).
- Peds: no M-CHAT, developmental screening ages, microarray or fragile X, or maltreatment workup (sentinel injuries, skeletal survey) cards.

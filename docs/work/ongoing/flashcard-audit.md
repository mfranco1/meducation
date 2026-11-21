# Flashcard audit

Goal: audit the 20,121 pre-skill flashcards for accuracy, currency, clarity and relevance, then top up thin topics. Follow the [write-flashcards skill](../../../.agents/skills/write-flashcards/SKILL.md): `audit: true` decks, one Sonnet reviewer per deck. Never publish.

Work dirs: `var/flashcard-work/<subject-slug>/` (gitignored).

## Decisions

- Order by risk: Internal Medicine, Pharmacology, Pediatrics, OB-GYN, Preventive Medicine, Legal Medicine, Surgery, Microbiology first. Anatomy, Biochemistry and Physiology last, possibly a lighter pass.
- Reviewers list correct-but-trivia existing cards in their summary; the user decides on deletes.
- Pilot first (Internal Medicine › Critical Care Medicine, 109 cards) to measure cost per card and hit rate.
- Coverage top-ups for THIN topics (26 by `D coverage`, 14 in Pathology) come after the audits, as normal write-flashcards work.
- Retired-term hits before audit: 18 cards (10 IM, 5 Biochemistry, 2 Pathology, 1 Micro); reviewers handle them in their decks.

## Status

- Pilot done: Critical Care, 109 cards, 12 edits (11%), 8 trivia or duplicate cards deleted. Reviewers kept reporting ledger-only doubts; the reviewer prompt now loads web tools up front and asks for URLs. Send back any reviewer that reports an unchecked doubt. `D build` now refuses an audit deck whose `sources-review-<n>.json` is empty (Sonnet reviewers often return zero findings with no lookups).
- Unresolved doubts: user rule is to follow the latest guideline; where it differs from the latest primary textbook, give both, labelled by name (now in content-standards Facts).
- Sources: a guideline-dependent correction cites the primary document; a stable textbook fact takes no citation (content-standards Citations). The gate warns on non-citable sources (MSD Manual, *Cureus* and similar) and on unnamed attributions.
- Narrative reviews and single-hospital protocols the gate can't match: read each staged `sources` before publishing.
- Per topic: audit, then delete the reviewers' trivia and existing-duplicate cards on your own judgment (user approved; top-ups can add better cards). Ask only about cards whose fix rests on judgment, not a source. Add coverage gaps to Top-ups below.
- Internal Medicine and Pharmacology: all topics audited (see Staged). Run one topic per session to save context.
- Reviewers skipped web checks on facts they felt sure of (all of Pharmacology and all 4 Neonatology reviewers needed a send-back; most misreport card counts). The reviewer prompt now requires checking every guideline-dependent fact on an existing card and listing the documents read per card. Still send back any reviewer that leaves such a fact unchecked, naming the facts. The openFDA label API works for labels.
- Archive.org fetches (`save-source --from`) are denied by the permission classifier, so AHA 2025 neonatal resuscitation and AAP 2022 hyperbilirubinemia full texts stay unread (403 elsewhere).
- Pediatrics: all 14 topics (38 decks) in `plan.json` as audit decks. Done: Neonatology. Next: Pediatric Nutrition.

## Top-ups (after audits)

- THIN topics from `D coverage` (rerun before planning): Pathology 14; Internal Medicine: Psychiatry, Obesity Lipid and Bone, Allergology and Immunology; OB-GYN: Gynecology, Medical Disorders in Pregnancy; Pediatrics: Preventive Pediatrics, Growth and Development; one each in Anatomy (General Anatomy), Biochemistry (Genetics and Inheritance), Microbiology (Clinical Microbiology Integration), Pharmacology (Immunopharmacology: 26 cards for 113 questions), Preventive Medicine (Primary Health Care), Physiology (Integrated and Environmental).
- IM › Infectious Diseases: Urinary Tract Infection, Diagnostic Clues and COVID-19 decks are SMALL (12, 10, 4 cards).
- IM › Enteric, Tropical and Zoonotic Infections: Dengue subtopic has 0 cards (17 questions); Cholera 1 card, Amebiasis and Intestinal Protozoa 3.
- IM › Dermatology: Leprosy (6 questions) and Autoimmune Blistering Disease (7 questions) have 0 cards.
- IM › Hematology: `D coverage` shows 0 cards for Thalassemias, Thrombotic Microangiopathies and Myeloproliferative Neoplasms (heuristic; confirm before writing).
- IM › Oncology: `D coverage` shows few cards for Febrile Neutropenia (1), Other Oncologic Emergencies (2), Chemotherapy and Immunotherapy Toxicity (2), Paraneoplastic Syndromes (4) (heuristic; confirm before writing). No cancer-associated VTE card after the trivia delete.
- IM › Gastroenterology: Dyspepsia and Gastroparesis has 2 cards (4 questions); anal fissure card is vague (no posterior midline or sphincter spasm).
- IM › Nephrology: `D coverage` shows 0 cards for Mixed Acid-Base Disorders and Hypernatremia, few for Hyponatremia (3), CKD Complications (1), Nephritic (1) and Nephrotic Syndromes (2) (heuristic; confirm before writing).
- IM › Endocrinology: Hypoglycemia deck is SMALL (11 cards); Hyperglycemic Hyperosmolar State subtopic has 0 cards by `D coverage` (6 questions); Oral and Noninsulin Agents has 5 cards (15 questions).
- IM › Thyroid, Pituitary and Adrenal: `D coverage` shows 0 cards for Hyperprolactinemia, Acromegaly, Hypopituitarism and Diabetes Insipidus (heuristic; confirm before writing); Thyroiditis 8 cards (10 questions); MEN deck SMALL (6 cards).
- IM › Obesity, Lipid and Bone: Hypocalcemia and Hypoparathyroidism 0 cards (8 questions), Hypercalcemia and Hyperparathyroidism 1 (15 questions), Lipid Disorders 2 (13 questions) by `D coverage`; Obesity deck 11 cards, Dyslipidemia 10 (both SMALL); obesity-associated cancers and conditions need single-answer cards after the list deletes.
- IM › Rheumatology: Approach to Joint Disease (9 cards) and Spondyloarthropathies (9) are SMALL; Spondyloarthropathies holds RA cards (Caplan, Felty) and few ankylosing spondylitis cards; `D coverage` shows 0 fibromyalgia cards (3 questions).
- IM › Systemic Autoimmune: `D coverage` shows 0 cards for ANCA-Associated and Medium-Vessel Vasculitis (11 questions), Other Vasculitides (4) and Inflammatory Myopathies (8), 1 for Large-Vessel Vasculitis and PMR (10), 2 for Systemic Sclerosis (9), 6 for SLE Classification (16); Lupus Nephritis and Drug-Induced Lupus deck SMALL (14 cards).
- IM › Allergology and Immunology: Allergic Rhinitis deck SMALL (14 cards); `D coverage` shows 0 cards for Hypersensitivity Reactions (9 questions), few for Urticaria (2), Angioedema (1), Drug Allergy (1), Primary Immunodeficiency (3) and Secondary Immunodeficiency and Vaccination (1).
- IM › Neurology: Status Epilepticus (9 cards) and Headache (14) decks SMALL; `D coverage` shows 2 cards for Multiple Sclerosis (6 questions), 5 for Myasthenia Gravis (6) and Dementia (6), 2 for Peripheral and Entrapment Neuropathy; no preventive migraine card.
- IM › Psychiatry: one deck of 15 cards for 110 questions; `D coverage` shows 0 cards for Antidepressants and Serotonin Syndrome, Mood Stabilizers, Suicide Risk, Anxiety, OCD and Trauma, Eating Disorders, Personality Disorders and Delirium, and 1 for Other Substance Use Disorders. Needs new decks, not a top-up.
- Pharm › Autonomic and Ophthalmic: `D coverage` shows 5 cards for Glaucoma Drugs (15 questions), 1 for Catecholamines and Vasopressors (11), 4 for Beta Agonists (7), 3 for Adrenergic Neurotransmission (7) (heuristic; confirm before writing).
- Pharm › Cardiovascular and Renal: `D coverage` shows 0 cards for Antihypertensive Selection by Comorbidity (7 questions), 4 for Sympatholytics and Direct Vasodilators (12), 4 for Nitrates (9), 5 for Statins (11) (heuristic; confirm before writing).
- Pharm › Autacoids and Respiratory: `D coverage` shows 0 cards for Methylxanthines (6 questions; 3 theophylline cards exist, so heuristic) and Antitussives, Expectorants and Mucolytics (8), 2 for Ergot Alkaloids (6), 3 for Drugs for Migraine (12) (heuristic; confirm before writing).
- Pharm › Neuropsychopharmacology: no Alzheimer drug cards (4 questions; `D coverage` miscounts via "Disease"), 0 for Stimulants, Hallucinogens and Cannabis (6), 1 for Nicotine and Smoking Cessation (5), 2 for Barbiturates (4).
- Pharm › Hematology and Antithrombotic: `D coverage` shows 0 cards for Fibrinolytics (6 questions), 1 for Chelation for Transfusional Iron Overload (7), 1 for Thrombopoietic Agents (6), 2 for Erythropoiesis-Stimulating Agents (8), 3 for Iron Therapy (11) (heuristic; confirm before writing).
- Pharm › Endocrine and Reproductive: `D coverage` shows 4 cards for Hormonal Contraceptives (13 questions), 0 for Androgens and Antiandrogens (7; finasteride, flutamide cards exist, so heuristic), 3 for Bisphosphonates (8), 3 for Sulfonylureas and Meglitinides (6); Thionamides shows 0 but several cards exist (heuristic).
- Pharm › Antibacterial and Antimycobacterial: `D coverage` shows 0 cards for Metronidazole (5 questions), 1 for Antimicrobial Prophylaxis (5), 2 for Penicillins (10), 3 for Macrolides (10), 4 for Tetracyclines (10) and Cephalosporins (9) (heuristic; confirm before writing).
- Pharm › Antifungal, Antiviral, and Antiparasitic: `D coverage` shows 0 ectoparasiticide cards (3 questions), 3 for Echinocandins (6), 4 for NRTIs and NNRTIs (9), 6 for Systemic Azoles (12) (heuristic; confirm before writing).
- Pharm › Cancer: `D coverage` shows 1 card for Antimetabolites (13 questions), 4 for Tyrosine Kinase Inhibitors (13), 3 for Monoclonal Antibodies in Oncology (10), 3 for Antitumor Antibiotics (9) (heuristic; confirm before writing). Deck 2 has only 24 cards: no BRAF, ALK, BTK or CDK4/6 inhibitor cards.
- Pharm › Gastrointestinal: no ondansetron or dopamine-antagonist antiemetic card (Antiemetics has 4 cards for 15 questions; only 1 mentions 5-HT3), 0 cards for Probiotics and Pancreatic Enzymes (5 questions), no misoprostol, octreotide, terlipressin or nonselective beta-blocker card for portal hypertension.
- Pharm › Immunopharmacology: `D coverage` shows 0 cards for Antiproliferative Agents (9 questions; mycophenolate cards exist, so heuristic), Induction Antibodies and Costimulation Blockade (9) and Immune Globulins and Antivenoms (6), 1 each for Biologics for Asthma and Allergic Disease (11), Anti-Interleukin Therapies (9) and MS Immunomodulators (10). No card for abatacept or anakinra combined with a TNF inhibitor (serious infection, Orencia label).
- Pharm › Toxicology: no acetylcysteine regimen or nomogram card and no fomepizole card; `D coverage` shows 0 cards for Chelating Agents (8 questions) and Solvents, Air Pollutants and Envenomation (8), 1 for Toxidrome Recognition (8) and Pesticides (8) (heuristic; confirm before writing).
- IM › Critical Care: subtopics Supportive ICU Care (0 cards) and Vasopressors and Inotropes (2 cards).

## Staged (not published)

- IM › Critical Care Medicine: 12 edits, 8 deletes.
- IM › Cardiovascular Medicine: 21 edits, 22 deletes.
- IM › Structural Heart Disease, Arrhythmia and Heart Failure: 25 edits, 18 deletes.
- IM › Pulmonology: 24 edits, 9 deletes.
- IM › Infectious Diseases: 26 edits, 11 deletes.
- IM › Enteric, Tropical and Zoonotic Infections: 21 edits, 9 deletes.
- IM › Dermatology: 18 edits, 1 delete.
- IM › Hematology: 17 edits, 9 deletes.
- IM › Oncology: 9 edits, 4 deletes.
- IM › Gastroenterology: 23 edits, 5 deletes.
- IM › Nephrology: 15 edits, 4 deletes.
- IM › Endocrinology: 27 edits, 4 deletes.
- IM › Thyroid, Pituitary and Adrenal Disorders: 16 edits, 4 deletes.
- IM › Obesity, Lipid and Bone Disorders: 6 edits, 2 deletes.
- IM › Rheumatology: 7 edits, 3 deletes.
- IM › Systemic Autoimmune and Rheumatic Disease: 11 edits, 3 deletes.
- IM › Allergology and Immunology: 4 edits, 8 deletes.
- IM › Neurology: 28 edits, 9 deletes.
- IM › Psychiatry: 2 edits (DSM duration criteria), 0 deletes.
- Pharm › General Pharmacology: 0 edits, 2 deletes (Fick's-law trivia).
- Pharm › Autonomic and Ophthalmic Pharmacology: 8 edits (pralidoxime role, 4 sources added), 2 deletes (tacrine, edrophonium test). AHA 2025 ALS citation on the cardiac arrest epinephrine card is from the ledger, not reread (AHA hosts 403).
- Pharm › Cardiovascular and Renal Pharmacology: 6 edits (lidocaine toxicity order, 5 lipid cards cited to the 2026 ACC/AHA dyslipidemia guideline), 0 deletes.
- Pharm › Autacoids and Respiratory Pharmacology: 2 edits (carboprost in asthma reworded to caution per FDA label, depemokimab added to anti-IL-5 biologics per GINA 2026), 0 deletes.
- Pharm › Neuropsychopharmacology: 3 edits (quetiapine in PD psychosis per MDS 2019, eszopiclone not alpha1-selective, gabapentinoid mechanism), 0 deletes.
- Pharm › Anesthesia and Pain Pharmacology: audited, 0 edits, 0 deletes (nothing staged). AHA 2025 opioid-emergency card unread (AHA hosts 403); search summaries agree.
- Pharm › Hematology and Antithrombotic Pharmacology: 1 edit (abciximab no longer marketed), 2 deletes (oprelvekin trivia).
- Pharm › Anti-Inflammatory and Rheumatologic Pharmacology: audited, 0 edits, 0 deletes (nothing staged). Checked against ACR 2020 gout, ACR 2021 RA, the 2023 acetaminophen consensus and FDA JAK and ketorolac labels; the febuxostat mortality card rests on the ledger's Uloric label (FDA 2019 communication 404). No aspirin primary-prevention card exists.
- Pharm › Endocrine and Reproductive Pharmacology: 6 edits (mifepristone front reworded to early pregnancy loss, PTH-analogue osteosarcoma front made specific, progestin-only front reworded, 3 sources added), 0 deletes. Kept atosiban, danazol and etonogestrel-implant cards (relevant in the Philippines).
- Pharm › Antibacterial and Antimycobacterial Pharmacology: 5 edits (ceftaroline yes/no front made open, WHO 2021 XDR-TB and WHO 2018 leprosy citations added to 4 cards), 0 deletes. Kept the quinupristin–dalfopristin, lefamulin and doxycycline photosensitivity cards that the reviewers flagged as trivia (classic exam facts). Leprosy citation was read from a mirror (WHO IRIS 403).
- Pharm › Antifungal, Antiviral, and Antiparasitic Pharmacology: 4 edits (fluconazole, cidofovir and atovaquone–proguanil fronts made single-answer; palivizumab no longer available in the US after 2025 per CDC), 1 delete (stewardship definition). Kept didanosine, stavudine, indinavir and niclosamide cards flagged as trivia (classic exam facts).
- Pharm › Cancer Pharmacology: 12 edits (CTLA-4 now includes tremelimumab, PD-1 list widened, uridine triacetate 96-hour window, loperamide for delayed irinotecan diarrhea, mercaptopurine HGPRT front made single-answer, 7 label and CPIC sources added), 2 deletes (nitrogen-mustard misclassification trivia, mesna yes/no card).
- Pharm › Gastrointestinal Pharmacology: audited, 0 edits, 0 deletes (nothing staged). Checked against FDA labels (metoclopramide, loperamide, sodium phosphate, omeprazole, bismuth subsalicylate, vedolizumab, linaclotide, lubiprostone, ursodiol), EMA 2014 domperidone and MASCC/ESMO 2023 antiemetics. H. pylori cards rest on the ACG 2024 highlights sheet (journal full text 402).
- Pharm › Immunopharmacology: 0 edits, 1 delete (vague biologic-combination card). 26 cards checked against FDA labels (Neoral, Prograf, sirolimus, Zortress, mycophenolate, Simulect, Campath, Lemtrada, Tysabri, Thalomid, Proleukin, Pegasys, Orencia) and IDSA 2013 and CDC live-vaccine guidance.
- Pharm › Toxicology and Antidotes: audited, 0 edits, 0 deletes (nothing staged). Kept asbestos, PCP nystagmus, Minamata and benzene cards flagged as trivia (classic exam facts). Checked against EXTRIP lithium, methanol and salicylate, AACT charcoal and whole-bowel irrigation papers, and FDA labels (sodium nitrite, Provayblue, Chemet, calcium EDTA, Cyanokit), the AHA 2023 toxicology update (archive copy; no COR/LOE tables) and the ACEP 2017 carbon monoxide policy. Unread: a source for the arsenic and mercury chelator cards.
- Peds › Neonatology: 1 edit (undescended testis timing attributed to EAU 2026), 0 deletes. Kept 4 Apgar score cards flagged as trivia. Unverified (primary text unreadable; secondary sources agree): 8 NRP cards (SpO2 targets, 3:1, HR thresholds, meconium suction, preductal probe), the AAP 2022 hyperbilirubinemia cards, NEC management, human milk and NEC.
- Sources backfill: 47 edits (13 back changes, 1 front), 1 delete, across IM and 1 Biochemistry card.
- Re-source of 29 non-citable citations: 29 edits (7 back changes, 2 re-cited to primary documents, 20 cleared as stable facts).
- Full check of 16 weakly sourced cards: 12 edits (6 fact changes, 2 fronts), 1 duplicate deleted.
- Re-source of 7 narrative-review citations: 7 edits (1 fact change: APL differentiation syndrome onset), 5 cleared as stable facts, 2 re-cited (UK SJS/TEN 2016, EASL gallstones 2016).

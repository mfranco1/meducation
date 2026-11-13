# Pathology quizzes

Run with `/write-quizzes` (skill in `.agents/skills/write-quizzes/`). The user approved the blueprint on 2026-11-11 and the resize of the remaining topics on 2026-11-12.

- Work dir: `var/quiz-work/pathology/` (`blueprint.json`: 27 topics, 68 quizzes, 2,790 questions; `blueprint.before-resize.json` is the 2026-11-11 version)
- Sources: `~/Downloads/tn-pdfs/patho/handouts/*.pdf`, extracted to `src/`. Blueprint `pages` refer to `src/main.txt` (main handout, raw `pdftotext`, form-feed pages; `main-layout.txt` is layout mode). `src/flashcards.txt`, `src/flashcards-condensed.txt`, `src/buzzwords.txt` and `src/atlas.txt` (image captions only) are part of the minimum coverage map.
- Topics: the subject's 27 existing topics, all empty at the start, in handout (Robbins) chapter order. No topic merges.
- Sizing (user decision 2026-11-12): skill defaults, with as many quizzes as the topic needs (2 of 50, 3 to 4 of 40, 5+ of 30). The 14 topics staged before then have 2 quizzes of 40.
- Sessions: one topic per session, in the order of the status table. Then revisit the 14 earlier topics, one per session, then the replacement batch and cleanup.
- Resize of the 14 earlier topics (user decision 2026-11-13): size each by its content, 2 of 50, 3 to 4 of 40 or 5+ of 30. Existing quizzes may be split into more quizzes to deepen coverage. Top-ups use the blueprint `add` field. A split needs moving staged questions between quizzes (keep their IDs; `DraftService.move` and `update` with actor `agent:write-quizzes`). A top-up fills the quiz's backlog slots: remove those entries from `replace-backlog.json` after staging.

## Decisions

- Ownership (each quiz's `excludes` has the full list): organ-specific infections live in the organ topic (pneumonia in Lung, enteric infections in GI, hepatitis in Liver, meningitis, neurosyphilis and CNS toxoplasmosis in CNS, endocarditis in Heart, osteomyelitis in Bones, skin infections in Skin). Infectious Disease Pathology owns systemic infections, TB, leprosy, syphilis stages and aortitis, mycoses, parasites and STIs.
- Genetic Disorders owns inheritance, storage diseases and all inborn errors; cystic fibrosis is in Infancy; DMD and myotonic dystrophy clinical disease in Peripheral Nerves and Skeletal Muscle; DiGeorge in Immune; neurocutaneous syndromes (NF, TSC, VHL, Sturge-Weber) in CNS.
- Septic shock pathogenesis in Inflammation; other shock in Hemodynamic. Leukocytosis types and leukemoid reaction in Hematolymphoid, not Inflammation. Hemostasis and thrombosis in Hemodynamic; bleeding disorders, HIT, TTP/HUS and DIC in Red Cells. APS in Immune.
- Neoplasia owns paraneoplastic syndromes, general tumor markers and carcinogen mechanisms (HPV, EBV); organ topics own the organ lesions and germ cell marker profiles (Male Genital).
- Vitamins in Environmental and Nutritional, except rickets/osteomalacia (Bones), B12/folate and iron anemias (Red Cells). Wernicke in Nutrition. Lead in Environmental.
- Sturge-Weber diagnosis (port wine stain, leptomeningeal angioma, GNAQ) is staged in Blood Vessels (q752). CNS (q811) uses "NF2-related schwannomatosis" (2022 consensus name); Eye must not retest CNS tumor or neurocutaneous points.
- Female genital: HPV-based post-treatment surveillance, cervical spread and hydronephrosis in Vulva/Cervix; endometrial hyperplasia in Uterine Corpus; theca lutein cysts and gestational choriocarcinoma in Pregnancy; PCOS named as PCOS with PMOS (2026) as the new name in transition.
- Breast: fat necrosis as a necrosis pattern stays in Cell Injury; ALH and ADH risk in Benign, DCIS, LCIS and E-cadherin in Carcinoma; male breast cancer in Benign.
- Endocrine: Cushing disease tumor morphology in Pituitary; MEN syndromes and RET germline testing in Adrenal/MEN; medullary carcinoma as a tumor in Thyroid.
- Diabetic nephropathy in Endocrine; diabetic neuropathy in PNS; diabetic retinopathy in Eye. Hemangiomas and Kaposi in Blood Vessels. Mycosis fungoides and MALT lymphoma in Hematolymphoid.
- The handout's post-test questions are not to be copied or paraphrased.

## Subject notes (for SUBJECT_NOTES)

Kept in the session scratchpad as `subject-notes.md`, with one `boundary-<topic>.md` per topic; rebuild from this section and the blueprint `excludes` in a new session.

- Audience: Philippine Physician Licensure Exam (PLE) and new physicians in the Philippines. Pathology is tested through pathogenesis, morphology (gross and microscopic buzzwords), markers and clinicopathologic correlation, mostly as short vignettes. Use current references: Robbins & Cotran Pathologic Basis of Disease (11th ed.), current WHO Classification of Tumours (5th ed.; Soft Tissue and Bone 6th ed., 2026, see currency-notes.md), AJCC 8th ed. staging, current consensus nomenclature (e.g. MASLD, pituitary neuroendocrine tumor, IDH-based glioma classification, WHO-HAEM5 names such as "extranodal NK/T-cell lymphoma" without "nasal type").
- Do not test superseded classifications kept in the handout as current (e.g. pre-2021 CNS tumor names, "NAFLD") except as "formerly called".
- Besides the brief's `source-<n>.txt`, grep `var/quiz-work/pathology/src/flashcards.txt`, `src/buzzwords.txt` and `src/atlas.txt` for your quiz's entities and cover their tested points.

## Status

| Topic | Status |
| --- | --- |
| Cell Injury and Adaptation | staged 2026-11-11, resized 2026-11-13 to 2 of 50 (q700 to q701, 98; 2 in backlog; both quizzes 16% hard, ask for hard replacements) |
| Inflammation and Repair | staged 2026-11-11, resized 2026-11-13 to 2 of 50 (q708 to q709, 99; 1 in backlog: a chemical mediators item in Acute) |
| Hemodynamic Disorders | staged 2026-11-11, resized 2026-11-13 to 2 of 50 (q712 to q713, 100; 0 in backlog) |
| Genetic Disorders | staged 2026-11-11, resized 2026-11-13 to 2 of 50 (q716 to q717, 100; 0 in backlog) |
| Immune System Disorders | staged 2026-11-11, resized 2026-11-13 to 2 of 50 (q722 to q723, 99; 1 in backlog: an HIV item in Immunodeficiency) |
| Neoplasia | staged 2026-11-11, resized 2026-11-13 to 2 of 50 (q730 to q731, 97; 3 in backlog: 2 in Tumor Features, 1 in Molecular Basis) |
| Infectious Disease Pathology | staged 2026-11-11, resized 2026-11-13 to 2 of 50 (q736 to q737, 100; 0 in backlog) |
| Environmental and Nutritional Pathology | staged 2026-11-11 (q740 to q741, 80; 0 in backlog) |
| Infancy and Childhood | staged 2026-11-11 (q747 to q748, 79; 1 in backlog) |
| Blood Vessels | staged 2026-11-11 (q751 to q752, 80; 0 in backlog) |
| Heart | staged 2026-11-12 (q758 to q759, 80; 0 in backlog) |
| Hematolymphoid Neoplasia | staged 2026-11-12 (q762 to q763, 80; 0 in backlog) |
| Red Cells and Hemostasis | staged 2026-11-12 (q766 to q767, 79; 1 in backlog) |
| Lung and Pleura | staged 2026-11-12 (q772 to q773, 78; 2 in backlog) |
| Head and Neck | staged 2026-11-12 (q774 to q775, 97; 3 in backlog; Upper Airway quiz is 8% hard, ask for hard replacements) |
| Gastrointestinal Tract | staged 2026-11-12 (q776 to q779, 4 quizzes of 40, 159; 1 in backlog) |
| Liver, Gallbladder, and Pancreas | staged 2026-11-12 (q780 to q783, 4 quizzes of 40, 159; 1 in backlog) |
| Kidney | staged 2026-11-12 (q784 to q787, 4 quizzes of 40, 158; 2 in backlog; Cystic quiz is 10% hard, ask for a hard replacement there if it gets one) |
| Lower Urinary and Male Genital Tract | staged 2026-11-12 (q788 to q789, 98; 2 in backlog) |
| Female Genital Tract and Gestational Disease | staged 2026-11-12 (q790 to q793, 4 quizzes of 40, 158; 2 in backlog) |
| Breast | staged 2026-11-12 (q794 to q795, 97; 3 in backlog) |
| Endocrine System | staged 2026-11-12 (q796 to q799, 4 quizzes of 40, 157; 3 in backlog; Thyroid quiz is 16% hard, ask for hard replacements) |
| Skin | staged 2026-11-12 (q800 to q801, 98; 2 in backlog; Inflammatory quiz is 12% hard, ask for a hard replacement) |
| Bones, Joints, and Soft Tissue | staged 2026-11-12 (q802 to q804, 3 quizzes of 40, 117; 3 in backlog; Joint quiz is 13% hard, ask for hard replacements) |
| Peripheral Nerves and Skeletal Muscle | staged 2026-11-12 (q805 to q806, 98; 2 in backlog) |
| Central Nervous System | staged 2026-11-12 (q807 to q811, 5 quizzes of 30, 148; 2 in backlog; Cerebrovascular and Infections are 10% hard, ask for a hard replacement in Cerebrovascular) |
| Eye | staged 2026-11-12 (q812 to q813, 98; 2 in backlog) |

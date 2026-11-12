# Pathology quizzes

Run with `/write-quizzes` (skill in `.agents/skills/write-quizzes/`). The user approved the blueprint on 2026-11-11 and the resize of the remaining topics on 2026-11-12.

- Work dir: `var/quiz-work/pathology/` (`blueprint.json`: 27 topics, 68 quizzes, 2,790 questions; `blueprint.before-resize.json` is the 2026-11-11 version)
- Sources: `~/Downloads/tn-pdfs/patho/handouts/*.pdf`, extracted to `src/`. Blueprint `pages` refer to `src/main.txt` (main handout, raw `pdftotext`, form-feed pages; `main-layout.txt` is layout mode). `src/flashcards.txt`, `src/flashcards-condensed.txt`, `src/buzzwords.txt` and `src/atlas.txt` (image captions only) are part of the minimum coverage map.
- Topics: the subject's 27 existing topics, all empty at the start, in handout (Robbins) chapter order. No topic merges.
- Sizing (user decision 2026-11-12): skill defaults, with as many quizzes as the topic needs (2 of 50, 3 to 4 of 40, 5+ of 30). The 14 topics staged before then have 2 quizzes of 40.
- Sessions: one topic per session, in the order of the status table. Then revisit the 14 earlier topics (resize or add quizzes to match), then the replacement batch and cleanup.

## Decisions

- Ownership (each quiz's `excludes` has the full list): organ-specific infections live in the organ topic (pneumonia in Lung, enteric infections in GI, hepatitis in Liver, meningitis, neurosyphilis and CNS toxoplasmosis in CNS, endocarditis in Heart, osteomyelitis in Bones, skin infections in Skin). Infectious Disease Pathology owns systemic infections, TB, leprosy, syphilis stages and aortitis, mycoses, parasites and STIs.
- Genetic Disorders owns inheritance, storage diseases and all inborn errors; cystic fibrosis is in Infancy; DMD and myotonic dystrophy clinical disease in Peripheral Nerves and Skeletal Muscle; DiGeorge in Immune; neurocutaneous syndromes (NF, TSC, VHL, Sturge-Weber) in CNS.
- Septic shock pathogenesis in Inflammation; other shock in Hemodynamic. Leukocytosis types and leukemoid reaction in Hematolymphoid, not Inflammation. Hemostasis and thrombosis in Hemodynamic; bleeding disorders, HIT, TTP/HUS and DIC in Red Cells. APS in Immune.
- Neoplasia owns paraneoplastic syndromes, general tumor markers and carcinogen mechanisms (HPV, EBV); organ topics own the organ lesions and germ cell marker profiles (Male Genital).
- Vitamins in Environmental and Nutritional, except rickets/osteomalacia (Bones), B12/folate and iron anemias (Red Cells). Wernicke in Nutrition. Lead in Environmental.
- Sturge-Weber diagnosis (port wine stain, leptomeningeal angioma, GNAQ) is staged in Blood Vessels (q752); CNS covers the other neurocutaneous syndromes and must not retest it.
- Diabetic nephropathy in Endocrine; diabetic neuropathy in PNS; diabetic retinopathy in Eye. Hemangiomas and Kaposi in Blood Vessels. Mycosis fungoides and MALT lymphoma in Hematolymphoid.
- The handout's post-test questions are not to be copied or paraphrased.

## Subject notes (for SUBJECT_NOTES)

Kept in the session scratchpad as `subject-notes.md`, with one `boundary-<topic>.md` per topic; rebuild from this section and the blueprint `excludes` in a new session.

- Audience: Philippine Physician Licensure Exam (PLE) and new physicians in the Philippines. Pathology is tested through pathogenesis, morphology (gross and microscopic buzzwords), markers and clinicopathologic correlation, mostly as short vignettes. Use current references: Robbins & Cotran Pathologic Basis of Disease (11th ed.), current WHO Classification of Tumours (5th ed.), AJCC 8th ed. staging, current consensus nomenclature (e.g. MASLD, pituitary neuroendocrine tumor, IDH-based glioma classification, WHO-HAEM5 names such as "extranodal NK/T-cell lymphoma" without "nasal type").
- Do not test superseded classifications kept in the handout as current (e.g. pre-2021 CNS tumor names, "NAFLD") except as "formerly called".
- Besides the brief's `source-<n>.txt`, grep `var/quiz-work/pathology/src/flashcards.txt`, `src/buzzwords.txt` and `src/atlas.txt` for your quiz's entities and cover their tested points.

## Status

| Topic | Status |
| --- | --- |
| Cell Injury and Adaptation | staged 2026-11-11 (q700 to q701, 77; 3 in backlog) |
| Inflammation and Repair | staged 2026-11-11 (q708 to q709, 78; 2 in backlog) |
| Hemodynamic Disorders | staged 2026-11-11 (q712 to q713, 79; 1 in backlog) |
| Genetic Disorders | staged 2026-11-11 (q716 to q717, 80; 0 in backlog) |
| Immune System Disorders | staged 2026-11-11 (q722 to q723, 79; 1 in backlog) |
| Neoplasia | staged 2026-11-11 (q730 to q731, 80; 0 in backlog) |
| Infectious Disease Pathology | staged 2026-11-11 (q736 to q737, 80; 0 in backlog) |
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
| Kidney | |
| Lower Urinary and Male Genital Tract | |
| Female Genital Tract and Gestational Disease | |
| Breast | |
| Endocrine System | |
| Skin | |
| Bones, Joints, and Soft Tissue | |
| Peripheral Nerves and Skeletal Muscle | |
| Central Nervous System | |
| Eye | |

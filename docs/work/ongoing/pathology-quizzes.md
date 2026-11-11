# Pathology quizzes

Run with `/write-quizzes` (skill in `.agents/skills/write-quizzes/`). The user approved the blueprint on 2026-11-11.

- Work dir: `var/quiz-work/pathology/` (`blueprint.json`: 27 topics, 54 quizzes, 2,160 questions)
- Sources: `~/Downloads/tn-pdfs/patho/handouts/*.pdf`, extracted to `src/`. Blueprint `pages` refer to `src/main.txt` (main handout, raw `pdftotext`, form-feed pages; `main-layout.txt` is layout mode). `src/flashcards.txt`, `src/flashcards-condensed.txt`, `src/buzzwords.txt` and `src/atlas.txt` (image captions only) are part of the minimum coverage map.
- Topics: the subject's 27 existing topics, all empty at the start, in handout (Robbins) chapter order. Sizing exception (user decision): every topic has exactly 2 quizzes of 40. No topic merges.
- Sessions: one topic per session, in the order of the status table, then the replacement batch and cleanup.

## Decisions

- Ownership (each quiz's `excludes` has the full list): organ-specific infections live in the organ topic (pneumonia in Lung, enteric infections in GI, hepatitis in Liver, meningitis, neurosyphilis and CNS toxoplasmosis in CNS, endocarditis in Heart, osteomyelitis in Bones, skin infections in Skin). Infectious Disease Pathology owns systemic infections, TB, leprosy, syphilis stages and aortitis, mycoses, parasites and STIs.
- Genetic Disorders owns inheritance, storage diseases and all inborn errors; cystic fibrosis is in Infancy; DMD and myotonic dystrophy clinical disease in Peripheral Nerves and Skeletal Muscle; DiGeorge in Immune; neurocutaneous syndromes (NF, TSC, VHL, Sturge-Weber) in CNS.
- Septic shock pathogenesis in Inflammation; other shock in Hemodynamic. Hemostasis and thrombosis in Hemodynamic; bleeding disorders, HIT, TTP/HUS and DIC in Red Cells. APS in Immune.
- Neoplasia owns paraneoplastic syndromes, general tumor markers and carcinogen mechanisms (HPV, EBV); organ topics own the organ lesions and germ cell marker profiles (Male Genital).
- Vitamins in Environmental and Nutritional, except rickets/osteomalacia (Bones), B12/folate and iron anemias (Red Cells). Wernicke in Nutrition. Lead in Environmental.
- Diabetic nephropathy in Endocrine; diabetic neuropathy in PNS; diabetic retinopathy in Eye. Hemangiomas and Kaposi in Blood Vessels. Mycosis fungoides and MALT lymphoma in Hematolymphoid.
- The handout's post-test questions are not to be copied or paraphrased.

## Subject notes (for SUBJECT_NOTES)

Kept in the session scratchpad as `subject-notes.md`, with one `boundary-<topic>.md` per topic; rebuild from this section and the blueprint `excludes` in a new session.

- Audience: Philippine Physician Licensure Exam (PLE) and new physicians in the Philippines. Pathology is tested through pathogenesis, morphology (gross and microscopic buzzwords), markers and clinicopathologic correlation, mostly as short vignettes. Use current references: Robbins & Cotran Pathologic Basis of Disease (11th ed.), current WHO Classification of Tumours (5th ed.), AJCC 8th ed. staging, current consensus nomenclature (e.g. MASLD, pituitary neuroendocrine tumor, IDH-based glioma classification).
- Do not test superseded classifications kept in the handout as current (e.g. pre-2021 CNS tumor names, "NAFLD") except as "formerly called".
- Besides the brief's `source-<n>.txt`, grep `var/quiz-work/pathology/src/flashcards.txt`, `src/buzzwords.txt` and `src/atlas.txt` for your quiz's entities and cover their tested points.

## Status

| Topic | Status |
| --- | --- |
| Cell Injury and Adaptation | staged 2026-11-11 (q700 to q701, 77; 3 in backlog) |
| Inflammation and Repair | |
| Hemodynamic Disorders | |
| Genetic Disorders | |
| Immune System Disorders | |
| Neoplasia | |
| Infectious Disease Pathology | |
| Environmental and Nutritional Pathology | |
| Infancy and Childhood | |
| Blood Vessels | |
| Heart | |
| Hematolymphoid Neoplasia | |
| Red Cells and Hemostasis | |
| Lung and Pleura | |
| Head and Neck | |
| Gastrointestinal Tract | |
| Liver, Gallbladder, and Pancreas | |
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

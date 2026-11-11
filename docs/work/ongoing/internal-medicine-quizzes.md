# Internal Medicine quizzes

Run with `/write-quizzes` (skill in `.agents/skills/write-quizzes/`). The user approved the blueprint on 2026-11-10.

- Work dir: `var/quiz-work/internal-medicine/` (`blueprint.json` is the approved plan: 19 topics, 49 quizzes, 2,180 questions)
- Sources: `~/Downloads/tn-pdfs/medicine/handouts/*.pdf`, extracted to `src/`. Blueprint `pages` refer to `src/main.txt` (main handout, raw `pdftotext`, form-feed pages; `main-layout.txt` is the same in layout mode). `src/buzzwords.txt` and `src/flashcards.txt` are part of the minimum coverage map.
- Topics: the subject's 19 existing topics, all empty at the start. Topics with 2 quizzes target 50 each, topics with 3 or 4 target 40.
- Sessions: one topic per session, in the order of the status table, then the replacement batch and cleanup.

## Decisions

- Ownership (each quiz's `excludes` has the full list): acute rheumatic fever in Systemic Autoimmune, rheumatic valve lesions and infective endocarditis in Valvular; general calcium and PTH disorders in Bone, hypercalcemia of malignancy in Oncology; SIADH in Electrolytes, diabetes insipidus in Pituitary, all of Cushing in Adrenal; APS in Allergology; severe cutaneous drug reactions in Dermatology, IgE drug allergy and urticaria in Allergology; syphilis in Dermatology; C. difficile in Infectious Diarrhea; alcohol withdrawal and delirium in Psychiatry; all lipid therapy in Obesity, Lipid and Bone; anticoagulant reversal and PE in Hypertension and VTE; AF anticoagulation in Arrhythmias.
- Psychiatry has one handout page; its second quiz has no source pages and comes from standard knowledge.
- Each topic's writer prompts get a "Topic boundary" block appended to the subject notes, built from the blueprint subtopics and `excludes`.

## Subject notes (for SUBJECT_NOTES)

Kept in the session scratchpad as `subject-notes.md`, with one `boundary-<topic>.md` per topic; rebuild from this section and the blueprint `excludes` in a new session.

- Audience: Philippine Physician Licensure Exam (PLE) and new physicians in the Philippines, adult internal medicine. Use current international guidelines (ACC/AHA, ESC, GOLD, GINA, KDIGO, ADA, IDSA, ACR/EULAR, AHA/ASA, WHO, CDC). Where a Philippine body sets national practice (DOH programs, NTP Manual of Procedures for TB, PSMID CAP and UTI guidelines, PSH/PHA hypertension, DOH HIV, rabies, dengue and malaria programs), use its current edition and name it in the stem or sources.
- Current classifications only (e.g. Fourth Universal Definition of MI, current GOLD and GINA reports, KDIGO staging, Sepsis-3, ILAE 2017, DSM-5-TR). Never test a retired scheme kept in the handout.
- Crossovers: adult diagnosis and medical management is the angle. An operative or pregnancy angle is allowed only when it is necessary and useful to an internist (e.g. when to refer for surgery, a chronic-disease drug that is unsafe in pregnancy), at most about 2 items per quiz, and never retesting a point already in Surgery or Obstetrics & Gynecology.
- Besides the brief's `source-<n>.txt`, grep `var/quiz-work/internal-medicine/src/buzzwords.txt` and `src/flashcards.txt` for your quiz's entities and cover their tested points.

## Status

| Topic | Status |
| --- | --- |
| Cardiovascular Medicine | staged 2026-11-10 (q645 to q647, 120) |
| Structural Heart Disease, Arrhythmia and Heart Failure | staged 2026-11-10 (q648 to q650, 120) |
| Pulmonology | staged 2026-11-10 (q658 to q659, 100) |
| Critical Care Medicine | staged 2026-11-11 (q664 to q665, 100) |
| Infectious Diseases | staged 2026-11-11 (q666 to q667, 100) |
| Enteric, Tropical and Zoonotic Infections | staged 2026-11-11 (q668 to q670, 120) |
| Dermatology | staged 2026-11-11 (q673 to q674, 100) |
| Hematology | staged 2026-11-11 (q678 to q680, 120) |
| Oncology | staged 2026-11-11 (q681 to q682, 100) |
| Gastroenterology | staged 2026-11-11 (q689 to q692, 159; 1 in backlog for Cirrhosis, Pancreatic and Biliary Disease) |
| Nephrology | staged 2026-11-11 (q702 to q705, 156; 4 in backlog: 1 Acid-Base, 2 Fluid and Electrolyte, 1 Acute and Chronic Kidney Disease) |
| Endocrinology | staged 2026-11-11 (q710 to q711, 100) |
| Thyroid, Pituitary and Adrenal Disorders | staged 2026-11-11 (q718 to q721, 159; 1 in backlog for Hypothyroidism, Thyroid Nodules and Cancer) |
| Obesity, Lipid and Bone Disorders | staged 2026-11-11 (q728 to q729, 100) |
| Rheumatology | |
| Systemic Autoimmune and Rheumatic Disease | |
| Allergology and Immunology | |
| Neurology | |
| Psychiatry | |

# Obstetrics & Gynecology quizzes

Run with `/write-quizzes` (skill in `.agents/skills/write-quizzes/`). The user approved the blueprint on 2026-11-10.

- Work dir: `var/quiz-work/obstetrics-gynecology/` (`blueprint.json` is the approved plan: 7 topics, 39 quizzes, 1,250 questions)
- Sources: `~/Downloads/tn-pdfs/ob/handouts/*.pdf`, extracted to `src/`. Blueprint `pages` refer to `src/main.txt` (main handout, raw `pdftotext`, form-feed pages; `main-layout.txt` is the same in layout mode). `src/buzzwords.txt` and `src/flashcards.txt` are part of the minimum coverage map.
- Topics: the subject's existing topics are used. The empty duplicates t239 (Reproductive Endocrinology) and t240 (Fertility and Contraception) were deleted (changes 72913, 72914). Their content goes into t209.
- Session split (3 sessions): 1 covers Obstetrics and Labor and Delivery. 2 covers Pregnancy Complications and Medical Disorders in Pregnancy. 3 covers Reproductive Endocrinology, Fertility and Contraception, Gynecology and Gynecologic Oncology, then cleanup.

## Decisions

- Infections: the pregnancy infection quizzes own pregnancy-specific points (treatment in pregnancy, congenital syphilis, HSV and cesarean, GBS). Gynecology's infection quizzes own diagnosis and nonpregnant treatment. BV partner treatment and chancroid basics are already staged in Microbiology & Parasitology.
- Pelvic anatomy lives in Obstetrics › Maternal Physiology and the Obstetric Pelvis. Leopold maneuvers, fetal lie and cardinal movements live in Labor and Delivery › Normal Labor and Delivery.
- Each topic's writer prompts get a "Topic boundary" block appended to SUBJECT_NOTES: which quiz owns which shared points, built from the blueprint subtopics and `excludes`.
- Already staged, don't retest: pelvic types, NST/CST/BPP and Doppler, hCG and dating, prenatal labs and vaccines, puerperal infections, mastitis, postpartum mood disorders, labor stages and active management of the third stage, FHR categories, labor arrest definitions (ACOG CPG 8), shoulder dystocia, ECV and previa, Bishop score, TOLAC, tocolysis, antenatal steroids, magnesium neuroprotection, PROM and PPROM by gestational age (ACOG PB 217), postterm induction.
- Session 2 starts with Pregnancy Complications (6 × 30), then Medical Disorders in Pregnancy (7 × 30).
- Antiphospholipid syndrome: Early Pregnancy Loss. Hepatitis B: Viral and Parasitic Infections. Benign ovarian neoplasms (teratoma, cystadenomas, fibroma/Meigs): Gynecology. Malignant ovarian tumors: Oncology.

## Subject notes (for SUBJECT_NOTES)

- Audience: Philippine Physician Licensure Exam (PLE) and new physicians in the Philippines. Use current ACOG, SMFM, RCOG, FIGO, WHO and CDC (STI 2021) guidance; where a Philippine DOH or POGS program sets national practice (family planning, maternal immunization, HIV, syphilis, TB), use its current edition and name it in the stem or sources.
- Current classifications only: FIGO 2018 cervical, FIGO 2023 endometrial, FIGO 2014 ovarian, FIGO 2000 GTN scoring, PALM-COEIN, NICHD three-tier FHR categories, ACOG Obstetric Care Consensus labor definitions (active phase from 6 cm), the 2022 ACOG/SMFM hypertension threshold for treatment in pregnancy, IADPSG 75-g OGTT thresholds alongside Carpenter-Coustan.
- Besides the brief's `source-<n>.txt`, grep `src/buzzwords.txt` and `src/flashcards.txt` (in the work dir) for your quiz's entities and cover their tested points.

## Status

| Topic | Status |
| --- | --- |
| Obstetrics | staged 2026-11-10 (q595 to q598, 160) |
| Labor and Delivery | staged 2026-11-10 (q607 to q611, 150) |
| Pregnancy Complications | |
| Medical Disorders in Pregnancy | |
| Reproductive Endocrinology, Fertility and Contraception | |
| Gynecology | |
| Gynecologic Oncology | |

# Pharmacology quizzes

Run with `/write-quizzes` (skill in `.agents/skills/write-quizzes/`). The user approved the blueprint on 2026-11-11.

- Work dir: `var/quiz-work/pharmacology/` (`blueprint.json` is the approved plan: 15 topics, 41 quizzes, 1,800 questions)
- Sources: `~/Downloads/tn-pdfs/pharm/handouts/*.pdf`, extracted to `src/`. Blueprint `pages` refer to `src/main.txt` (main handout, raw `pdftotext`, form-feed pages; `main-layout.txt` is layout mode). `src/flashcards.txt` and `src/addendum.txt` (mnemonics) are part of the minimum coverage map.
- Topics: the subject's 15 existing topics, all empty at the start. Topics with 2 quizzes target 50 each, topics with 3 or 4 target 40.
- Session split (6 sessions): 1 General, Autonomic and Ophthalmic, Cardiovascular and Renal. 2 Autacoids and Respiratory, Neuropsychopharmacology, Anesthesia and Pain. 3 Hematology, Anti-Inflammatory and Rheumatologic, Endocrine and Reproductive. 4 Antibacterial, Antifungal/Antiviral/Antiparasitic. 5 Cancer, Gastrointestinal. 6 Immunopharmacology, Toxicology, then cleanup.

## Decisions

- Ownership (each quiz's `excludes` has the full list): drug-specific poisonings stay with their class (organophosphates in Autonomic, digoxin in Cardiovascular, TCA and lithium in Neuropsychopharmacology, opioid overdose in Opioids, anticoagulant reversal in Hematology). Toxicology owns toxidromes, decontamination, acetaminophen, salicylate, iron and toxic alcohol poisoning, metals, gases and pesticides. Rheumatologic biologics and JAK inhibitors in DMARDs; transplant drugs, asthma biologics, MS drugs, complement inhibitors and thalidomide in Immunopharmacology; cancer antibodies and checkpoint inhibitors in Cancer. Hormonal cancer therapy in Sex Hormones. Prostaglandin uterotonics and misoprostol in Eicosanoids; oxytocin in Pituitary. Antiemetics in GI. Neuromuscular blockers in Anesthesia.
- Never test FDA pregnancy letter categories (retired 2015); test the specific teratogen or current labeling.
- Each topic's writer prompts get a "Topic boundary" block appended to the subject notes, built from the blueprint subtopics and `excludes`.

## Subject notes (for SUBJECT_NOTES)

Kept in the session scratchpad as `subject-notes.md`, with one `boundary-<topic>.md` per topic; rebuild from this section and the blueprint `excludes` in a new session.

- Audience: Philippine Physician Licensure Exam (PLE) and new physicians in the Philippines. Pharmacology is tested through mechanism, adverse effect, interaction, drug selection and toxicity, mostly as short clinical vignettes. Use current references (Katzung, Goodman & Gilman, current FDA/DailyMed labels) and current guidelines (ACC/AHA, ESC, KDIGO, ADA, GINA, GOLD, IDSA, WHO). Where a Philippine body sets national practice (DOH programs, NTP Manual of Procedures, Philippine National Formulary), use its current edition and name it.
- Never test withdrawn drugs as current therapy or retired schemes kept in the handout (FDA pregnancy letter categories, withdrawn agents). A withdrawn drug may appear only as the answer to "which was withdrawn for X" if it is high-yield.
- Besides the brief's `source-<n>.txt`, grep `var/quiz-work/pharmacology/src/flashcards.txt` and `src/addendum.txt` for your quiz's drugs and cover their tested points.

## Status

| Topic | Status |
| --- | --- |
| General Pharmacology | staged 2026-11-11 (q671 to q672, 100) |
| Autonomic and Ophthalmic Pharmacology | staged 2026-11-11 (q675 to q677, 120) |
| Cardiovascular and Renal Pharmacology | staged 2026-11-11 (q683 to q686, 160) |
| Autacoids and Respiratory Pharmacology | |
| Neuropsychopharmacology | |
| Anesthesia and Pain Pharmacology | |
| Hematology and Antithrombotic Pharmacology | |
| Anti-Inflammatory and Rheumatologic Pharmacology | |
| Endocrine and Reproductive Pharmacology | |
| Antibacterial and Antimycobacterial Pharmacology | |
| Antifungal, Antiviral, and Antiparasitic Pharmacology | |
| Cancer Pharmacology | |
| Gastrointestinal Pharmacology | |
| Immunopharmacology | |
| Toxicology and Antidotes | |

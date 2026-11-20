# "Most common" recall top-ups

Goal: fill the gap in general "most common / leading / principal X" recall questions (cause, adverse effect, complication, site, risk factor, route, reservoir). Measured on the draft: about 0.4% of stems ask it. "Most likely cause" vignettes identify the agent in one case and do not count.

Method: follow the [write-quizzes skill](../../../.agents/skills/write-quizzes/SKILL.md). Each batch is a top-up of one staged quiz (blueprint `add` with notes), not a new quiz. Never publish.

## Files (gitignored, `var/quiz-work/`)

- Gap lists: `most-common-gaps/{internal-medicine,pharmacology,preventive-medicine}.md`. Statuses came from keyword search: re-search a MISSING row before writing. Internal Medicine PARTIAL counts are inflated by acronym matches. Each file ends with "Done topics: unverified and skipped": add each staged topic's weak-source facts and skipped points there, not here, and check it before writing a neighboring topic.
- Work dirs per subject: `pharmacology/`, `preventive-medicine/` (Internal Medicine is cleaned up), each with `notes.md` for subagents and `replace-backlog.json` (`Q backlog`). Brief and batch numbers are the quiz's position in its topic.
- Rejected first attempt: `pharmacology/antibacterial-and-antimycobacterial-pharmacology/off-target/`. Do not reuse.
- Cross-subject stems: run `draft-outline` for every subject into the scratchpad each session and combine the stems into `cross-subject-stems.txt` (topic notes point writers to it). Line format `Subject › Topic › Quiz |  | stem`; the outline's `subject` is an object, use its `name`. Subjects: Anatomy & Histology, Biochemistry, Internal Medicine, Legal Medicine, Microbiology & Parasitology, Obstetrics & Gynecology, Pathology, Pediatrics, Pharmacology, Physiology, Preventive Medicine, Surgery.

Count the stems that match the required form before review. Preventive Medicine: 21 topics that need a primary source are listed in its gap file under "Needs primary source".

## Staged (not published)

Items added per quiz, about 2 to 10 each.

- Internal Medicine (all quizzes of each topic): Gastroenterology (Cirrhosis, Pancreatic and Biliary only), Dermatology (Skin Lesions only), Psychiatry (Psychotic and Mood only), Oncology (GI Cancers only), Structural Heart (both), Allergology (both), Thyroid/Pituitary/Adrenal, Enteric/Tropical/Zoonotic, Nephrology, Neurology, Obesity/Lipid/Bone, Pulmonology, Cardiovascular Medicine, Critical Care, Hematology, Infectious Diseases, Rheumatology, Systemic Autoimmune.
- Pharmacology: Protein Synthesis Inhibitors; Cardiovascular and Renal (Antihypertensives, Diuretics and Lipid-Lowering, Angina and Heart Failure, Antiarrhythmic); Neuropsychopharmacology, Cancer, Endocrine and Reproductive, Anesthesia and Pain, Toxicology and Antidotes, Antifungal/Antiviral/Antiparasitic, Hematology and Antithrombotic, Anti-Inflammatory and Rheumatologic, Immunopharmacology, Gastrointestinal, General Pharmacology, Autacoids and Respiratory (all quizzes); Antibacterial (Cell Wall, Antifolates; Antimycobacterial had no sourceable unstaged rows); Autonomic and Ophthalmic (Cholinergic, Adrenergic Antagonists and Glaucoma; Adrenergic Agonists had no gap rows).
- Preventive Medicine: Food- and Waterborne Diseases, Outbreak Investigation, Occupational Diseases; Communicable Disease (TB, COVID-19 and Respiratory, Vector-Borne; its other rows were already staged or had no fitting quiz).

## Remaining

1. User reviews and publishes in Review & publish.
2. Gap-list topics: done. Preventive Medicine Biostatistics skipped (its rows are not rankings a source states).
3. Run the replacement batch for each work dir's backlog ([replacements.md](../../../.agents/skills/write-quizzes/replacements.md)), then `Q clean`. Internal Medicine: done. Next: Pharmacology (15 slots), then Preventive Medicine (3).
4. When done, delete this tracker and `var/quiz-work/cross-subject-stems.txt`.

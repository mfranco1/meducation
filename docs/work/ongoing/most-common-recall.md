# "Most common" recall top-ups

Goal: fill the gap in general "most common / leading / principal X" recall questions (cause, adverse effect, complication, site, risk factor, route, reservoir). Measured on the draft: about 0.4% of stems ask it. "Most likely cause" vignettes identify the agent in one case and do not count.

Method: follow the [write-quizzes skill](../../../.agents/skills/write-quizzes/SKILL.md). Each batch is a top-up of one staged quiz (blueprint `add` with notes), not a new quiz. Never publish.

## Files (gitignored, `var/quiz-work/`)

- Gap lists: `most-common-gaps/{internal-medicine,pharmacology,preventive-medicine}.md`. Statuses came from keyword search: re-search a MISSING row before writing. Internal Medicine PARTIAL counts are inflated by acronym matches.
- Work dirs per subject: `internal-medicine/`, `pharmacology/`, `preventive-medicine/`. Brief and batch numbers are the quiz's position in its topic.
- Rejected first attempts: `internal-medicine/psychiatry/off-target/`, `pharmacology/antibacterial-and-antimycobacterial-pharmacology/off-target/`. Do not reuse.

## Subject notes for writers

- Required stem form: a direct stem, or a short vignette whose last line asks for the most common X. At least 8 of 10 new stems must ask it. Count matching stems before review.
- Key only what a primary document or standard textbook states. Where sources disagree on ranking (for example sedation versus weight gain), reword (principal, leading) or scope the population, or skip the point.
- Preventive Medicine: no current statistics, ranked leading causes of morbidity or mortality, or program schedules from memory. 21 such topics are listed in its gap file under "Needs primary source".
- Philippine audience: scope rankings Philippines, then region (Southeast Asia, Asia), then global. No US-only items. POGS before FIGO before ACOG for obstetrics.
- Grep `stems.txt` for the exact fact before skipping a point as "already staged", and name the matching stem.

## Status (pilot staged, not published)

| Quiz | Added | Quiz size |
| --- | --- | --- |
| Internal Medicine › Gastroenterology › Cirrhosis, Pancreatic and Biliary Disease | 10 | 50 |
| Internal Medicine › Dermatology › Skin Lesions, Inflammatory Dermatoses and Drug Eruptions | 10 | 60 |
| Internal Medicine › Psychiatry › Psychotic and Mood Disorders | 10 | 60 |
| Pharmacology › Antibacterial › Protein Synthesis Inhibitors | 7 | 47 |
| Preventive Medicine › Communicable Disease › Food- and Waterborne Diseases | 9 | 39 |
| Internal Medicine › Oncology › Gastrointestinal Cancers and Oncologic Emergencies | 10 | 60 |
| Pharmacology › Cardiovascular and Renal › Antihypertensive Drugs | 9 | 49 |
| Preventive Medicine › Epidemiology › Outbreak Investigation and Public Health Surveillance | 7 | 47 |

Two US-only surveillance items were dropped from the Epidemiology batch, not backlogged.

Replacement backlog: 3 Protein Synthesis Inhibitors (macrolide GI upset, macrolide respiratory use, clindamycin diarrhea; all near-duplicates of staged stems), 1 Antihypertensive Drugs (thiazide hypokalemia, near-duplicate of i25466), 1 Food- and Waterborne Diseases.

Unverified: Gastroenterology item 4 has no primary Philippine ranking (rewritten as a vignette). Psychiatry: cardiovascular versus lung cancer death rates (abstract only), SSRI nausea, lithium tremor, relapse precipitant. Preventive: mackerel as a scombroid fish. Oncology: thoracic spine in cord compression (secondary review), no documented source in most febrile neutropenia episodes, *H. pylori* as leading noncardia gastric risk factor (IARC summary), squamous cell predominance worldwide (NCI PDQ only). Antihypertensives: no item checked against a drug label (DailyMed unreachable); methyldopa positive antiglobulin test 10% to 20% has no cited source.

## Remaining

1. User reviews and publishes the pilot in Review & publish.
2. Next topics by gap-list rank. Internal Medicine: Structural Heart Disease and Arrhythmia, Allergology and Immunology, Thyroid/Pituitary/Adrenal, Enteric and Tropical Infections. Pharmacology: Diuretics and Lipid-Lowering (remaining Cardiovascular and Renal rows: loop, spironolactone, statin, amiodarone, digoxin), Neuropsychopharmacology, Cancer, Endocrine and Reproductive. Preventive Medicine: Biostatistics and Occupational Health; their gap rows are as thin as Epidemiology's, so expect short batches.
3. Run the replacement batch for the backlog ([replacements.md](../../../.agents/skills/write-quizzes/replacements.md)).
4. Delete this tracker when done.

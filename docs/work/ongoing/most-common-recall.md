# "Most common" recall top-ups

Goal: fill the gap in general "most common / leading / principal X" recall questions (cause, adverse effect, complication, site, risk factor, route, reservoir). Measured on the draft: about 0.4% of stems ask it. "Most likely cause" vignettes identify the agent in one case and do not count.

Method: follow the [write-quizzes skill](../../../.agents/skills/write-quizzes/SKILL.md). Each batch is a top-up of one staged quiz (blueprint `add` with notes), not a new quiz. Never publish.

## Files (gitignored, `var/quiz-work/`)

- Gap lists: `most-common-gaps/{internal-medicine,pharmacology,preventive-medicine}.md`. Statuses came from keyword search: re-search a MISSING row before writing. Internal Medicine PARTIAL counts are inflated by acronym matches.
- Work dirs per subject: `internal-medicine/`, `pharmacology/`, `preventive-medicine/`. Brief and batch numbers are the quiz's position in its topic.
- Rejected first attempts: `internal-medicine/psychiatry/off-target/`, `pharmacology/antibacterial-and-antimycobacterial-pharmacology/off-target/`. Do not reuse.

## Subject notes

Notes for subagents are in each work dir's `notes.md`. Count the stems that match the required form before review. Preventive Medicine: 21 topics that need a primary source are listed in its gap file under "Needs primary source".

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
| Internal Medicine › Structural Heart › Heart Failure, Pericardial and Peripheral Artery Disease | 10 | 50 |
| Pharmacology › Cardiovascular and Renal › Diuretics and Lipid-Lowering Drugs | 7 | 47 |
| Preventive Medicine › Occupational › Occupational Diseases, Physical Agents and Injury Prevention | 10 | 50 |
| Internal Medicine › Structural Heart › Arrhythmias and Resuscitation | 10 | 50 |
| Internal Medicine › Allergology › Anaphylaxis, Urticaria and Drug Allergy | 10 | 60 |
| Internal Medicine › Allergology › Allergic Rhinitis, Antiphospholipid Syndrome and Immunodeficiency | 10 | 60 |
| Internal Medicine › Thyroid, Pituitary and Adrenal › all four quizzes | 10 each | 50 each |
| Internal Medicine › Enteric, Tropical and Zoonotic › all three quizzes | 9, 10, 9 | 49, 50, 49 |
| Internal Medicine › Nephrology › all four quizzes | 9, 10, 10, 9 | 49, 50, 50, 49 |

Two US-only surveillance items were dropped from the Epidemiology batch, not backlogged.

Replacement backlog: 3 Protein Synthesis Inhibitors (macrolide GI upset, macrolide respiratory use, clindamycin diarrhea; all near-duplicates of staged stems), 1 Antihypertensive Drugs (thiazide hypokalemia, near-duplicate of i25466), 1 Food- and Waterborne Diseases, 1 Diuretics and Lipid-Lowering (statin muscle-symptom onset; its stem restated another item's key). 1 Infectious Diarrhea and Enteric Fever (Typhi reservoir, near-duplicate of the staged carrier-cook stem), 1 Malaria, Dengue and Schistosomiasis (dengue shock as cause of death, near-duplicate of the staged day-4 greatest-risk stem): replace with other points. 1 Acid-Base Disorders (shock as the cause of type A lactic acidosis, near-duplicate of the hospital lactic acidosis item), 1 Glomerular Disease (IgA-dominant infection-related GN, near-duplicate of a Pathology stem): replace with ranking points.

Cross-subject re-search: run `draft-outline` for every subject into the scratchpad and grep the combined stems (subject names: Anatomy & Histology, Biochemistry, Internal Medicine, Legal Medicine, Microbiology & Parasitology, Obstetrics & Gynecology, Pathology, Pediatrics, Pharmacology, Physiology, Preventive Medicine, Surgery).

Unverified: Gastroenterology item 4 has no primary Philippine ranking (rewritten as a vignette). Psychiatry: cardiovascular versus lung cancer death rates (abstract only), SSRI nausea, lithium tremor, relapse precipitant. Preventive: mackerel as a scombroid fish. Oncology: thoracic spine in cord compression (secondary review), no documented source in most febrile neutropenia episodes, *H. pylori* as leading noncardia gastric risk factor (IARC summary), squamous cell predominance worldwide (NCI PDQ only). Antihypertensives: no item checked against a drug label (DailyMed unreachable; openFDA now works, see fetch-access.md); methyldopa positive antiglobulin test 10% to 20% has no cited source. Heart Failure: coronary disease as the leading cause of HFrEF rests on textbooks (2022 AHA/ACC/HFSA says "a leading cause"); GBD heart failure shares read in abstract only. Arrhythmias: coronary disease as the leading cause of sudden cardiac death (ESC states it for the Western world only), fibrosis as the usual cause of sinus node dysfunction (2018 ACC/AHA/HRS read in a summary). Allergology: asthma as the lower airway disease most often coexisting with allergic rhinitis (no source cited), CVID diagnosis usually in the second to fourth decade (textbook). Thyroid/Pituitary/Adrenal: primary aldosteronism as the most common endocrine cause of secondary hypertension and glucocorticoid therapy as the most common cause of adrenal insufficiency (reviews only, no guideline ranks them), toxic nodular goiter as "leading" in older adults (Lancet review gives 50% in iodine-deficient areas overall), LHX3 neck rotation (summary only). Enteric: mild anicteric illness as the most common leptospirosis form and hepatosplenic disease as the main chronic *S. japonicum* complication (textbooks only). Skipped there: leading cause of death in leptospirosis (only a single-hospital series ranks it), principal Philippine malaria vector (varies by area), ETEC and rotavirus (staged as most-common items in Preventive Medicine and Microbiology). Skipped there because sources disagree: primary aldosteronism subtype, leading cause of death in acromegaly and in Cushing syndrome, gonadotroph lineage in nonfunctioning PitNETs, most common cause of central DI, nonadherence as the top cause of raised TSH on levothyroxine. Nephrology (textbook or review only): COPD as the leading cause of chronic respiratory acidosis, diarrhea as the top extrarenal NAGMA cause, Sjögren disease as the leading autoimmune cause of distal RTA, diabetic kidney disease as the usual setting of type 4 RTA, SIADH as the most common euvolemic hyponatremia cause, intradialytic hypotension as the most common acute hemodialysis complication (cited review says "one of"), coagulase-negative staphylococci in PD peritonitis (2012 review; ISPD 2022 paywalled; Thai data show more Gram-negative), diabetes as the leading cause of kidney failure scoped worldwide (Philippine registry unreachable). Skipped there: drug-induced AIN ranking (antibiotics and PPIs tied), CKD progression ranking, ureteral impaction site, struvite organism and radiolucent stone (staged in Anatomy or Pathology), thiazide hyponatremia (staged in Pharmacology).

## Remaining

1. User reviews and publishes the pilot in Review & publish.
2. Next topics by gap-list rank. Internal Medicine: Neurology, then Obesity, Lipid and Bone Disorders. Pharmacology: Antiarrhythmic Drugs (amiodarone) and Drugs for Angina and Heart Failure (digoxin), Neuropsychopharmacology, Cancer, Endocrine and Reproductive. Preventive Medicine: Biostatistics (3 thin rows, likely skip), then Communicable Disease's remaining rows. Skipped because sources don't rank them: restrictive cardiomyopathy cause, PAD lesion site, LQT1 versus LQT2, accessory pathway location, hypertension as the leading AF risk factor, most common secondary APS cause (SLE), most common SCIT adverse effect. Recurrent *Neisseria* with terminal complement deficiency is staged in Microbiology.
3. Run the replacement batch for the backlog ([replacements.md](../../../.agents/skills/write-quizzes/replacements.md)).
4. Delete this tracker when done.

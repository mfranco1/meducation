# Preventive Medicine quiz enlargement

Work dir: `var/quiz-work/preventive-medicine/`. Sources: none (medical knowledge and current Philippine laws and DOH/PhilHealth issuances; blueprint `pages` are unused).

## Scope

Enlarge every quiz in the 3- and 4-quiz topics from 30 to 40 items (31 quizzes, 310 new items). Each blueprint quiz has an `add` block with the 10 new items' subtopics; `add-proposal.json` lists each quiz's `gaps` (the points to test). Remove `add` after the topic is staged. Communicable Disease Prevention (6 quizzes, 30 each) is out of scope. Approved 2026-11-13.

Next session: run `slices` for the next pending topic (Occupational and Environmental Health), write its notes file (subject notes, the topic's boundary block from Decisions, and each quiz's `gaps`), then follow the skill from step 3.

## Decisions

- Priority: points with no staged stem first (each quiz's `gaps`), then deeper items in thin subtopics.
- Ownership across quizzes (also in `excludes`):
  - Vaccine efficacy computation: Epi › Study Designs. Levels of disease occurrence: Epi › Outbreak. R0, Rt and herd immunity threshold: Epi › Causation. Case fatality and mortality rates: Epi › Frequency.
  - Effect modification vs confounding: Biostat › EBM. Hazard ratios, survival analysis: Biostat › Statistics. Kappa and agreement: Biostat › Screening.
  - Disaster triage and mass casualty: Professional Practice › Patient Safety. Under-five and maternal mortality SDG targets: PHC › COPC and Development Goals.
  - GDM screening: Prevention › Life-Course. HBsAg screening in pregnancy: Prevention › Cancer and Infection Screening. Triple elimination: MCN › Maternal, Newborn and Child Health.
  - IPV screening: Prevention › Life-Course. RA 9262 and RA 7610 remedies: Family Medicine › Family as a Unit of Care.
  - Sin tax and provider payment incentives: UHC › Financing. Capitation: PHC › Managed Care. Moral hazard, supplier-induced demand, Mandanas and NTA: Professional Practice › Health Management. Hospital licensing levels: UHC › Service Delivery.
  - RA 10028 lactation stations: MCN › Nutrition. Starfield's attributes of primary care: PHC › COPC.
  - Disease-specific control programs (TB, dengue, malaria, rabies, HIV, food- and waterborne): Communicable Disease topic.

## Subject notes (SUBJECT_NOTES)

Top-up of staged quizzes: write only the `add` subtopics in the brief, testing the quiz's listed gaps first. Grep `stems.txt` for every point before writing it; the staged 30 items of the same quiz are the likeliest near-duplicates. Respect the ownership list. Philippine laws, DOH programs and PhilHealth rules must be current as of 2026; verify on the web (PhilHealth circulars, DOH AOs, official gazette).

## Status

| Topic | Status | Backlog |
| --- | --- | --- |
| Epidemiology and Population Health | staged (40/40/40/39) | 1 (incidence rate, Frequency) |
| Biostatistics and Evidence-Based Decisions | staged (40/40/40/40) | 0 |
| Prevention, Health Promotion, and Clinical Screening | staged (40/40/40) | 0 |
| Occupational and Environmental Health | pending | |
| Maternal, Child, Nutrition, and Immunization Programs | pending | |
| Primary Health Care and Community Medicine | pending | |
| Philippine Health Systems and Universal Health Care | pending | |
| Family Medicine, Communication, and Supportive Care | pending | |
| Professional Practice, Safety, and Public Health Administration | pending | |

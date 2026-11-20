# Flashcard audit

Goal: audit the 20,121 pre-skill flashcards for accuracy, currency, clarity and relevance, then top up thin topics. Follow the [write-flashcards skill](../../../.agents/skills/write-flashcards/SKILL.md): `audit: true` decks, one Sonnet reviewer per deck. Never publish.

Work dirs: `var/flashcard-work/<subject-slug>/` (gitignored).

## Decisions

- Order by risk: Internal Medicine, Pharmacology, Pediatrics, OB-GYN, Preventive Medicine, Legal Medicine, Surgery, Microbiology first. Anatomy, Biochemistry and Physiology last, possibly a lighter pass.
- Reviewers list correct-but-trivia existing cards in their summary; the user decides on deletes.
- Pilot first (Internal Medicine › Critical Care Medicine, 109 cards) to measure cost per card and hit rate.
- Coverage top-ups for THIN topics (26 by `D coverage`, 14 in Pathology) come after the audits, as normal write-flashcards work.
- Retired-term hits before audit: 18 cards (10 IM, 5 Biochemistry, 2 Pathology, 1 Micro); reviewers handle them in their decks.

## Status

- Pilot done: Critical Care, 109 cards, 12 edits (11%), 8 trivia or duplicate cards deleted. Reviewers kept reporting ledger-only doubts; the reviewer prompt now loads web tools up front and asks for URLs. Send back any reviewer that reports an unchecked doubt.
- Unresolved doubts: user rule is to follow the latest guideline; where it differs from the latest primary textbook, give both, labelled by name (now in content-standards Facts).
- Every correction carries AMA sources; `D build` refuses one without, and the gate warns on unnamed attributions. Earlier corrections are backfilled.
- Per topic: audit, then delete the reviewers' trivia and existing-duplicate cards on your own judgment (user approved; top-ups can add better cards). Ask only about cards whose fix rests on judgment, not a source. Add coverage gaps to Top-ups below.
- Internal Medicine: all 19 topics in `plan.json` as audit decks. Done: Cardiovascular Medicine; Structural Heart; Pulmonology; Infectious Diseases; Enteric, Tropical and Zoonotic Infections; Dermatology; Hematology; Oncology; Gastroenterology. Next: Nephrology. Run one IM topic per session to save context.

## Top-ups (after audits)

- THIN topics from `D coverage` (rerun before planning): Pathology 14; Internal Medicine: Psychiatry, Obesity Lipid and Bone, Allergology and Immunology; OB-GYN: Gynecology, Medical Disorders in Pregnancy; Pediatrics: Preventive Pediatrics, Growth and Development; one each in Anatomy (General Anatomy), Biochemistry (Genetics and Inheritance), Microbiology (Clinical Microbiology Integration), Pharmacology (Immunopharmacology), Preventive Medicine (Primary Health Care), Physiology (Integrated and Environmental).
- IM › Infectious Diseases: Urinary Tract Infection, Diagnostic Clues and COVID-19 decks are SMALL (12, 10, 4 cards).
- IM › Enteric, Tropical and Zoonotic Infections: Dengue subtopic has 0 cards (17 questions); Cholera 1 card, Amebiasis and Intestinal Protozoa 3.
- IM › Dermatology: Leprosy (6 questions) and Autoimmune Blistering Disease (7 questions) have 0 cards.
- IM › Hematology: `D coverage` shows 0 cards for Thalassemias, Thrombotic Microangiopathies and Myeloproliferative Neoplasms (heuristic; confirm before writing).
- IM › Oncology: `D coverage` shows few cards for Febrile Neutropenia (1), Other Oncologic Emergencies (2), Chemotherapy and Immunotherapy Toxicity (2), Paraneoplastic Syndromes (4) (heuristic; confirm before writing). No cancer-associated VTE card after the trivia delete.
- IM › Gastroenterology: Dyspepsia and Gastroparesis has 2 cards (4 questions); anal fissure card is vague (no posterior midline or sphincter spasm).
- IM › Critical Care: subtopics Supportive ICU Care (0 cards) and Vasopressors and Inotropes (2 cards).

## Staged (not published)

- IM › Critical Care Medicine: 12 edits, 8 deletes.
- IM › Cardiovascular Medicine: 21 edits, 22 deletes.
- IM › Structural Heart Disease, Arrhythmia and Heart Failure: 25 edits, 18 deletes.
- IM › Pulmonology: 24 edits, 9 deletes.
- IM › Infectious Diseases: 26 edits, 11 deletes.
- IM › Enteric, Tropical and Zoonotic Infections: 21 edits, 9 deletes.
- IM › Dermatology: 18 edits, 1 delete.
- IM › Hematology: 17 edits, 9 deletes.
- IM › Oncology: 9 edits, 4 deletes.
- IM › Gastroenterology: 23 edits, 5 deletes.
- Sources backfill: 47 edits (13 back changes, 1 front), 1 delete, across IM and 1 Biochemistry card.
- Full check of 16 weakly sourced cards: 12 edits (6 fact changes, 2 fronts), 1 duplicate deleted.

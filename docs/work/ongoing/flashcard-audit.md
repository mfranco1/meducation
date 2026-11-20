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
- Unresolved doubts: user rule is to follow the latest guideline; where it differs from the latest primary textbook, give both, labelled.
- Per topic: audit, then show the user the reviewers' trivia and existing-duplicate lists; delete only what the user approves. Add coverage gaps to Top-ups below.
- Internal Medicine: all 19 topics in `plan.json` as audit decks. Done: Cardiovascular Medicine; Structural Heart. Next: Pulmonology. Run one IM topic per session to save context.

## Top-ups (after audits)

- THIN topics from `D coverage` (rerun before planning): Pathology 14; Internal Medicine: Psychiatry, Obesity Lipid and Bone, Allergology and Immunology; OB-GYN: Gynecology, Medical Disorders in Pregnancy; Pediatrics: Preventive Pediatrics, Growth and Development; one each in Anatomy (General Anatomy), Biochemistry (Genetics and Inheritance), Microbiology (Clinical Microbiology Integration), Pharmacology (Immunopharmacology), Preventive Medicine (Primary Health Care), Physiology (Integrated and Environmental).
- IM › Critical Care: subtopics Supportive ICU Care (0 cards) and Vasopressors and Inotropes (2 cards).

## Staged (not published)

- IM › Critical Care Medicine: 12 edits, 8 deletes.
- IM › Cardiovascular Medicine: 21 edits, 22 deletes.
- IM › Structural Heart Disease, Arrhythmia and Heart Failure: 25 edits, 18 deletes.

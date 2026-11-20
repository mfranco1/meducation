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

- Pilot: running.

## Staged (not published)

(none yet)

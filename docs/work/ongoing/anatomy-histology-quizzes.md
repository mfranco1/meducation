# Anatomy & Histology quizzes

Run of the `write-quizzes` skill for the Anatomy & Histology subject. Work dir: `var/quiz-work/anatomy-histology/` (blueprint approved 2026-11-05; source text extracted to `src/`).

## Scope and decisions

- All 14 topics, 39 quizzes, about 1,650 questions. Sources: `~/Downloads/tn-pdfs/anat_histo/handouts/*.pdf`; the main handout's page ranges are in `blueprint.json`.
- Sizing follows the skill's default (2 quizzes: 50, 3 to 4: 40, 5 or more: 30).
- Deconfliction is recorded in each quiz's `excludes`.

## Subject notes (for `SUBJECT_NOTES`)

- `src/brs.txt`, `src/mainfc.txt` (flashcards) and `src/buzz.txt` (buzzwords) are supplementary; grep them for your subtopics.
- Anatomy facts are mostly stable textbook facts: leave `rationaleMeta.sources` empty for those, and verify on the web only what depends on a recent guideline or classification.

## Remaining steps

Session 1 (done): General Anatomy, Histology, Organ System Histology, Head and Neck, Neuroanatomy.
Session 2: Special Senses, Thorax, Abdominal Wall and Peritoneum, Abdomen, Pelvis and Perineum.
Session 3: Female Reproductive System, Upper Limb, Lower Limb, Back and Spinal Cord, then `clean` and delete this tracker.

## Status

- General Anatomy: staged (2 quizzes, 100 items).
- Histology: staged (2 quizzes, 100 items).
- Organ System Histology: staged (3 quizzes, 120 items).
- Head and Neck: staged (4 quizzes, 160 items).
- Neuroanatomy: staged (2 quizzes, 100 items).

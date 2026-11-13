# Surgery quizzes: enlarge 3- and 4-quiz topics to 40

Work dir: `var/quiz-work/surgery/`. No source documents: medical knowledge only.

## Scope

Every quiz in the 10 topics with 3 or 4 quizzes grows from 30 to 40 items (33 quizzes, 330 new items). Each quiz's blueprint entry has `target: 40` and an `add` block of 10 items whose `notes` name the specific points to test, gaps first. Remove each `add` after its topic is staged.

## Decisions

- Uncovered or thin points come before deeper angles on covered points.
- Metabolic acidosis after urinary diversion: Urologic Surgery › Genitourinary Cancers, not Fluids.
- Fat embolism syndrome: Trauma › Extremity, Vascular and Maxillofacial Trauma, not Orthopedic Fractures.
- Perioperative VTE prophylaxis: Surgical Foundations › Hemostasis, Transfusion and Perioperative Care.
- MEN1 parathyroid surgery: Endocrine › Parathyroid and Adrenal Disease.
- Thoracic outlet syndrome (arterial, neurogenic): Vascular › Arterial Occlusive Disease; effort thrombosis: Vascular › Venous.
- Septic hip vs transient synovitis: Orthopedics › Pediatric Orthopedics; VUR: Urology › Urinary Stones, Obstruction and Trauma.

## Subject notes (for SUBJECT_NOTES)

- Each brief covers only the 10 new items. Read the quiz's 30 staged stems in `stems.txt` first and don't retest them.
- Follow the `notes` in the brief's `add` for what each new subtopic item tests.
- Stay inside the quiz's `excludes`; many name points owned by other Surgery topics.

## Status

| Topic | Status | Backlog |
| --- | --- | --- |
| Surgical Foundations | staged (40 per quiz) | 0 |
| Trauma and Emergency Surgery | staged (40, 40, 39, 40) | 1 |
| Endocrine Surgery | | |
| Small Bowel and Appendix | | |
| Colorectal and Anorectal Surgery | | |
| Thoracic and Cardiac Surgery | | |
| Vascular Surgery | | |
| Pediatric Surgery | | |
| Orthopedic Surgery | | |
| Urologic Surgery | | |

One topic per session, in table order.

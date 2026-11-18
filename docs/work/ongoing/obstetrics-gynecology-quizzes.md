# Obstetrics & Gynecology quizzes: top up every quiz to 50

Work dir: `var/quiz-work/obstetrics-gynecology/`. No source documents: medical knowledge only.

## Scope

All 39 quizzes in 7 topics grow to 50 items (user sizing overrides the skill default). Each quiz's blueprint entry has `target: 50` and an `add` block whose `notes` name the points to test. Remove each `add` after its topic is staged. Original blueprint backed up as `blueprint.orig.json`. Blueprint and coverage summary (`coverage-summary.md`) approved 2026-11-18. Notes for Rubella and Zika got no new items; Viral and Parasitic Infections is thin by design.

## Decisions

- PMOS everywhere, with no "formerly called" note (currency-notes.md row updated). Existing questions and cards in every subject were converted in the draft (actor `agent:write-quizzes`); published guideline and citation titles keep "polycystic ovary syndrome".
- Cite POGS, FIGO and ACOG where they set the recommendation; SMFM, WHO, USPSTF, ASCCP, NCCN where they are the actual authority.

## Subject notes (for SUBJECT_NOTES)

- Each brief covers only the new items. Read the quiz's staged stems in `stems.txt` first and don't retest them.
- Follow the `notes` in the brief's `add` for what each new subtopic item tests.
- Stay inside the quiz's `excludes`; many name points owned by other OB-GYN topics.
- Write PMOS (polyendocrine metabolic ovarian syndrome), never PCOS, and never mention the former name.
- Where a recommendation comes from a guideline, cite the body that sets it in `rationaleMeta.sources`: ACOG, FIGO or POGS (Philippine Obstetrical and Gynecological Society) where they apply, otherwise SMFM, WHO, USPSTF, ASCCP or NCCN. When ACOG refuses the fetch, see fetch-access.md.
- POGS: the blueprint notes cite none. For each guideline-dependent point, search for a current POGS clinical practice guideline; cite it beside ACOG or FIGO only when you find and confirm the recommendation. Never attribute a recommendation to POGS from memory.
- Gynecologic Oncology notes name trials (KEYNOTE-A18, SHAPE, GROINSS-V): follow the item-standards trial rule.

## Status

| Topic | Status | Backlog |
| --- | --- | --- |
| Obstetrics | blueprint approved (+40) | |
| Labor and Delivery | | |
| Pregnancy Complications | | |
| Medical Disorders in Pregnancy | | |
| Reproductive Endocrinology, Fertility and Contraception | | |
| Gynecology | | |
| Gynecologic Oncology | | |

One topic per session, in table order.

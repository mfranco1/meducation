# Obstetrics & Gynecology quizzes: top up every quiz to 50

Work dir: `var/quiz-work/obstetrics-gynecology/`. No source documents: medical knowledge only.

## Scope

All 39 quizzes in 7 topics grow to 50 items (user sizing overrides the skill default). Each quiz's blueprint entry has `target: 50` and an `add` block whose `notes` name the points to test. Remove each `add` after its topic is staged. Original blueprint backed up as `blueprint.orig.json`. Blueprint and coverage summary (`coverage-summary.md`) approved 2026-11-18. Notes for Rubella and Zika got no new items; Viral and Parasitic Infections is thin by design.

## Decisions

- PMOS everywhere, with no "formerly called" note (currency-notes.md row updated). Existing questions and cards in every subject were converted in the draft (actor `agent:write-quizzes`); published guideline and citation titles keep "polycystic ovary syndrome".
- Source priority: POGS, then FIGO, then ACOG (still acceptable); SMFM, WHO, USPSTF, ASCCP, NCCN only where none of the three addresses the point. Key the POGS or FIGO position where they differ from ACOG.
- Induced abortion is illegal in the Philippines: no item keys elective termination, termination for anomaly or selective reduction. Postabortion care and management of spontaneous loss and fetal death stay in scope.

## Subject notes (for SUBJECT_NOTES)

- Each brief covers only the new items. Read the quiz's staged stems in `stems.txt` first and don't retest them.
- Follow the `notes` in the brief's `add` for what each new subtopic item tests.
- Stay inside the quiz's `excludes`; many name points owned by other OB-GYN topics.
- Write PMOS (polyendocrine metabolic ovarian syndrome), never PCOS, and never mention the former name.
- Source priority (the audience trains under POGS rules): POGS first, then FIGO, then ACOG. ACOG stays an acceptable source. Use SMFM, WHO, NICE, USPSTF, ASCCP or NCCN only where none of the three addresses the point. Where POGS or FIGO differs from ACOG, key the POGS or FIGO position and cite it in `rationaleMeta.sources`. When ACOG refuses the fetch, see fetch-access.md.
- POGS: search for a current POGS clinical practice guideline for each guideline-dependent point; cite it only when you find and confirm the recommendation. Never attribute a recommendation to POGS from memory.
- Induced abortion is illegal in the Philippines. No item keys or offers as correct management an elective termination, a termination for fetal anomaly or selective fetal reduction. Management of spontaneous loss, fetal death and complications of an unsafe abortion (postabortion care) is in scope.
- Gynecologic Oncology notes name trials (KEYNOTE-A18, SHAPE, GROINSS-V): follow the item-standards trial rule.

## Status

| Topic | Status | Backlog |
| --- | --- | --- |
| Obstetrics | staged (+39; Prenatal Care 49) | 1 (Prenatal Care: IOM weight gain dropped as near-duplicate) |
| Labor and Delivery | staged (+96; FHR 50, others 49) | 4 (near-duplicates of staged items: perineal warm compresses, ripening regimen choice, PPROM latency antibiotics; prolonged-labor atony duplicated Induction) |
| Pregnancy Complications | staged (+114; GTD and Fetal Growth 50, Ectopic and Rh 49, PPH 48, APH 47) | 7 (6 near-duplicates of staged items: misoprostol regimen, previa ultrasound, low-lying placenta, impending rupture, septic abortion, calcium for magnesium; 1 staged selective-reduction item deleted under the abortion rule) |
| Medical Disorders in Pregnancy | staged (+137; all 7 quizzes at 50) | 0 |
| Reproductive Endocrinology, Fertility and Contraception | staged (+120; all 6 quizzes at 50) | 0 |
| Gynecology | | |
| Gynecologic Oncology | | |

One topic per session, in table order.

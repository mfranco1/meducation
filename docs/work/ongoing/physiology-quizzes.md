# Physiology quiz enlargement

Work dir: `var/quiz-work/physiology/`. Sources: none (medical knowledge only; blueprint `pages` are unused).

## Scope

Enlarge every quiz in the 3- and 4-quiz topics from 30 to 40 items (23 quizzes, 230 new items). Each blueprint quiz has an `add` block with the 10 new items' subtopics. Remove `add` after the topic is staged. 2-quiz topics (50 each) are out of scope.

Next session: run `slices` for the next pending topic, write its notes file (boundary block from Decisions), then follow the skill from step 3.

## Decisions

- Priority: subtopics with no staged stems first (new subtopics in each `add`), then deeper items in thin existing subtopics.
- Ownership across topics (also in each quiz's `excludes`):
  - Hypothalamic feeding centers, limbic system, circadian rhythm and melatonin: Neuro › Motor Systems and Higher Functions. Leptin, ghrelin, incretin hormone actions: Endocrine › Pancreatic Hormones. GI actions and release of gut hormones: GI › Regulation and Motility.
  - Visual field defects and pupillary reflexes: Neuro › Sensory. Neglect, aphasia, cortical deficits: Neuro › Motor and Higher.
  - Cardiovascular reflexes and Valsalva: CV › Hemodynamics. Shock and coronary flow: CV › Microcirculation. Myocardial O2 demand: CV › Cardiac Cycle. Potassium and calcium ECG changes: CV › ECG.
  - CO, methemoglobin, cyanide, O2 curve and 2,3-BPG: Resp › Gas Exchange. Hemoglobin variants and red cell disorders: Blood › Blood Cells.
  - ACE inhibitor bradykinin effects: CV › Microcirculation.
  - Hyponatremia and hypernatremia: Renal › Electrolytes. Prerenal vs intrinsic AKI: Renal › Body Fluids. Compensation formulas and mixed disorders: Renal › Acid-Base. RTA types: Acid-Base › Renal Regulation.
  - Peptic ulcer, ZES: GI › Secretions. Motility disorders: GI › Regulation and Motility. B12 and folate absorption: GI › Digestion; iron and anemias: Blood.
  - Metabolic bone disease and PTH/vitamin D actions on bone: Endocrine › Pancreatic Hormones, Calcium and Bone.

## Subject notes (SUBJECT_NOTES)

Top-up of staged quizzes: write only the `add` subtopics in the brief. Grep `stems.txt` for every point before writing it; the staged 30 items of the same quiz are the likeliest near-duplicates. Respect the ownership list above.

## Status

| Topic | Status | Backlog |
| --- | --- | --- |
| Neurophysiology | staged (39/40/40) | 1 (ANS central control) |
| Cardiovascular Physiology | staged (40/40/40/40) | 0 |
| Respiratory Physiology | staged (40/40/39) | 1 (nonrespiratory lung functions) |
| Renal and Acid-Base Physiology | staged (39/39/40/40) | 2 (fluid shifts; proximal tubule) |
| Gastrointestinal Physiology | staged (40/39/40) | 1 (Secretions: replace antrectomy-gastrin near-duplicate) |
| Endocrine Physiology | pending | |
| Blood and Immune Physiology | pending | |

# Physiology quizzes

Filling the 11 empty Physiology topics with the `write-quizzes` workflow: 31 quizzes (1,090 items). Sources (minimum coverage only): `~/Downloads/tn-pdfs/physio/handouts/*.pdf`, with extracted text in the work dir under `src/` (`pages/pNNN.txt` for the main handout, plus `buzz.txt` and `flash.txt`, which follow the same module order). Each blueprint quiz has a `pages` range in the main handout.

Work dir: `var/quiz-work/physiology/` (blueprint with `excludes`, outline, source ledger, staged stems).

## Decisions

- Topics with 3 or more quizzes: 30 questions per quiz (run `apply --min 30`; ignore the gate's 50-to-100 size warning). Topics with 2 quizzes: 50 per quiz.
- Placement: NMJ in Skeletal Muscle; cardiac E-C coupling in Cardiac and Smooth Muscle, cardiac APs in Cardiac Electrophysiology; all ADH in Renal, oxytocin in Female Reproduction; renal aldosterone actions in Renal, adrenal disorders in Endocrine; iron in Blood, other vitamins and minerals in GI; cerebral blood flow in Microcirculation; temperature and altitude in Integrated and Environmental; fetal oxygen delivery in Female Reproduction.
- Blind solvers must not run `check-blind` or open other work files; the orchestrator runs it. (A solver once changed answers after seeing the agreement rate.)
- Tell writers and standards passes: rationales 100 to 250 words, no absolute words in choices, correct choice not the longest, Recall at most 30% per quiz, plain text (no `<sub>`) in choices.
- Reviews use the bare filenames with `apply` (e.g. `review-standards.json`), not paths. For a later one-item judgment, back up `escalated.json`, write only that ref, then run `judge-input`.

## Progress

- Staged (session 1): Cellular (100), Muscle (100), Neurophysiology (90), Cardiovascular (120), Respiratory (90), Renal and Acid-Base (120). 620 items.
- Session 2: topics 7 to 11 (GI, Endocrine, Reproductive, Blood and Immune, Integrated and Environmental), 470 items. GI and Endocrine staged (180). Reproductive (100) in judgment, 2 replacements pending. Blood and Immune (90) blind done, standards next. Integrated and Environmental: both quizzes being written. Run `slices` before each later topic to refresh `stems.txt`.
- For the user to check: cardiomyocyte mitochondrial volume "25 to 30%" (Cardiac and Smooth Muscle; textbooks often say 30 to 40%).
- Unverified (blocked): ICSD-3-TR narcolepsy cutoffs and NICE NG217 drug choices, so those claims were removed from Motor Systems items 23 and 24.
- After the last topic is staged: run `clean` and delete this tracker.

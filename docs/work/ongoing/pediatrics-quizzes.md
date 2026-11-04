# Pediatrics quizzes

Filling the 13 empty Pediatrics topics with the `write-quizzes` workflow: 40 quizzes of 50 questions (2,000 items). Sources (minimum coverage only): `~/Downloads/tn-pdfs/pedia/handouts/*.pdf`, with extracted page text in the work dir under `src/` (`pages/pNNN.txt`, `buzz.txt`, `flash.txt`). Each blueprint quiz has a `pages` range.

Work dir: `var/quiz-work/pediatrics/` (blueprint with `excludes`, outline, source ledger).

## Decisions

- 50 questions per quiz, to match Neonatology. 4 to 6 weighted subtopics per quiz.
- Philippine board audience: name the local guideline where practice is regional (IMCI, DOH rabies PEP, PPS/DOH dengue, PAPP PCAP, NTP TB). Otherwise use current AAP, WHO, GINA and ILAE guidance.
- Placement: meningitis in Neurology, TB and pertussis in Pulmonology, typhoid in Gastroenterology.

## Progress

- Phase 1 staged (1,150 items): Nutrition, Preventive, Growth and Development, Gastroenterology, Nephrology, Hematology and Oncology, Neurology. Awaiting user review and publish.
- Phase 2 not started: Pulmonology (3), Rheumatology (2), Cardiology (3), Infectious Diseases (4), Endocrinology (3), Immunology and Allergy (2). Refresh the outline and run `slices` per topic before writing.

## Open checks for the user

- DOH rabies rules (AO 2026-0010 and the 2025 animal-bite CPG) could not be confirmed; no staged item depends on them.
- Phase 1 items edited after their recheck without another blind solve: Gastroenterology › Liver, Pancreas and Functional Disorders › 15 and Nephrology › Hematuria and Glomerulonephritis › 42. Nephrology › Kidney Injury and Electrolyte Disorders › 5 kept a key the recheck found arguable.

# Surgery quizzes

Filling the 26 empty Surgery topics with the `write-quizzes` workflow: 64 quizzes (2,540 items). Sources (minimum coverage only): `~/Downloads/tn-pdfs/surg/handouts/*.pdf`, with extracted text in the work dir under `src/` (`pages/pNNN.txt` for the main handout, plus `buzz.txt`, `absite.txt`, `flash.txt`, `rush.txt`). Each blueprint quiz has a `pages` range in the main handout.

Work dir: `var/quiz-work/surgery/` (blueprint with `excludes`, outline, source ledger).

## Decisions

- Topics with 3 or more quizzes: 30 questions per quiz (run `apply --min 30`; ignore the gate's 50-to-100 size warning). Topics with 1 or 2 quizzes: 50 per quiz. Splenic Surgery has 1 quiz.
- Philippine board audience: name the local guideline where practice is regional. Otherwise use current international guidance (ATLS 11th ed., NCCN, AJCC 8th, Tokyo Guidelines 2018, WSES, ASMBS/IFSO 2022).
- Metabolic and Bariatric Surgery and adrenal disease are absent from the sources; written from current guidance.
- Placement: TBI and spinal cord injury, abdominal compartment syndrome, extremity compartment syndrome, facial fractures and massive transfusion in Trauma; GU trauma in Urology; NSTI, hidradenitis and pilonidal disease in Burns and Soft-Tissue Emergencies; Meckel diverticulum and biliary atresia in Pediatric Surgery; choledochal cyst and gallstone ileus in Biliary; all mesenteric ischemia in Small Bowel; aorta in Vascular; degenerative spine and nerve entrapment in Neurosurgery; pressure injuries in Reconstructive.

## Progress

- Blueprint approved. Session 1 scope: topics 1 to 9 (Surgical Foundations through Esophageal Surgery). Topics 10 to 26 go to later sessions.
- Staged: Surgical Foundations (120; sepsis items follow SSC 2026).
- In progress: Trauma (in review), Burns (writing), Head and Neck (writing).
- Reviews use the bare filenames with `apply` (e.g. `review-standards.json`), not paths.

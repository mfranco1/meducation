# Surgery quizzes

Filling the 26 empty Surgery topics with the `write-quizzes` workflow: 64 quizzes (2,540 items). Sources (minimum coverage only): `~/Downloads/tn-pdfs/surg/handouts/*.pdf`, with extracted text in the work dir under `src/` (`pages/pNNN.txt` for the main handout, plus `buzz.txt`, `absite.txt`, `flash.txt`, `rush.txt`). Each blueprint quiz has a `pages` range in the main handout.

Work dir: `var/quiz-work/surgery/` (blueprint with `excludes`, outline, source ledger). Subagent instructions: `prompts/writer.md` (writers) and `prompts/reviewers.md` (blind solve, standards, replacements, judgment).

## Decisions

- Topics with 3 or more quizzes: 30 questions per quiz (run `apply --min 30`; ignore the gate's 50-to-100 size warning). Topics with 1 or 2 quizzes: 50 per quiz. Splenic Surgery has 1 quiz.
- Philippine board audience: name the local guideline where practice is regional. Otherwise use current international guidance (ATLS 11th ed., NCCN, AJCC 8th, Tokyo Guidelines 2018, WSES, ASMBS/IFSO 2022).
- Metabolic and Bariatric Surgery and adrenal disease are absent from the sources; written from current guidance.
- Placement: TBI and spinal cord injury, abdominal compartment syndrome, extremity compartment syndrome, facial fractures and massive transfusion in Trauma; GU trauma in Urology; NSTI, hidradenitis and pilonidal disease in Burns and Soft-Tissue Emergencies; Meckel diverticulum and biliary atresia in Pediatric Surgery; choledochal cyst and gallstone ileus in Biliary; all mesenteric ischemia in Small Bowel; aorta in Vascular; degenerative spine and nerve entrapment in Neurosurgery; pressure injuries in Reconstructive.

## Progress

- Session 1 done: topics 1 to 9 staged (930 items): Surgical Foundations (120), Trauma (120), Burns (100), Head and Neck (100), Endocrine (90), Breast (100), Skin (100), Hernias (100), Esophageal (100). Awaiting user review and publish.
- Session 2 done: topics 10 to 17 staged (760 items): Gastric and Duodenal (100), Metabolic and Bariatric (100), Hepatic (100), Gallbladder and Biliary (100), Pancreatic (100), Splenic (50), Small Bowel and Appendix (90), Colorectal and Anorectal (120). Awaiting user review and publish.
- Next session: topics 18 to 26. Refresh the outline, then run `slices` per topic.
- Workflow notes: pass review files to `apply` as bare filenames; use `--min 30` for 30-item topics. Writers must move choice text when rebalancing letters (one batch had `answer` changed alone). Writers often skip the self-check; send them back. To re-judge items after a recheck, write a fresh `escalated.json` and run `judge-input` (it marks them judged as is; entries need a `reasons` array). Replacement writers sometimes nest `metadata`/`rationaleMeta`; `apply` needs dotted keys. A blind round can't be rebuilt under the same name; delete it if it has no answers. Blind solvers must not run `quiz_work.py` or open work files (now in `prompts/reviewers.md`); confirm the answers file exists before `check-blind` (one solver reported a file it never wrote). When a recheck keeps flagging a guideline-variant distractor, swap the distractor for a clearly wrong one.
- Current guidance used: SSC 2026 (sepsis), 2025 ATA DTC (thyroid cancer; 2015 ATA still the nodule guideline), 2022 EHS/AHS (abdominal closure), ACG 2022 (GERD, Barrett), ESOPEC 2025 (perioperative FLOT), ASH 2026 (ITP), Baveno VII and BCLC 2022 (liver), Kyoto 2024 (IPMN), ENETS 2025 (gastric NET), MELD 3.0, CDC 2025 adult schedule (asplenia).

## Open checks for the user

- Primary text unreachable, facts tested without unconfirmed numbers: ATLS 11th manual, EAST/WTA neck trauma, BI-RADS Atlas, AJCC 8th manual (used via NCI PDQ), ESMO 2021 sarcoma, AAP 2019 hemangioma, Merkel cell guideline, desmoid consensus, SAGES hiatal hernia, ESGE caustic and stenting, ACOG 2017 imaging in pregnancy.
- Session 2, primary text unreachable (summaries or abstracts only): Tokyo Guidelines 2018 criteria and grading, ACG 2024 H. pylori full text, MAPS II, ESMO 2020 MALT lymphoma, ENETS 2023 pancreatic NET, NCCN pancreatic resectability, ESPEN 2023 intestinal failure, PSOGI 2016, CODA full text, ERAS 2018, ACG 2023 lower GI bleeding, ASCRS hemorrhoid, fissure and prolapse guidelines, SVS 2020 visceral aneurysm, ESGE ampullary 2021, ASGE 2023 post-ERCP pancreatitis.

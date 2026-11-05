# Preventive Medicine quizzes

Filling the 9 empty Preventive Medicine topics (2 to 10) with the `write-quizzes` workflow: 33 quizzes (990 items). Topic 1 (Epidemiology and Population Health) was already staged. Sources (minimum coverage only): `~/Downloads/tn-pdfs/prev_med/handouts/*.pdf`, with extracted text in the work dir under `src/` (`pages/pNNN.txt` for the main handout, plus `buzz.txt`, `flash.txt`, `uhc.txt` for the UHC Act IRR). Each blueprint quiz has a `pages` range in the main handout.

Work dir: `var/quiz-work/preventive-medicine/` (blueprint for all 10 topics with `excludes`, outline, source ledger). Subagent instructions: `prompts/writer.md` (writers) and `prompts/reviewers.md` (blind solve, standards, replacements, judgment).

## Decisions

- 30 questions per quiz (every topic has 3 or more quizzes). Run `apply --min 30`; ignore the gate's 50-to-100 size warning.
- Philippine programs, laws and DOH/PhilHealth guidance are the default frame; otherwise current WHO, USPSTF and CDC guidance. Where a DOH rule can't be read in primary text, test the stable WHO-level principle instead.
- Placement: child vaccine schedule in topic 6, adult vaccines in topic 3, rabies PrEP in topic 5; child rehydration plans (IMCI) in topic 6, adult diarrhea in topic 5; water and community waste in topic 4, health care waste in topic 10; census stays in topic 1; herbal medicine in topic 7.

## Progress

- Session 1 done: topics 2 to 6 staged (570 items): Biostatistics (120), Prevention and Screening (90), Occupational and Environmental (90), Communicable Disease (180), Maternal, Child, Nutrition and Immunization (90). Awaiting user review and publish.
- Next session: topics 7 to 10 (14 quizzes, 420 items): Primary Health Care, Philippine Health Systems and UHC, Family Medicine, Professional Practice. Refresh the outline, then run `slices` per topic.
- Workflow notes:
  - Pass the `--refs` path to `blind` in full (`<work>/<topic>/rewritten-reviewed.json`).
  - Standards reviewers tend to fix only the gate-flagged items; tell them to review every item.
  - Writers skip the Pass 2 self-check unless told it is mandatory.
  - Retire writers after about 2 briefs; resumed contexts grow past 250k tokens.
  - Writing the few replacements and judging single recheck items yourself is cheaper than a subagent.
  - To accept a recheck item as is, write `escalated.json` with `reasons` and run `judge-input`.

## Open checks for the user

Primary text unreachable (summaries only, or the item was rewritten to avoid the number):
- DOH NIP schedule page (used the PIDSP 2026 calendar), WHO AEFI and cold chain texts.
- NTP MOP 6th ed. and DC 2022-0211 (pediatric 4-month TB regimen), WHO TB Module 4 2025.
- DOH DC 2023-0324 (COVID isolation and masking), DOH AO 2026-0005 (may update the 2021 PrEP rules).
- DOH AMS manual, AO 2020-0027 food- and waterborne surveillance list.
- WHO 2009 dengue full text, WHO malaria guideline doses, DOH malaria and schistosomiasis program specifics.
- PNSDW 2017 annex values (chlorine residual), DO 198-18 OSH staffing table, DOLE workplace TB and hepatitis B program rules.
- WHO Western Pacific 2000 BMI table, Ottawa Charter full text, RA 11148 and AO 2010-0010 micronutrient rules, Milk Code text.
- Philippine IMCI adaptation (used the WHO 2014 chart booklet), AO 2008-0029 MNCHN text.

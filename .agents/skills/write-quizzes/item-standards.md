# Item standards

Write as a senior attending physician and medical educator. The output is parsed by software, and the metadata feeds analytics.

## Accuracy and currency

- Use current, reputable knowledge: major textbooks, specialty society guidelines, WHO, CDC, AAP, NCCN, AJCC and similar. Sources are a minimum coverage map. When a source is outdated or wrong, write the current fact.
- Verify with web search any fact that depends on a guideline, classification, set of criteria, staging system, threshold, dose or schedule revised in the last 10 years. Put the reference in `rationaleMeta.sources` as plain text, e.g. `AAP Clinical Practice Guideline: Management of Hyperbilirubinemia in the Newborn Infant 35 or More Weeks of Gestation (2022)`. Leave `sources` empty for stable textbook facts.
- Where practice varies by region or guideline body, test what is consistent across them or name the guideline in the stem.
- Every item has exactly one best answer that a panel of experts would agree on.

## Originality

Write every stem, choice, rationale and pearl in your own words. Never copy sentences from sources. Never mention source documents, their authors, schools or review centers anywhere in the output. Use only mnemonics that are widely known in medicine.

## Item format (single best answer)

- **Stem**: a self-contained clinical vignette or a focused question. The app shuffles questions, so never refer to other items, shared cases or item numbers.
- **Vignette order**: age and sex, setting, chief complaint, history, examination, then labs or imaging. Give vital signs and lab values with units and reference ranges when they aren't common knowledge. Include only details that matter or that a real presentation would plausibly contain.
- **Lead-in**: a clear question ending in "?" that a prepared learner can answer with the choices covered, e.g. "Which of the following is the most likely diagnosis?", "What is the most appropriate next step in management?" Avoid negative lead-ins (EXCEPT, NOT, LEAST).
- **Choices**: exactly 4, with no letter prefixes. All in the same category (all diagnoses, all drugs, all next steps), parallel in grammar and similar in length and detail. Each distractor is a mistake a partly prepared learner would plausibly make. List numeric choices in ascending order. Never use "all of the above", "none of the above", "both" combinations, or absolute words that give the answer away.

## Technical flaws to avoid

- Testwiseness cues: the correct choice is longest or most qualified, shares words with the stem that the others don't, is the only grammatical fit, or is the odd one out. Two choices mean the same thing, or one contains another.
- Irrelevant difficulty: vague frequency terms ("often", "usually"), double negatives, unneeded jargon, long stems for a simple recall fact, trick wording, and trivia that a prepared examinee wouldn't need to know.

## Mix within each quiz

- **Cognitive level**: favor application (vignettes on diagnosis, mechanism, next step, management, complication, prevention, lab interpretation) over pure recall. Aim for at most about 30% Recall. Include comparisons of look-alike entities and multi-step items that chain two or more concepts (e.g. vignette, then diagnosis, then underlying mutation).
- **Difficulty** (author estimate): about 20% easy, 60% medium, 20% hard. Hard items demand synthesis or discrimination between close distractors, not obscure facts.
- **Answer letters**: spread roughly evenly across A to D.
- Revisiting a core concept from a different angle is welcome. Near-duplicates are not.

## Rationale

The rationale does most of the teaching. Make it dense and high-yield:

1. Why the correct answer is right (the key reasoning step and the discriminating findings).
2. Why each distractor is wrong, or which presentation it would fit instead. Refer to choices by content, not by letter.
3. Use Markdown where it helps: comparison tables, short lists, `$...$` LaTeX for formulas.

Pearls: 1 to 3 short, standalone exam or clinical facts that extend the item, not a restatement of the answer.

## Language and JSON

- English, active voice, standard medical terminology, generic drug names, SI units with conventional units in parentheses where both are common.
- The file must be valid JSON. Escape backslashes in LaTeX (`\\frac`, `\\alpha`), write line breaks as `\n`, and use `\$` for a literal dollar sign that could be read as math.
- Images are not supported yet. Describe findings in words.

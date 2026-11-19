# Item standards

How to write a single-best-answer item. Write as a senior attending physician and medical educator. The output is parsed by software, and the metadata feeds analytics.

## Content

- Use current, reputable knowledge: major textbooks, specialty society guidelines, WHO, CDC and similar. Provided sources are a minimum coverage map, never the authority on facts. When a source is outdated or wrong, write the current fact, term and classification. Never test a retired scheme or a withdrawn drug as current. [currency-notes.md](currency-notes.md) lists the retired forms found so far.
- Guideline-dependent facts (guidelines, criteria, classifications, staging, thresholds, doses, schedules, laws) are verified in the primary document as [verification.md](verification.md) describes. Roles without web access escalate them instead.
- The audience trains for Philippine licensure. Scope epidemiology, rankings and data to the Philippines first, then the region (Southeast Asia, Asia), then global. Never key a fact scoped only to one foreign country. Key a ranking only from a guideline, national surveillance or multicenter data, never one hospital's case series.
- Where Philippine and international guidance differ, key the Philippine specialty society (POGS in obstetrics and gynecology), then the international body (FIGO, WHO), then the US body (ACOG). Cite the body whose position is keyed.
- Induced abortion is illegal in the Philippines: no item keys elective termination, termination for fetal anomaly or selective reduction. Postabortion care and management of spontaneous loss and fetal death stay in scope.
- Where practice or notation varies by region, body or author, test what is consistent across them or name the guideline in the stem.
- Every item has exactly one answer an expert panel would agree on. In next-step and management items, the stem gives the finding that rules out each close alternative (the test already done, the value pointing away from another cause, the absent finding). When current guidance also accepts a more selective or less invasive option, the stem gives the finding that excludes it. When a guideline only suggests the key and accepts an alternative, the stem gives the patient factor the guideline names for choosing the key.

## Originality

Write every field in your own words; never copy sentences from sources. Never mention source documents, handouts, lecture notes, reviewers, their authors, schools or review centers anywhere. `rationaleMeta.sources` cites only published primary references. Use only mnemonics widely known in medicine.

## Item format

- **Stem**: a self-contained clinical vignette or focused question. The app shuffles questions, so never refer to other items, shared cases or item numbers.
- **Vignette order**: age and sex, setting, chief complaint, history, examination, then labs or imaging. Give vital signs and lab values with units, and reference ranges when not common knowledge. Include only details that matter or that a real presentation would plausibly contain.
- **Lead-in**: a clear question ending in "?" that a prepared learner can answer with the choices covered. No negative lead-ins (EXCEPT, NOT, LEAST).
- **Choices**: exactly 4, no letter prefixes, all in one category (all diagnoses, all drugs, all next steps), parallel in grammar, similar in length and detail. Each distractor is a mistake a partly prepared learner would plausibly make. Numeric choices in ascending order. No "all of the above", "none of the above", combinations or giveaway absolutes.
- **Laws**: short scenarios asking what the law requires or allows, not the provision number.
- **Trials**: ask for the decision the evidence supports; never put a trial's name in a stem or choice.

## Technical flaws

Check every item against these before returning it. They are the flaws reviewers fix most.

- The key is the longest or most qualified choice, shares words with the stem that others don't, is the only grammatical fit, or is the odd one out.
- The stem states the answer or its defining clue (the drug's target when asking for the drug), or the key repeats a term from the stem.
- Two choices mean the same thing, one contains another, or a distractor is partly true. In a "most common" item, a distractor the source lists alongside the key or at a similar rate is partly true: use effects the source gives a clearly lower rate, or rare serious ones.
- A distractor no partly prepared learner would pick.
- Irrelevant difficulty: vague frequency terms, double negatives, needless jargon, a long stem for a simple recall fact, trick wording, trivia.
- A stem, rationale, table or pearl that gives away another item's answer, including staged items in the same quiz (pearls often state a staged item's next step or key). Grep `stems.txt` for each pearl's fact.
- A fact, number or absolute claim ("only", "never", "most common", a percentage) in any field that the cited document or a standard textbook doesn't state.
- A pearl that restates the rationale, or a rationale padded with repeated or filler sentences. Add a distinguishing fact instead.
- A rationale left garbled by edits (a stray sentence after the bullets, a sentence repeated or cut off). Reread every edited rationale whole.

## Mix within each quiz

The gate (`quiz_work.py gate`) measures these.

- **Cognitive level**: favor application (diagnosis, mechanism, next step, management, complication, prevention, lab interpretation) over recall. Recall at most 30% and any other question type at most 40%. Include look-alike comparisons and items that chain two or more concepts.
- **Difficulty**: about 20% easy, 60% medium, 20% hard. Hard means synthesis or discrimination between close distractors, with the leading clue withheld. An item whose stem names the clue that leads straight to the key is not hard, and obscure facts don't make an item hard.
- **Answer letters**: spread roughly evenly across A to D. Rebalance by reordering choices and updating `answer`.

## Near-duplicates

Revisiting a core concept from a different angle is welcome. Testing the same point the same way, within the quiz or anywhere in the subject, is not. Points in a quiz's `excludes` belong to another quiz.

`stems.txt` holds every staged stem of the subject plus `(unstaged)` sections from other topics in progress, one `## <Topic> › <Quiz>` section per quiz. To check items against it:

1. Run `quiz_work.py similar` on the batch. It lists the closest stems per item; read every candidate it lists.
2. It only matches wording. Also grep `stems.txt` for each item's keyed entity (drug, organism, disorder, mechanism) and for the findings that describe it, since staged stems often describe a finding without naming it.
3. Compare items within your own batch the same way: two items on one entity must test different facts, and neither may give away the other's key.

## Rationale

The rationale does most of the teaching, and learners skim it on a phone. Make it dense, high-yield and easy to scan. The app renders GitHub Flavored Markdown, `<sub>`/`<sup>` and KaTeX math.

**Structure** (70 to 140 words outside tables; more only when a table carries it):

1. **Answer and key reasoning**: open with the correct answer in bold and the reasoning that reaches it, in 1 to 3 sentences. Bold the discriminating findings. A calculation opens with the bolded answer, not the formula.
2. **Core teaching**: a table whenever 2 or more entities are compared on 2 or more features (look-alike diagnoses, drug choices, thresholds, staging levels, lab patterns). A numbered list for sequences (an algorithm, a work-up, a calculation). Only facts a standard reference states.
3. **Other choices**: one bullet per distractor, starting with the choice's content in bold, then why it's wrong or what it fits instead. Never refer to choices by letter.

**Formatting**:

- **Bold** the answer, the discriminating findings and the one or two facts to remember; at most about a fifth of the text.
- *Italics* for organisms, Latin terms, gene names and a term where it is defined.
- Tables: at most 4 columns, short cells, a header row, the entity in the first column. Every Comparison item has one.
- LaTeX for formulas, calculations, ratios and anything with fractions or exponents (`$...$` inline, `$$` blocks for multi-step work). Plain numbers and units as text. `<sub>`/`<sup>` for chemical formulas and simple subscripts (CO<sub>2</sub>, Ca<sup>2+</sup>).
- No headings, blockquotes or horizontal rules.

Example (rendered Markdown):

```markdown
**Transient tachypnea of the newborn** fits best: a **term infant born by cesarean without labor** with **mild tachypnea and a low oxygen need** that **improves within 24 to 48 hours**. Delayed clearance of fetal lung fluid is the cause.

| Condition | Typical infant | Chest X-ray | Course |
| --- | --- | --- | --- |
| TTN | Term, cesarean without labor | Perihilar streaks, fluid in fissures | Resolves in 24 to 72 h |
| RDS | Preterm, no antenatal steroids | Ground glass, air bronchograms | Worsens before surfactant |
| Meconium aspiration | Post-term, meconium-stained | Patchy infiltrates, hyperinflation | Risk of PPHN |

- **Rising oxygen need above 0.40** suggests RDS, pneumonia or PPHN rather than TTN.
- **Temperature instability with poor perfusion** points to sepsis.
- **Progressive hypercapnia needing intubation** is not expected in TTN.
```

**Pearls**: 1 to 3 short, standalone exam or clinical facts that extend the item.

## Citations

`rationaleMeta.sources` is a string: AMA-style references (AMA Manual of Style, 11th edition) separated by semicolons, or empty for stable textbook facts.

- Required: authors (up to 6, then "et al") or the issuing organization, title, journal abbreviation or publisher, and year. Add volume, issue, pages and DOI only when they are on the page you read; never look them up separately, and a citation without them is complete. Never add access dates.
- Italicize journal and book titles with `*...*`. End with a period.
- Cite the document that covers the tested point itself, not a related guideline from the same body. Cite a guideline read as web chapters (EAU on uroweb.org) by its organization. For a continuously updated web page, use the year of the version read.
- Write only details read in the document or its publisher record, never from memory.

```text
Kemper AR, Newman TB, Slaughter JL, et al. Clinical practice guideline revision: management of hyperbilirubinemia in the newborn infant 35 or more weeks of gestation. *Pediatrics*. 2022;150(3):e2022058859. doi:10.1542/peds.2022-058859
World Health Organization. *WHO Recommendations on Antenatal Care for a Positive Pregnancy Experience*. World Health Organization; 2016.
```

## Metadata

Use the values exactly as written; allowed values are in [vocabulary.json](vocabulary.json). Don't set `metadata.topic` or `tags`. A genuinely new value is added to `vocabulary.json` in the same change, and the user is told.

- `subtopic`: the blueprint's Title Case subtopic name, the same string for every item on it. Reuse outline subtopics when they fit.
- `system`: the organ system tested. `Multisystem` for systemic disease (sepsis). `General Principles` for growth, nutrition, immunization schedules, genetics, pharmacology principles and biostatistics.
- `difficulty`: `easy`, `medium` or `hard` (see the mix above).
- `questionType`: the task asked. `Clinical Vignette: Next Step` is the immediate diagnostic or therapeutic step; `Clinical Vignette: Management` is the definitive treatment; `Multi-step Reasoning` chains two or more inferences. Choose the type that fits the item, never one that rebalances the mix.

## Language and JSON

- English, active voice, standard terminology, generic drug names, SI units with conventional units in parentheses where both are common. No patient details that stereotype without clinical relevance. Images aren't supported; describe findings in words.
- Only `stem` and `rationale` take Markdown and `<sub>`/`<sup>`. `choices`, `pearls` and `rationaleMeta.sources` take no HTML (titles in sources may use `*italics*`); write Unicode there (10⁹/L, m², CO₂, Na⁺).
- Valid JSON: escape LaTeX backslashes (`\\frac`), write line breaks as `\n`, and use `\$` for a literal dollar sign.

Batch shape (the editor's bulk-add JSON):

```json
{ "topics": [ { "name": "", "description": "", "quizzes": [ { "name": "", "description": "", "items": [
  { "stem": "", "choices": ["", "", "", ""], "answer": "A", "rationale": "", "rationaleMeta": { "sources": "" }, "pearls": [""],
    "metadata": { "subtopic": "", "system": "", "difficulty": "medium", "questionType": "" } } ] } ] } ] }
```

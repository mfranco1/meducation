# Item standards

Write as a senior attending physician and medical educator. The output is parsed by software, and the metadata feeds analytics.

## Accuracy and currency

- Use current, reputable knowledge: major textbooks, specialty society guidelines, WHO, CDC, AAP, NCCN, AJCC and similar. Sources are a minimum coverage map. When a source is outdated or wrong, write the current fact. That includes terms and classification schemes: older textbooks keep retired ones. Use the current nomenclature and consensus classification, and never test a retired scheme. When a consensus renames a disorder (polycystic ovary syndrome to polyendocrine metabolic ovarian syndrome, PMOS, in 2026), use the new name; keep guideline titles as published.
- Verify against the primary document any fact that depends on a guideline, classification, set of criteria, staging system, threshold, dose or schedule revised in the last 10 years. Search results and secondary summaries only locate the document:
  1. Search for the newest version first, so you don't verify against a superseded edition. Cite that edition, not the older one you may know better; the ledger marks superseded editions.
  2. Fetch the page itself: the publisher's full text (journal, PubMed Central, society, CDC, WHO or government site).
  3. Confirm the exact numbers and wording there. State a recommendation's strength or certainty grade only if you read it there; otherwise leave the grade out.
  4. Publisher, society and NCBI Bookshelf pages often refuse automated fetches; drug labels on DailyMed, PubMed Central and Europe PMC copies, and guideline PDFs hosted by another society or health agency usually load. AHA/ACC (ahajournals, JACC), ESC/ERS and BTS full texts mostly return 403: search PubMed Central for the guideline's own copy first (many AHA/ACC guidelines are there), then the Web Archive raw form of the ahajournals or JACC full-text page (`web.archive.org/web/<timestamp>id_/<url>`), which loaded the 2026 ACC/AHA dyslipidemia guideline, use the AHA CPR guideline pages on cpr.heart.org subdomains for resuscitation, the brit-thoracic.org.uk document library for BTS guideline PDFs, and ACC "Guidelines Made Simple" or society pocket-guide PDFs for recommendation classes and thresholds. CDC STI treatment pages often refuse fetches: use the PubMed Central copy of the MMWR guideline. clinicalinfo.hiv.gov (NIH HIV and opportunistic infection guidelines) returns 403: fetch the guideline PDF through the Web Archive raw form (`web.archive.org/web/<timestamp>id_/<pdf url>`), which also works for other blocked PDFs. When a PubMed Central page shows a browser check, the Europe PMC full-text copy usually loads. ESGO guidelines load as pocket-guideline PDFs on esgo.org, and some full texts are hosted by national societies (BGCS). ACOG full texts mostly return 402. The 2025 AHA/ACC and 2024 ESC hypertension guidelines don't load anywhere: verify hypertension facts in the 2020 Philippine hypertension guideline (PMC8678709), NICE NG136 and NG133, or ADA Standards section 10, and cite that body. For an ACOG-only number, look for an SMFM-hosted copy of the ACOG document, or verify it in an equivalent current guideline that loads (NICE pages, also through the UK Government Web Archive; WHO; SMFM; FIGO) and name that body in the stem where the bodies differ. If the primary text can't be reached, don't write numbers you couldn't confirm. Test the concept without them, or list the fact in your `unverified-<n>.json`.
  5. For a law, regulation or circular, verify every article or section number, penalty, period and amount you write, however old the law, and confirm the provision is still in force: not repealed, amended, or a temporary or transition rule that has lapsed. Review handouts often keep superseded rules. Never cite a provision number from memory; leave it out if you can't confirm it. 
- Put the reference in `rationaleMeta.sources` as an AMA-style citation (AMA Manual of Style, 11th edition). Required: authors (up to 6, then "et al") or the issuing organization, the title, the journal abbreviation or publisher, and the year. Add the volume, issue, pages and DOI only when they are on the page you read. Don't make a separate lookup for them: a citation without them is complete. Italicize journal and book titles with `*...*`. Separate several references with semicolons. Never add access or retrieval dates. Examples:
  - `Kemper AR, Newman TB, Slaughter JL, et al. Clinical practice guideline revision: management of hyperbilirubinemia in the newborn infant 35 or more weeks of gestation. *Pediatrics*. 2022;150(3):e2022058859. doi:10.1542/peds.2022-058859`
  - `World Health Organization. *WHO Recommendations on Antenatal Care for a Positive Pregnancy Experience*. World Health Organization; 2016.`
  Cite the document that covers the tested point itself, not a related guideline from the same body (a hormone replacement guideline for a diagnostic workup, a medullary carcinoma guideline for MEN1 genetics), and keep rationale and pearl details to what that document or a standard textbook supports. Write only details you read in the document or its publisher record. Never write an author, volume, page or DOI from memory: leave out what you didn't read. Every citation has a year; for a continuously updated web summary (NCI PDQ, CDC pages), use the year of the version you read. Leave `sources` empty for stable textbook facts.
- Read the source ledger (`var/quiz-work/sources.json`, shared by all subjects) before searching. It records which documents were verified, read only as a summary, or blocked, and the facts already confirmed, so use the same facts and don't retry known-blocked pages. Record every guideline check you make in your `sources-<n>.json`: `[{ "title": "", "year": "", "url": "", "status": "verified | summary-only | blocked | unconfirmed", "facts": ["one short confirmed fact"] }]`.
- List each guideline-dependent fact you couldn't confirm in a primary text, including every fact you read only in a summary, abstract or search result (a `summary-only` source), in your `unverified-<n>.json`: `[{ "item": 12, "fact": "IPNA 2022 steroid-resistance definition, abstract only" }]`, with `item` the item's number in your quiz. Don't list stable textbook facts.
- Where practice varies by region or guideline body, test what is consistent across them or name the guideline in the stem.
- Every item has exactly one best answer that a panel of experts would agree on. In next-step and management items, the stem gives the finding that rules out each close alternative: the test already done or its result, the value that points away from the other source, the symptom or finding that is absent.

## Originality

Write every stem, choice, rationale and pearl in your own words. Never copy sentences from sources. Never mention  source documents, reviewers, handouts, lecture notes, their authors, schools, review centers, or their comments anywhere in the output. `rationaleMeta.sources` cites only published primary references. Use only mnemonics that are widely known in medicine.

## Item format (single best answer)

- **Stem**: a self-contained clinical vignette or a focused question. The app shuffles questions, so never refer to other items, shared cases or item numbers.
- **Vignette order**: age and sex, setting, chief complaint, history, examination, then labs or imaging. Give vital signs and lab values with units and reference ranges when they aren't common knowledge. Include only details that matter or that a real presentation would plausibly contain.
- **Lead-in**: a clear question ending in "?" that a prepared learner can answer with the choices covered, e.g. "Which of the following is the most likely diagnosis?", "What is the most appropriate next step in management?" Avoid negative lead-ins (EXCEPT, NOT, LEAST).
- **Choices**: exactly 4, with no letter prefixes. All in the same category (all diagnoses, all drugs, all next steps), parallel in grammar and similar in length and detail. Each distractor is a mistake a partly prepared learner would plausibly make. List numeric choices in ascending order. Never use "all of the above", "none of the above", "both" combinations, or absolute words that give the answer away.

## Technical flaws to avoid

- Testwiseness cues: the correct choice is longest or most qualified, shares words with the stem that the others don't, is the only grammatical fit, or is the odd one out. Two choices mean the same thing, or one contains another.
- Irrelevant difficulty: vague frequency terms ("often", "usually"), double negatives, unneeded jargon, long stems for a simple recall fact, trick wording, and trivia that a prepared examinee wouldn't need to know.

## Mix within each quiz

- **Cognitive level**: favor application (vignettes on diagnosis, mechanism, next step, management, complication, prevention, lab interpretation) over pure recall. Aim for at most about 30% Recall. For laws, write short scenarios that ask what the law requires or allows, rather than asking for the provision itself. Include comparisons of look-alike entities and multi-step items that chain two or more concepts (e.g. vignette, then diagnosis, then underlying mutation).
- **Difficulty** (author estimate): about 20% easy, 60% medium, 20% hard. Hard items demand synthesis or discrimination between close distractors, not obscure facts.
- **Answer letters**: spread roughly evenly across A to D.
- Revisiting a core concept from a different angle is welcome. Near-duplicates are not, within the quiz or across the subject. Before writing, skim the staged stems (`stems.txt`) and the other planned quizzes in your brief. Leave out the points in your quiz's `excludes`: they belong to another quiz.

## Rationale

The rationale does most of the teaching, and learners skim it on a phone. Make it dense, high-yield and easy to scan. The app renders GitHub Flavored Markdown, a small HTML subset (`<sub>`, `<sup>`) and KaTeX math. Tables and display math scroll on narrow screens.

**Structure** (about 70 to 140 words outside tables; more only when a table carries it):

1. **Answer and key reasoning**: open with the correct answer in bold and the reasoning step that gets there, in 1 to 3 sentences. Bold the findings that discriminate it from the distractors.
2. **Core teaching**: what a learner should take away. Use a table whenever 2 or more entities are compared on 2 or more features: look-alike diagnoses, drug choices, thresholds by age or gestation, staging or classification levels, or lab patterns. Use a numbered list for sequences, e.g. a resuscitation algorithm, a stepwise work-up or a calculation. Add only facts a standard reference states; leave out side claims you can't support.
3. **Other choices**: a bulleted list with one bullet per distractor, each starting with the choice's content in bold, then why it's wrong or which presentation it fits instead. Never refer to choices by letter.

**Formatting rules:**

- **Bold** the correct answer, the discriminating findings, and the one or two facts a learner must remember. Don't bold whole sentences or more than about a fifth of the text.
- *Italics* for organism names (*Streptococcus agalactiae*, *Listeria monocytogenes*), Latin terms and gene names (*UGT1A1*), and for a term at the point it's defined.
- Tables: at most 4 columns, short cells (a few words), a header row, and the entity being discussed in the first column. Every Comparison question has one.
- Math: use LaTeX for formulas, calculations, ratios and anything with fractions or exponents, inline as `$...$`, e.g. `$\text{dose} = 10\ \text{mL/kg} \times 3.2\ \text{kg} = 32\ \text{mL}$`, or as a display block (`$$` on its own lines) for a multi-step calculation. Write plain numbers and units as text. Use `<sub>`/`<sup>` for chemical formulas and simple subscripts (CO<sub>2</sub>, SpO<sub>2</sub>, Ca<sup>2+</sup>).
- No headings, blockquotes or horizontal rules inside a rationale. Use bold lead-ins instead.

Example rationale (as rendered Markdown):

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

Pearls: 1 to 3 short, standalone exam or clinical facts that extend the item, not a restatement of the answer.

## Language and JSON

- English, active voice, standard medical terminology, generic drug names, SI units with conventional units in parentheses where both are common.
- The file must be valid JSON. Escape backslashes in LaTeX (`\\frac`, `\\alpha`), write line breaks as `\n`, and use `\$` for a literal dollar sign that could be read as math.
- Only `stem` and `rationale` take Markdown and the `<sub>`/`<sup>` subset. `choices`, `pearls` and `rationaleMeta.sources` take no HTML; `rationaleMeta.sources` may use `*italics*` for titles. Write 10⁹/L, m² and CO₂ with Unicode characters there.
- Images are not supported yet. Describe findings in words.

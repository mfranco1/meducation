# Content standards

Rules every quiz item and flashcard follows. Shared by write-quizzes and write-flashcards; each skill's standards file ([item-standards.md](../skills/write-quizzes/item-standards.md), [card-standards.md](../skills/write-flashcards/card-standards.md)) adds its own format. Keying a fact means making it an item's answer or a card's answer.

## Facts

- Use current knowledge from primary references, in this order: (1) the latest clinical practice guideline or official issuance of the body Philippine practice follows (see Philippine audience), national surveillance data, the drug label, and a landmark trial for what it showed; (2) the latest edition of the subject's standard reference textbook; (3) a systematic review or consensus statement in a major journal, only where the first two are silent. Provided sources are a minimum coverage map, never the authority on facts. When a source is outdated or wrong, write the current fact, term and classification. Never teach a retired scheme or a withdrawn drug as current; [currency-notes.md](currency-notes.md) lists the current forms.
- Verify guideline-dependent facts (guidelines, criteria, classifications, staging, thresholds, doses, schedules, laws, keyed rankings) in the primary document as [verification.md](verification.md) describes. Roles without web access escalate them or list them as unverified, as their prompt says; never guess.
- Where practice or notation varies by region, body or author, test what is consistent across them or name the guideline in the stem or on the card.
- When the latest guideline differs from the latest edition of a major textbook, key the guideline and give the textbook value too. Label each by name and year or edition (GOLD 2026; *Harrison's*, 22nd ed.) and cite each in AMA style in the sources field. Name the guideline, textbook or study behind every attributed or qualified claim; never write "textbook value", "some studies", "many series" or "experts".

## Philippine audience

- The audience trains for Philippine licensure. Scope epidemiology, rankings and data to the Philippines first, then the region (Southeast Asia, Asia), then global. Never key a fact scoped only to one foreign country. Key a ranking only from a guideline, national surveillance or multicenter data, never one hospital's case series. When no source ranks the point as worded, narrow the question to a ranking a source does state (a category, population or setting it names) or pick another point. Never fall back to "which is a common X" or "which does guideline Y list": the other listed or reported findings make the distractors partly true.
- Key the guideline Philippine practice actually uses, within Philippine law. There is no fixed order of bodies:
  - Obstetrics and gynecology: POGS, then FIGO or WHO, then ACOG.
  - Most other fields follow the international or US specialty guideline (ACC/AHA, ADA, IDSA, KDIGO, GINA, GOLD).
  - A Philippine guideline or DOH program takes precedence where it sets the national standard, mostly for diseases common locally and national programs (TB, HIV, dengue, leptospirosis, immunization, community-acquired pneumonia).
  - When it's unclear which one practice follows, treat it as varying practice (see Facts). Cite the body whose position is keyed.
- Induced abortion is illegal in the Philippines: never key or teach elective termination, termination for fetal anomaly or selective reduction as an option. Postabortion care and management of spontaneous loss and fetal death stay in scope.
- Legal Medicine: current law only, with no superseded rules or outdated forensics.

## Originality

Write every field in your own words; never copy sentences from sources. Never mention source documents, handouts, lecture notes, reviewers, their authors, schools or review centers anywhere. Use only mnemonics widely known in medicine.

## Citations

The sources field is a string of AMA-style references (AMA Manual of Style, 11th edition) separated by semicolons. Cite only the primary references listed in Facts, and only documents you read. A stable textbook fact takes no citation.

- Never cite a reference site or point-of-care summary (MSD or Merck Manual, StatPearls, UpToDate, Medscape, Wikipedia, Radiopaedia, DermNet), a narrative review, a case report or single-center series, a low-tier journal (*Cureus*), one hospital's protocol, lecture or course material, an unofficial copy of a book, or a superseded edition. Such a page may point you to the primary document; a guideline-dependent fact that only such a page supports is unverified. The batch gate warns on the common ones.

- Required: authors (up to 6, then "et al") or the issuing organization, title, journal abbreviation or publisher, and year. Add volume, issue, pages and DOI only when they are on the page you read; never look them up separately, and a citation without them is complete. Never add access dates.
- Italicize journal and book titles with `*...*`; no HTML. End with a period.
- Cite the document that covers the tested point itself, not a related guideline from the same body. Cite a guideline read as web chapters (EAU on uroweb.org) by its organization. For a continuously updated web page, use the year of the version read.
- Write only details read in the document or its publisher record, never from memory.

```text
Kemper AR, Newman TB, Slaughter JL, et al. Clinical practice guideline revision: management of hyperbilirubinemia in the newborn infant 35 or more weeks of gestation. *Pediatrics*. 2022;150(3):e2022058859. doi:10.1542/peds.2022-058859
World Health Organization. *WHO Recommendations on Antenatal Care for a Positive Pregnancy Experience*. World Health Organization; 2016.
```

## Language and formatting

- English, active voice, standard terminology, generic drug names, SI units with conventional units in parentheses where both are common. No patient details that stereotype without clinical relevance. Images aren't supported; describe findings in words.
- Markdown fields take GitHub Flavored Markdown, `<sub>`/`<sup>` and KaTeX math (`$...$` inline, `$$...$$` blocks). No headings, blockquotes, horizontal rules or images.
- Tables: at most 4 columns, short cells, a header row, the entity in the first column.
- *Italics* for organisms, Latin terms, gene names and a term where it is defined.
- Valid JSON: escape LaTeX backslashes (`\\frac`), write line breaks as `\n`, and use `\$` for a literal dollar sign.

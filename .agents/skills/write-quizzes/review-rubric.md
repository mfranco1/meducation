# Review rubric

You are an independent board-exam item reviewer and a senior physician. You did not write these items. Read [item-standards.md](item-standards.md) first. Your job is to catch wrong keys, ambiguity, outdated facts and flaws before learners see them.

## Pass 1: blind solve

You get items without answers or rationales. For each item:

- Choose the single best answer as a well-prepared examinee would.
- List another choice as defensible only if an expert panel could pick it as the best answer.
- Use `note` only for a defect or assumption that would change the answer. No style comments. Leave it empty otherwise.

Answer one input file at a time and store each answer under its item's `ref` (for example in a dict keyed by ref), never by list position. `check-blind` refuses files whose answers are shifted against the items. Return JSON: `[{ "ref": "<topic> › <quiz> › <n>", "answer": "B", "defensible": ["D"], "note": "" }]`.

## Pass 2: checklist

You run one of two passes on separate sets of items:

- **Standards pass:** you get the items that passed triage. Run every check on every item. Fix problems under checks 4 to 8 yourself, using severities `flaw` and `metadata`. Under checks 2 and 3, fix an error yourself, with severity `correction`, only when the fix is self-evident from the item or basic science and needs no guideline, figure or threshold lookup: arithmetic, a misnamed term, wrong anatomy, a contradiction with the stem, or a source entry whose separators, italics or order aren't AMA style. Never add a volume, page, DOI or year to a source entry: you have no web access, and a citation without volume, pages or DOI is complete. Escalate an entry with no year or the wrong document. Escalate everything else under checks 1 to 3. Never drop an item. Write escalations to your escalation file as `[{ "ref": "", "reason": "" }]`, starting the reason with "near-duplicate of <ref or staged stem>" for duplicates so they are routed to a writer for replacement. For check 5, also compare against the staged stems (`stems.txt`).
- **Judgment pass:** you get the escalated items with their blind answers and the reasons they were escalated. Run every check and fix everything you find. Use web sources only where the reasons call for them:
  - Blind answer differs from the key: verify the key (check 1).
  - Defensible choice or blind note: make one answer clearly best (checks 1 and 4). This rarely needs a lookup.
  - Standards reviewer flag: check the named fact (checks 2 and 3). The item's `proposed` field holds the reviewer's suggested edits, if any. Send them as your edits when the fact checks out, revise them, or leave the item unchanged.

  Don't re-verify the item's other guideline facts unless you think one is wrong; the writer already checked them. Checks 4 to 8 need no web. Check the source ledger first (`ledger --find`, see [item-standards.md](item-standards.md#accuracy-and-currency)): use the facts it marks `verified` without fetching them again, don't retry documents it marks `blocked`, and search only for what it lacks. Record what you check in the sources file you are given.

For each item, check:

1. **Key**: the key is correct. If the blind answer differed, decide who is right using current authoritative sources (web search). If another choice is defensible, the item needs a fix.
2. **Currency**: guideline-dependent facts, criteria, classifications, staging, thresholds, doses and schedules match the current version, checked in the primary document (see [item-standards.md](item-standards.md#accuracy-and-currency)). Each such item has an accurate AMA-style `rationaleMeta.sources` entry naming the right document, with its issuing body or authors, title, journal or publisher, and year (see [item-standards.md](item-standards.md#accuracy-and-currency)). Missing volume, pages or DOI is not a defect; don't look them up.
3. **Accuracy**: the rationale, pearls and distractor explanations contain no errors and no unsupported claims.
4. **Standards**: the stem is self-contained, the lead-in can be answered with the choices covered, the choices are homogeneous, and none of the technical flaws apply.
5. **Enemy items**: no item gives away another item's answer, and no two items test the same point in the same way.
6. **Metadata**: subtopic, system, difficulty and questionType fit the item.
7. **Rationale format**: it follows the structure and formatting rules in [item-standards.md](item-standards.md#rationale): bold answer and discriminating findings, a table wherever entities are compared, a bulleted distractor list, and LaTeX for calculations. If not, send a full rewritten `rationale` (severity `flaw`).
8. **Language**: plain, precise and original. No mention of the provided source documents in any field, including `rationaleMeta.sources`. No patient details that stereotype by sex, ethnicity or background without clinical relevance.

Return a JSON array with one entry per item that needs work. Items not listed are accepted. `quiz_work.py apply` applies the entries as written, with no interpretation, so give complete final values:

```json
{ "ref": "<topic> › <quiz> › <n>", "severity": "wrong-key | ambiguous | outdated | inaccurate | correction | flaw | metadata",
  "edits": { "rationale": "<full new rationale>", "rationaleMeta.sources": "<full new sources>" },
  "reason": "<one or two sentences, with a source when a fact is involved>" }
```

- `edits` keys: `stem`, `choices` (the full array of 4), `answer`, `rationale`, `pearls` (the full array), `rationaleMeta.sources`, `metadata.subtopic`, `metadata.system`, `metadata.difficulty`, `metadata.questionType`. Each value replaces the whole field.
- When a fact changes, edit every field of the item that states it. Every `choices` edit also sends `answer`, even when the key stays put, so reordering choices can't silently move the key (`apply` refuses a `choices` edit without it). When choices move or the key changes, also send a `rationale` that refers to choices by content.
- Fix rather than drop: make one answer clearly best by changing the stem or a distractor. Send `"drop": true` only for an item that can't be fixed, and say so in your summary; a writer replaces it at the end of the subject.
- `choices`, `pearls` and `rationaleMeta.sources` have no HTML; `rationaleMeta.sources` may italicize titles (see [item-standards.md](item-standards.md#language-and-json)).

End with a one-line summary of counts by severity, and list the facts you could not verify against a primary source.

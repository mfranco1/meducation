# Review checklist

Writers check their own items against checks 2 to 8 before returning them. Reviewers run the checks their prompt names and report in the format below. Each check refers to [item-standards.md](item-standards.md) or the shared [content-standards.md](../../shared/content-standards.md).

## Checks

1. **Key**: the key is correct and no other choice is defensible as best.
2. **Currency**: guideline-dependent facts, criteria, classifications, staging, thresholds, doses and schedules match the current version, and no retired term from [currency-notes.md](../../shared/currency-notes.md) is used. Each such item cites the right document in AMA style (content-standards.md, Citations). Missing volume, pages or DOI is not a defect.
3. **Accuracy**: the rationale, pearls and distractor bullets contain no errors and no unsupported claims.
4. **Standards**: the stem is self-contained, the lead-in is answerable with the choices covered, the choices are homogeneous, and none of the technical flaws apply.
5. **Near-duplicates and enemy items**: no stem, choice, rationale, table or pearl gives away the answer to another item in its quiz, new or staged (grep each pearl's fact in the quiz's section of `stems.txt`), and no item tests a point already tested the same way in the batch or in `stems.txt` (Near-duplicates).
6. **Metadata**: subtopic, system, difficulty and questionType fit the item.
7. **Rationale format**: structure and formatting follow Rationale.
8. **Language**: plain, precise, original; no mention of provided sources in any field; no stereotyping details.

## Review output

A JSON array with one entry per item that needs work; unlisted items are accepted. `quiz_work.py apply` applies entries exactly as written, so give complete final values.

```json
[{ "ref": "<topic> › <quiz> › <n>", "severity": "wrong-key | ambiguous | outdated | inaccurate | correction | flaw | metadata",
   "edits": { "rationale": "<full new rationale>" },
   "reason": "<one or two sentences, with a source when a fact is involved>" }]
```

- Copy each `ref` from its item, never from list position.
- `edits` keys: `stem`, `choices` (all 4), `answer`, `rationale`, `pearls` (the full array), `rationaleMeta.sources`, `metadata.subtopic`, `metadata.system`, `metadata.difficulty`, `metadata.questionType`. Each value replaces the whole field.
- When a fact changes, edit every field that states it.
- Every `choices` edit also sends `answer`, even when the key letter stays the same. When choices move or the key changes, also send a `rationale` that refers to choices by content.
- A rewritten rationale stays at 70 to 140 words outside tables: count before writing, and replace a cut sentence with a distinguishing fact.
- Fix rather than drop: make one answer clearly best by changing the stem or a distractor. Drop (`"drop": true`) only an item that can't be fixed.

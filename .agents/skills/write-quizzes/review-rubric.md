# Review rubric

You are an independent board-exam item reviewer and a senior physician. You did not write these items. Read [item-standards.md](item-standards.md) first. Your job is to catch wrong keys, ambiguity, outdated facts and flaws before learners see them.

## Pass 1: blind solve

You get items without answers or rationales. For each item:

- Choose the single best answer as a well-prepared examinee would.
- Note any other choice you consider defensible, and why.
- Note anything you had to assume because the stem was missing it.

Return JSON: `[{ "ref": "<topic> › <quiz> › <n>", "answer": "B", "defensible": ["D"], "note": "" }]`.

## Pass 2: checklist

You run one of two passes on separate sets of items:

- **Standards pass:** you get the items that passed triage. Run every check. Fix problems under checks 4 to 8 yourself. If you suspect a problem under checks 1 to 3, don't edit the item: list its ref with a one-line reason under "Escalate" at the end of your reply.
- **Judgment pass:** you get the escalated items with their blind answers and any unverified facts. Run every check and fix everything you find.

For each item, check:

1. **Key**: the key is correct. If the blind answer differed, decide who is right using current authoritative sources (web search). If another choice is defensible, the item needs a fix.
2. **Currency**: guideline-dependent facts, criteria, classifications, staging, thresholds, doses and schedules match the current version, checked in the primary document (see [item-standards.md](item-standards.md#accuracy-and-currency)). Each such item has an accurate `rationaleMeta.sources` entry with the document's real title and year.
3. **Accuracy**: the rationale, pearls and distractor explanations contain no errors and no unsupported claims.
4. **Standards**: the stem is self-contained, the lead-in can be answered with the choices covered, the choices are homogeneous, and none of the technical flaws apply.
5. **Enemy items**: no item gives away another item's answer, and no two items test the same point in the same way.
6. **Metadata**: subtopic, system, difficulty and questionType fit the item.
7. **Rationale format**: it follows the structure and formatting rules in [item-standards.md](item-standards.md#rationale): bold answer and discriminating findings, a table wherever entities are compared, a bulleted distractor list, and LaTeX for calculations. If not, send a full rewritten `rationale` (severity `flaw`).
8. **Language**: plain, precise and original. No source names. No patient details that stereotype by sex, ethnicity or background without clinical relevance.

Return a JSON array with one entry per item that needs work. Items not listed are accepted. [apply_review.py](apply_review.py) applies the entries as written, with no interpretation, so give complete final values:

```json
{ "ref": "<topic> › <quiz> › <n>", "severity": "wrong-key | ambiguous | outdated | inaccurate | flaw | metadata",
  "edits": { "rationale": "<full new rationale>", "rationaleMeta.sources": "<full new sources>" },
  "reason": "<one or two sentences, with a source when a fact is involved>" }
```

- `edits` keys: `stem`, `choices` (the full array of 4), `answer`, `rationale`, `pearls` (the full array), `rationaleMeta.sources`, `metadata.subtopic`, `metadata.system`, `metadata.difficulty`, `metadata.questionType`. Each value replaces the whole field.
- When a fact changes, edit every field of the item that states it. When choices move or the key changes, send `choices`, `answer` and a `rationale` that refers to choices by content.
- For an item that can't be fixed, send `"drop": true` instead of `edits`.

End with a one-line summary of counts by severity, and list the facts you could not verify against a primary source.

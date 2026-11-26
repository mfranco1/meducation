---
name: audit-sources
description: Audit and clean up the sources field of existing questions and cards across the bank (citation form, barred or weak sources, duplicate wordings), then stage the corrections in the editor draft for review and publishing. Use when asked to audit, list, reformat, replace or remove citations on existing content.
---

# Audit sources

Finds citations that break the [citation standard](../../shared/content-standards.md#citations) and stages corrected `sources` strings. `source_audit.py` reads the draft, classifies every citation and applies a map of replacements; this session orchestrates and subagents look documents up.

Only the sources field changes. Never touch stems, choices, keys, rationales or card faces. Never publish: the user reviews the staged draft in `/admin.html` and publishes from **Review & publish**.

## Commands

Run from the repository root. Local authoring needs `docker start meducation-authority-postgres`.

```sh
A() { python3 -I .agents/skills/audit-sources/source_audit.py "$@"; }
A summary
A list <class or flag> [Subject]
A groups [Subject]
A apply <map.json> --actor agent:audit-sources [--dry-run]
```

`A groups` prints each document cited in more than one wording (same DOI, or same title and year) so one wording can replace the others. `A --help` lists the classes and flags. They are pattern-based: read the strings, and fix any the pattern put in the wrong class. The class definition is `citation_form` in `.agents/shared/authoring.py`, which the batch gates of write-quizzes and write-flashcards also use.

## Workflow

1. `A summary`, then `A list` for the class or flag to work on. Both rewrite the audit file that `apply` checks against.
2. Work per distinct string, not per item. Write a map `{ "<old citation>": "<new citation>" }`. Use `null` to drop a citation and a `"KEEP: <reason>"` value to leave one alone. Keys must be the exact strings `A list` prints. A listed string that holds two documents (the splitter joined them) can't go in a map: replacing it would drop one. Stage those items by hand with an `edits` file.
3. Look each document up before fetching: `python3 -I .agents/shared/authoring.py find-sources <term>...`, then `save-source`. Follow [verification.md](../../shared/verification.md) and [fetch-access.md](../../shared/fetch-access.md). Write only details read in the document or its publisher record. A citation without volume, pages or DOI is complete.
4. Give batches of about 25 strings to mid-tier subagents (name the model) that return only a map file. Merge the maps.
5. `A apply <map.json> --dry-run` and read the counts, then apply. It rebuilds each affected item's sources (replace, drop, remove duplicates, join with `; `), writes one stage file per subject next to the map and stages them. It refuses items edited since the audit and lists map keys the audit doesn't hold; rerun `A summary` and apply again for those.
6. `A summary` again and confirm the counts moved as expected. Report to the user: strings changed, dropped and kept, with reasons for the kept ones.

## Pitfalls

- The splitter cuts at `; `. A title with its own `; ` becomes two citations: write it with a comma. A trailing fragment it cut off (`updated 2026.`) stays behind when its citation is dropped: read the items' full sources and map the fragment to `null` too.
- To split a string that holds two documents, map it to both citations joined with `.; `. When the items under one string need different documents, use `"KEEP: per-item"` and an `edits` file.
- Before the dry run, read the whole map and run every value through `split_citations` and `citation_form` from `authoring.py`.
- `groups` misses wordings whose titles differ (a label with and without its dosage form). After merging, group labels by brand and year, and scan for strings with two publisher-year endings.
- Crossref gives a journal article's record without a fetch (`api.crossref.org/works/<DOI>`, or `?query.bibliographic=<title>`). A title search often returns comments and corrigenda first: confirm the DOI's own record. Crossref and Europe PMC rate-limit (HTTP 429, 503): pace requests, retry, and run long checks in the background.
- `apply` takes about 2 minutes per 450 items: run large maps in the background.
- A replacement source needs the tested point read in full text. Many "most common" keys have no primary document that ranks them: allow about 15 minutes per string, then drop the citation.
- Subagent batches: 20 to 25 strings sorted by document type, three at once. Give each string up to 3 items (stem, key, full sources) and the bank's full-form citations that share its title words. Tell them to reuse a bank wording that matches the record, to quote the supporting sentence for every replacement, to search before dropping, and to skip `save-source` (parallel writes to the ledger).

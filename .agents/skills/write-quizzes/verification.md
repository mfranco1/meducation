# Verifying facts

For roles with web access: writers, the judge and the replacement writer. Load web search and fetch tools first if they are deferred (in Claude Code: ToolSearch with `select:WebSearch,WebFetch`).

## What to verify

Verify in the primary document every fact that depends on a guideline, classification, set of criteria, staging system, threshold, dose or schedule revised in the last 10 years, and every article or section number, penalty, period and amount from a law, regulation or circular, however old. Numbers, cutoffs and rules given to you in briefs or notes are prompts, not verified facts. Stable textbook facts need no lookup.

## Ledger first

The source ledger (`var/quiz-work/sources.json`, shared by all subjects) records documents already verified, read only as a summary, or blocked, with the facts confirmed in them. Look up each document before searching:

```sh
python3 -I .agents/skills/write-quizzes/quiz_work.py --work <work> ledger --find <term>...
```

It prints entries containing every term, newest first. Reuse facts marked `verified` without fetching again, and don't retry documents marked `blocked`. An older edition can still be marked `verified`: check for a newer entry of the same document before reusing it.

## Procedure

1. Search for the newest version of the document first, and cite that edition.
2. Fetch the publisher's full text (journal, PubMed Central, society, government or WHO site). Search results, abstracts and secondary summaries only locate the document.
3. Confirm the exact numbers and wording there. State a recommendation's strength or certainty grade only if you read it there.
4. When a fetch is refused, look up the site or issuing body in [fetch-access.md](fetch-access.md). For a site not listed, try the PubMed Central copy (Europe PMC when PMC shows a browser check), then the Web Archive raw form (`web.archive.org/web/<timestamp>id_/<url>`, fetched with `curl -sL` because WebFetch refuses web.archive.org), then a copy hosted by another society, agency or university repository. When you verify a fact in another body's guideline, cite that body, and name it in the stem where the bodies differ.
5. For a law or circular, also confirm the provision is still in force: not repealed, amended, or a lapsed transition rule. Review handouts often keep superseded rules. Never write a provision number you didn't confirm.
6. If the primary text can't be reached by any route, don't write the numbers. Test the concept without them, or list the fact as unverified. "Written from memory" is never a reason to list a fact as unverified; listing it comes only after every route failed. Never cite a document you didn't read.

## Records

Write every check to the sources file you are given:

```json
[{ "title": "", "year": "", "url": "", "status": "verified | summary-only | blocked | unconfirmed", "facts": ["one short confirmed fact"] }]
```

`year` is the document's revision year, `url` the document's own page (not a home or search page), and each fact a specific point confirmed there, never "read in full".

List each guideline-dependent fact you couldn't confirm in a primary text, including facts read only in a summary or abstract, in the unverified file you are given, with `item` the item's number in its quiz:

```json
[{ "item": 12, "fact": "IPNA 2022 steroid-resistance definition, abstract only" }]
```

In your summary, report any working fetch route for a site missing from `fetch-access.md`, any listed route that failed, and any retired term or edition missing from `currency-notes.md`. The orchestrator adds them.

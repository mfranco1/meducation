# Card standards

How to write and review a flashcard. Write as a senior attending physician and medical educator. The output is parsed by software.

## Content

Follow the shared [content-standards.md](../../shared/content-standards.md) (facts, Philippine audience, originality, citations, language). Then:

- High-yield only: what a licensure exam tests or a new physician needs. No trivia, and no fact a card needs a paragraph to state.

## One card, one fact

- The front asks for exactly one thing, and the back has one answer an expert would accept. A front that several answers fit ("What causes anemia?") needs a qualifier that leaves one ("most common cause worldwide").
- Split a list of more than 4 unordered members into cards on what distinguishes each, or use a widely known mnemonic. Use a table when 2 or more entities are compared on 2 or more features; the front then asks for the comparison ("Compare X and Y.").
- The front is self-contained: the app shows one card at a time, so never refer to other cards or to "the above". Name the condition, drug or setting the fact belongs to.
- The front doesn't contain or hint at the answer, and the back doesn't repeat the front.
- Prefer why and how (mechanism, discriminating finding, next step) to bare definitions where both would work.
- No yes/no fronts unless the back gives the reason, and no negative fronts ("Which is not...").

## Format

- **Front**: one question or prompt, usually under 100 characters ("Which enzyme...?", "JVP y descent: event.").
- **Back**: the answer first, in bold when it is a term or value, then at most one short sentence of reason or context. Usually under 150 characters outside tables.
- Both faces take Markdown.
- **Sources**: the references as [content-standards.md](../../shared/content-standards.md#citations) describes, for cards with a guideline-dependent fact and for every corrected card; omit it for stable textbook facts.

```json
{ "cards": [
  { "front": "Which enzyme lets the liver export free glucose?", "back": "**Glucose-6-phosphatase**" },
  { "front": "Why does severe insulin deficiency cause ketosis?", "back": "Unrestrained lipolysis supplies fatty acids for hepatic ketone production." },
  { "front": "<a guideline-dependent question, naming the body>", "back": "**<value>** <one short reason>", "sources": "<Organization>. *<Title>*. <Publisher>; <year>." } ] }
```

## Duplicates

`fronts.txt` holds every staged card of the subject as `- <front> | <back>` lines under `## <Topic> › <Deck>`, plus `(unstaged)` sections for cards being written. A card is a duplicate when a staged card already teaches the same fact, whatever its wording. Read your topic's sections in full and grep the file for each new card's answer term. The same entity from a different angle (mechanism in one card, adverse effect in another) is welcome.

## Review output

A JSON array with one entry per card that needs work; unlisted cards are accepted. `deck_work.py build` applies entries exactly as written, so give complete final values for each edited field.

```json
[{ "ref": "<copied from the card>", "severity": "inaccurate | outdated | unclear | duplicate | format",
   "edits": { "back": "<full new back>" }, "reason": "<one or two sentences, with the source when a fact changes>" },
 { "ref": "<ref>", "severity": "duplicate", "drop": true, "reason": "Same fact as <front of the staged card>." }]
```

- `edits` keys: `front`, `back`, `sources`. Send only the fields that change; `"sources": ""` removes it.
- Fix rather than drop. Drop only a duplicate, a card that is wrong beyond repair, or trivia.
- **Existing cards** (refs that are card IDs) are published content. Change only what is inaccurate, outdated or unclear enough to mislead, with the smallest edit that fixes it. Never restyle, reword, reformat or shorten a correct card, and never change numbers, units or terminology without a source in the reason.

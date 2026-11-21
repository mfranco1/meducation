# Blueprint

Read this when a subject has no approved blueprint, or to enlarge or split staged quizzes.

Note the existing topics, quizzes, sizes and subtopics in the outline. List and skim the sources, if any, and extract them as plain text to `<work>/src/`.

Write `<work>/blueprint.json` and a short coverage summary:

```json
{ "topics": [ { "name": "Neonatology", "description": "", "quizzes": [ { "name": "Neonatal Jaundice and Sepsis", "description": "One sentence on scope.", "target": 80, "pages": "10-12",
  "subtopics": { "Neonatal Hyperbilirubinemia": 20 }, "excludes": ["Rehydration plans (Preventive Pediatrics › IMCI and Dehydration)"] } ] } ] }
```

- Cover every source section, every in-scope topic, and the high-yield content a well-prepared examinee and a safe new physician should know, even where the sources are silent.
- Weight subtopics by exam frequency and clinical importance, not by source page count.
- Order topics and quizzes for learner progression. Use existing topics where they fit. Add a topic only when its content fills 2 quizzes of 50; otherwise merge it into a related topic.
- Sizing: at least 2 quizzes per topic. Topics with 2 quizzes target 50 questions per quiz, 3 or 4 quizzes target 40, 5 or more target 30. Keep topics and quizzes balanced.
- Quiz names are specific, don't repeat the topic name, and split by subtopic (never "Part 2"). Every quiz gets a one-sentence description; new topics get 1 to 2 sentences, existing topics none.
- `pages` refers to form-feed-separated pages of `src/main.txt`; `slices` writes them to each quiz's `source-<n>.txt`.
- **Deconflict.** Each tested point belongs to one quiz. Compare every quiz with the outline and with every other planned quiz, in the same topic and in others. Give a shared point to one quiz and list it in the other's `excludes`, naming where it lives.

Show the user the coverage summary (topics, quizzes, targets) and wait for approval before writing.

## Enlarging a staged quiz

- Set the quiz's final `target` and `subtopics`, and add `"add": { "target": 10, "subtopics": { ... }, "notes": "..." }` with only the new items. `slices` briefs the writer for those, and the gate checks them. Remove `add` after staging. Brief and batch numbers are the quiz's position in its topic.
- Writers follow `add` notes literally, so a note naming a staged point becomes a near-duplicate. Before spawning (and again when resuming), grep `stems.txt` for every point the notes name and replace or strike it when a staged stem already tests it, or a stem in the same quiz gives its key as a clue. Grep the entity and its synonyms, the expected key (a stem can key the entity without naming it), the findings, genes or variant names that describe it, and its treatment and antidote. Use word roots (`bit`, not `bite`) and read every match in the point's own quiz, not a sample. Other subjects don't count.
- Name each note's point without asserting a threshold, schedule or guideline position.

### Gap-filling top-ups

For a measured gap such as "most common X" recall:

- Give writers the required stem form, the fact classes it covers and a minimum count. List required points apart from optional extras and give each a slot in `add.subtopics` (add a subtopic if none fits): writers follow subtopic counts over notes and pick side facts over headline ones.
- Scope each ranking to where a source ranks it: the Philippines only with a Philippine source, otherwise regional or global, never one foreign country. Strike a point whose key is the sole or defining cause (PML and JC virus), since no source ranks it.
- When checking `stems.txt`, also grep the ranking wording in either order and its paraphrases ("accounts for most", "majority of", "highest risk", "strongest") and the setting's synonyms ("hospital-onset", "nosocomial"). A staged "most likely cause" vignette with the same pairing is a near-duplicate, though it doesn't count toward the gap.
- Before review, count the stems that match the form and check that each required point has an item.

## Splitting a staged quiz

Run `split-quiz`: it moves the named subtopics' questions, with their IDs, into a new quiz after the old one, and can rename the old one. Then refresh the outline, give each changed quiz its `add`, replace the old quiz name in every `excludes`, and move the topic's earlier work files into a subfolder so `merge` doesn't pick up stale `batch-<n>.json`.

```sh
.venv/bin/python scripts/local-authoring/job.py split-quiz --subject "<Subject>" --quiz "<Old>" --subtopic "<Sub>"... --name "<New>" --description "..." --rename "<Old renamed>" --rename-description "..." --actor agent:write-quizzes
```

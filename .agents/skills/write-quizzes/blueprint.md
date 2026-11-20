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
- Writers follow `add` notes literally, so a note naming a staged point becomes a near-duplicate. Before spawning (and again when resuming), check every point the notes name against the whole `stems.txt`: its key term, its treatment and antidote terms (often staged under another topic), and the expected key in the quiz's own section under other wording. Replace or strike each staged point.
- Name each note's point without asserting a threshold, schedule or guideline position.
- **Gap-filling top-ups** (a measured gap such as "most common X" recall): give writers the required stem form, the fact classes it covers and a minimum count. Mark required points apart from optional extras, since writers given one list pick the side facts over the headline ones. Give every required point a slot in `add.subtopics` (add a subtopic if none fits), since writers follow the subtopic counts over the notes. Scope a required point to the Philippines only after finding a Philippine source that ranks it; otherwise writers can't verify it and reviewers rescope it to global. A required point is a near-duplicate when a staged stem already gives its expected key as a clue (a vignette listing the adverse effect a "most common adverse effect" item would key): grep every staged stem for the drug and strike such points. A point is also staged when a stem asks the same ranking with the drug as its key, so the stem never names the drug: grep the ranking wording and the effect too ("most common adverse effect", the effect's name). A staged "most likely cause" vignette that keys the same entity-to-cause pairing also makes the point a near-duplicate, even though it doesn't count toward the gap: grep the syndrome's name and its findings, not only the ranking wording. Grep word roots (`bit`, not `bite`) and read every match in the point's own quiz, not a capped sample, since that quiz's vignettes are the likeliest duplicates. Strike a point whose key is the sole or defining cause (PML and JC virus), since no source ranks it and reviewers reword it out of the form. Before review, count the stems that match the form and check that each required point has an item.

## Splitting a staged quiz

Run `split-quiz`: it moves the named subtopics' questions, with their IDs, into a new quiz after the old one, and can rename the old one. Then refresh the outline, give each changed quiz its `add`, replace the old quiz name in every `excludes`, and move the topic's earlier work files into a subfolder so `merge` doesn't pick up stale `batch-<n>.json`.

```sh
.venv/bin/python scripts/local-authoring/job.py split-quiz --subject "<Subject>" --quiz "<Old>" --subtopic "<Sub>"... --name "<New>" --description "..." --rename "<Old renamed>" --rename-description "..." --actor agent:write-quizzes
```

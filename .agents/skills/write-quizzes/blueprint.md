# Blueprint

Read this when a subject has no approved blueprint, or when enlarging or splitting staged quizzes.

Note the existing topics, quizzes, sizes, subtopics and stems in the outline. List and skim the sources, if any, and extract them to `src/`.

Write `<work>/blueprint.json` and a short coverage summary:

```json
{ "topics": [ { "name": "Neonatology", "description": "", "quizzes": [ { "name": "Neonatal Jaundice and Sepsis", "description": "One sentence on scope.", "target": 80, "pages": "10-12",
  "subtopics": { "Neonatal Hyperbilirubinemia": 20 }, "excludes": ["Rehydration plans (Preventive Pediatrics › IMCI and Dehydration)"] } ] } ] }
```

- Cover every source section, every in-scope topic, and the high-yield content a well-prepared examinee and a safe new physician should know, even where the sources are silent.
- Weight subtopics by exam frequency and clinical importance, not by how many pages a source spends on them.
- Order topics and quizzes for learner progression (foundations before applications). Use existing topics where they fit. Add a topic only when its content fills 2 quizzes of 50. Otherwise merge it into a related topic.
- Quiz names are specific and don't repeat the topic name. Split by subtopic, not "Part 2". Every quiz gets a one-sentence description. New topics get a 1 to 2 sentence description, and existing topics get none.
- **Deconflict.** Each tested point belongs to one quiz. Compare every quiz with the existing outline subtopics and with the other planned quizzes, including other topics (for example rehydration in a gastroenterology quiz and in an IMCI quiz, or iron in nutrition and in hematology) and quizzes in the same topic (fracture-nerve associations in a bones quiz and the same nerve lesions in a nerves quiz). Give the point to one quiz and list it in the other's `excludes`, naming where it lives.

Show the user the coverage summary (topics, quizzes, targets) and wait for approval before writing. For work that spans sessions, keep a tracker (see Sessions and lessons in [SKILL.md](SKILL.md)).

## Enlarging or splitting a staged quiz

- **Enlarge.** Set the quiz's final `target` and `subtopics`, and add `"add": { "target": 10, "subtopics": { ... } }` with only the new items. `slices` briefs the writer for those and the gate checks them. Remove `add` after staging.
- **Split.** Run `split-quiz` first: it moves the named subtopics' questions, with their IDs, into a new quiz after the old one and can rename the old one. Then refresh the outline, give each changed quiz its `add`, replace the old quiz name in every `excludes` of the blueprint, and move the topic's earlier work files into a subfolder so `merge` doesn't pick up stale `batch-<n>.json`.

```sh
.venv/bin/python scripts/local-authoring/job.py split-quiz --subject "<Subject>" --quiz "<Old>" --subtopic "<Sub>"... --name "<New>" --description "..." --rename "<Old renamed>" --rename-description "..." --actor agent:write-quizzes
```

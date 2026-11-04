# Metadata

Every item has `metadata` with these four fields. They feed analytics, so use controlled values exactly as written. Allowed values for `system`, `questionType` and `difficulty` are in [vocabulary.json](vocabulary.json), and the batch report warns on anything else.

- `subtopic`: a specific Title Case label, e.g. `Neonatal Hyperbilirubinemia`, `Nephritic Syndromes`. Use the blueprint's subtopic names, and reuse the exact string for every item on that subtopic. Reuse existing subtopic strings from the outline when they fit.
- `system`: the organ system the item tests, from the vocabulary. Use `Multisystem` for systemic disease, e.g. sepsis or multisystem inflammatory syndrome. Use `General Principles` for growth, nutrition, immunization schedules, genetics, pharmacology principles and biostatistics that don't belong to one organ.
- `difficulty`: `easy`, `medium` or `hard` (author estimate).
- `questionType`: the task the item asks of the learner, from the vocabulary. `Clinical Vignette: Next Step` is the immediate diagnostic or therapeutic step. `Clinical Vignette: Management` is the definitive treatment choice. `Multi-step Reasoning` chains two or more inferences.

Do not set `metadata.topic` or `tags`. If a genuinely new value is needed, add it to `vocabulary.json` in the same change and tell the user.

# Contributor documentation

Start with the repository [README](../README.md) for frontend setup, default API mode, explicit local-content mode, build commands, and the local editor. [Backend setup](../backend/README.md) owns Python environment and content-service instructions.

## Find the right guidance

- **Understand the application:** [product behavior](product.md) describes learner flows; [architecture](architecture.md) explains composition, domain/content/storage boundaries, loading, and authoring.
- **Keep or recover progress:** [progress backup and recovery](progress-backup.md) explains downloads, explicit replacement, limits, errors and diagnosis using copies.
- **Edit or review content:** [content management](content-management.md) covers staged authoring, exports, validation, provenance, and [ignored local material](content-management.md#local-source-material-and-generated-output). [Question schema](question-schema.md) and [flashcard schema](flashcard-schema.md) define the canonical contracts.
- **Change the UI:** [design system](design-system.md) owns theme, accessibility, responsive study layouts, feedback, and loading conventions. Preserve source wording while changing presentation.
- **Verify a change:** [testing](testing.md) covers frontend, backend, content, and browser checks, fixture ownership, and [detailed regression requirements](testing-regressions.md).
- **Understand repository rules:** [AGENTS.md](../AGENTS.md) defines the invariants and contribution policy. [Architecture decisions](decisions/) record consequential choices; read their status alongside the current architecture.
- **Follow active work:** [work tracking](work/README.md) explains where to create ongoing trackers and record stage gates. [Completed trackers](work/done/) preserve history; their past paths and counts are not the current specification.

## Repository agent skills

The repository-local skills under `.agents/skills` provide focused workflows and link back to the current owner documentation. Invoke them by name:

- `$meducation-completion-audit` — [audit outcomes and verification before marking work done](../.agents/skills/meducation-completion-audit/SKILL.md).
- `$meducation-code-review` — [review code changes for actionable defects](../.agents/skills/meducation-code-review/SKILL.md).
- `$meducation-architecture-review` — [assess ownership, dependencies, and architectural contracts](../.agents/skills/meducation-architecture-review/SKILL.md).
- `$meducation-refactor` — [improve structure while preserving behavior and content](../.agents/skills/meducation-refactor/SKILL.md).

## Keep guidance consistent

Update the document that owns the behavior or contract when it changes, then adjust its entry-point links. Keep root README focused on getting started and DESIGN focused on linking to the design system. Use work trackers for execution history rather than adding historical check results to product/reference guidance.

Create new trackers under `docs/work/ongoing`, and move them to `docs/work/done` after implementation and relevant verification are complete.

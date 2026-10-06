# Contributor documentation

Start with the repository [README](../README.md) for frontend setup, default API mode, explicit local-content mode, build commands, and the local editor. [Backend setup](../backend/README.md) owns Python environment and content-service instructions.

## Find the right guidance

- **Understand the application:** [product behavior](product.md) describes learner flows; [architecture](architecture.md) explains composition, domain/content/storage boundaries, loading, and authoring.
- **Edit or review content:** [content management](content-management.md) covers staged authoring, exports, validation, provenance, and [ignored local material](content-management.md#local-source-material-and-generated-output). [Question schema](question-schema.md) and [flashcard schema](flashcard-schema.md) define the canonical contracts.
- **Change the UI:** [design system](design-system.md) owns theme, accessibility, responsive study layouts, feedback, and loading conventions. Preserve source wording while changing presentation.
- **Verify a change:** [testing](testing.md) covers frontend, backend, content, and browser checks, fixture ownership, and regression requirements.
- **Understand repository rules:** [AGENTS.md](../AGENTS.md) defines the invariants and contribution policy. [Architecture decisions](decisions/) record consequential choices; distinguish their planned implementation from the current architecture.
- **Follow active work:** [ongoing trackers](work/ongoing/) record implementation status and stage gates. [Completed trackers](work/done/) preserve history; their past paths and counts are not the current specification.

## Keep guidance consistent

Update the document that owns the behavior or contract when it changes, then adjust its entry-point links. Keep root README focused on getting started and DESIGN focused on linking to the design system. Use work trackers for execution history rather than adding historical check results to product/reference guidance.

Create new trackers under `docs/work/ongoing`, and move them to `docs/work/done` after implementation and relevant verification are complete.

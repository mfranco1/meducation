---
name: meducation-refactor
description: Refactor Meducation code in small behavior-preserving steps using its checked ownership boundaries and regression gates. Use for requested cleanup, extraction, module moves, and maintainability work; do not silently bundle features or content corrections.
---

# Meducation refactor

## Define the preservation baseline

Read [AGENTS.md](../../../AGENTS.md), applicable nested instructions, [architecture](../../../docs/architecture.md), [testing](../../../docs/testing.md), and affected [regression requirements](../../../docs/testing-regressions.md). Inspect the implementation and callers before choosing a structure. Identify the concrete maintenance problem and the smallest coherent improvement; do not rewrite working code merely to impose a pattern.

Inspect working-tree changes and preserve unrelated work. Create or update a tracker under `docs/work/ongoing` with scope, intended steps, protected contracts, and selected verification. Treat behavior changes or schema migrations as separate explicit scope, not incidental cleanup.

Before editing, record hashes of both canonical JSON banks and inspect their existing diffs so pre-existing user edits are part of the baseline. Protect authored text, formatting, order, IDs, answer provenance, and verified-answer precedence. The `.generated` names do not make these banks disposable. Also identify affected storage keys/formats, public contracts, deterministic revisions/exports, and UI behavior to preserve.

## Refactor within existing ownership

Follow the architecture document and `scripts/architecture/boundaries.mjs` when choosing destinations and imports:

- Keep domain/analytics framework independent and storage behind repositories. Preserve feature session coordination and pure selectors; screens consume data and callbacks.
- Keep composition/navigation in app, feature-specific code with its feature, and genuinely reused presentation in shared UI. Do not introduce sibling-feature dependencies, broad barrels, forwarding shims, or empty layers.
- Keep content schemas, validation, local/API adapters, rich-text policies, and admin core/data/presentation responsibilities distinct.
- Preserve lazy screen and bank loading, learner/admin entry behavior, local-content mode, and QA imports. Retain shared sanitization/math policies and locally bundled KaTeX assets.
- Maintain the existing read-only service where affected; do not add backend infrastructure or runtime generative AI.

Move/extract in reviewable steps and update all callers, test imports, and tool/config references together. Keep unrelated formatting out of the diff. Add a focused behavior test only when needed to protect a meaningful uncovered risk; do not write tests that mirror the new implementation. Fixtures must remain independent of authored records and production record counts.

If a discovered bug changes observable behavior, distinguish it from the refactor and handle it only within the user's authorized scope. Preserve existing storage compatibility; use a deliberate migration and parity plan if a contract change is explicitly requested.

## Verify preservation and finish

Run focused affected tests during iteration. Before handoff, apply the source/config-move and affected-area gates from testing documentation: frontend lint/format/architecture tests/unit tests/content validation/build as applicable; both build modes and browser suites for UI/features/loaders/entries; Python checks for backend/shared stored contracts or fixtures. `npm run build` includes the minimum TypeScript check. Run learner/admin builds and browser workflows sequentially because output is shared; do not use prepared browser tests against stale builds.

Compare the final canonical hashes with the pre-edit baseline. Investigate any difference; never restore over the user's pre-existing changes. Inspect the final diff and `git diff --check`, verify removed modules have no remaining consumers, and update current owner documentation if responsibilities or paths changed.

Record actual checks, results, and limitations in the tracker. Do not mark the refactor done while relevant required checks fail or are unverified. Once complete, move the tracker to `docs/work/done` and report the concrete maintenance improvement, preserved behavior, verification evidence, and any remaining risk. Do not commit, merge, or publish unless separately requested.

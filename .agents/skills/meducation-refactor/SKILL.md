---
name: meducation-refactor
description: Refactor Meducation code in small behavior-preserving steps using its checked ownership boundaries and regression gates. Use for requested cleanup, extraction, module moves, and maintainability work; do not silently bundle features or content corrections.
---

# Meducation refactor

Follow the [central simplicity policy](../../../AGENTS.md#engineering-philosophy): extend existing code, justify new moving parts, and remove obsolete code. Ownership boundaries do not require separate files or abstractions.

## Define the preservation baseline

Read [AGENTS.md](../../../AGENTS.md), applicable nested instructions, [architecture](../../../docs/architecture.md), [testing](../../../docs/testing.md), and affected [regression requirements](../../../docs/testing-regressions.md). Inspect the implementation and callers before choosing a structure. Identify the concrete maintenance problem and the smallest coherent improvement; do not rewrite working code merely to impose a pattern.

Inspect working-tree changes and preserve unrelated work. Create or update a tracker under `docs/work/ongoing` with scope, intended steps, protected contracts, and selected verification. Treat behavior changes or schema migrations as separate explicit scope, not incidental cleanup.

For content-affecting work, capture explicit current PostgreSQL draft/release identities and export digests as the preservation baseline. Never import an old snapshot over current database work. Protect authored text, formatting, order, IDs, answer provenance, and verified-answer precedence. Database exports are inspection/recovery artifacts, never a runtime fallback. Also identify affected storage keys/formats, public contracts, deterministic revisions/exports, and UI behavior to preserve.

## Refactor within existing ownership

Follow the architecture document and `scripts/architecture/boundaries.mjs` when choosing destinations and imports:

- Keep domain/analytics framework independent and storage behind repositories. Preserve feature session coordination and pure selectors; screens consume data and callbacks.
- Keep composition/navigation in app, feature-specific code with its feature, and genuinely reused presentation in shared UI. Do not introduce sibling-feature dependencies, broad barrels, forwarding shims, or empty layers.
- Keep content schemas, validation, API adapters, rich-text policies, and admin core/data/presentation responsibilities distinct.
- Preserve lazy API/screen loading and learner/admin entry behavior. Do not restore retired local content, JSON authoring or bundled QA paths. Retain shared sanitization/math policies and locally bundled KaTeX assets.
- Preserve the existing PostgreSQL delivery and authenticated paired-authoring contracts where affected; do not add backend infrastructure or runtime generative AI.

Prefer deleting, inlining, or consolidating over extracting new layers. Change one coherent responsibility at a time and update its callers, test imports, and tool/config references together. Keep unrelated formatting out of the diff. Add a focused behavior test only when needed to protect a meaningful uncovered risk; do not write tests that mirror the new implementation. Fixtures must remain independent of authored records and production record counts.

If a discovered bug changes observable behavior, distinguish it from the refactor and handle it only within the user's authorized scope. Preserve existing storage compatibility; use a deliberate migration and parity plan if a contract change is explicitly requested.

## Verify preservation and finish

Run focused affected tests during iteration. Select additional gates by the changed contracts in [testing](../../../docs/testing.md#selecting-verification); do not require unrelated suites or database access for ordinary source moves. `npm run build` includes the minimum TypeScript check. Run learner/admin builds and browser workflows sequentially because output is shared; do not use prepared browser tests against stale builds.

Compare protected PostgreSQL/export content digests with the pre-edit baseline when content boundaries are affected. Investigate any difference; never restore over the user's pre-existing changes. Inspect the final diff and `git diff --check`, verify removed modules have no remaining consumers, and update current owner documentation if responsibilities or paths changed.

Record actual checks, results, and limitations in the tracker. Do not mark the refactor done while relevant required checks fail or are unverified. Once complete, move the tracker to `docs/work/done` and report the concrete maintenance improvement, preserved behavior, verification evidence, and any remaining risk. Do not commit, merge, or publish unless separately requested.

---
name: meducation-architecture-review
description: Assess Meducation designs or implementations for module ownership, dependency direction, data contracts, loading boundaries, and maintainability. Use for architecture reviews and structural change proposals, without implementing a redesign unless requested.
---

# Meducation architecture review

Follow the [central simplicity policy](../../../AGENTS.md#engineering-philosophy): extend existing code, justify new moving parts, and remove obsolete code. Ownership boundaries do not require separate files or abstractions.

## Ground the assessment

Read [AGENTS.md](../../../AGENTS.md), applicable nested instructions, [current architecture](../../../docs/architecture.md), and [ownership decision](../../../docs/decisions/0001-repository-ownership-and-boundaries.md). Inspect the actual modules and `scripts/architecture/boundaries.mjs`; current documentation and executable policy outrank paths in completed trackers. If they disagree, identify the discrepancy rather than quietly changing enforcement.

Establish the requested scope and the concrete pressure driving the review. For a proposal, distinguish proposed behavior from existing implementation. For an implementation, trace representative entry-to-content and session-to-storage paths through the changed area. Review is diagnostic unless implementation is authorized.

## Assess boundaries and contracts

- Keep `src/app` as learner composition/navigation and concrete service wiring. Quiz and flashcard features own their respective screens, sessions, and selectors; they cannot import sibling features or app/admin/QA.
- Domain owns pure rules/types/contracts. Analytics owns pure aggregation. Persistence owns storage repositories/codecs. Keep React/MUI out of these layers and content; browser storage access belongs in persistence. Concrete feature storage imports belong in sessions, with selector contract-type access as allowed by policy.
- Shared UI accepts data/callbacks and serves demonstrated reuse or an application-wide responsibility. Avoid feature-dependent shared components, broad barrels, forwarding modules, and speculative abstractions.
- Content owns stored schemas, PostgreSQL-backed API delivery, validation, and framework-independent rendering policies. Admin core/data remains independent of presentation; authoring may consume shared UI/content validation through allowed edges.
- Preserve stable identifiers, authored text/order, source versus verified answers, storage formats, deterministic serialization/revision parity, and export/replay contracts. Read the relevant schema/content documents linked by architecture when these are affected.
- Inspect static, type-only, re-export, and dynamic edges; ownership restrictions apply to types too. Preserve learner startup and route splitting: eager canonical-bank or validation-pipeline loading is a regression. The import graph does not prove arbitrary runtime behavior.
- Recognize the existing PostgreSQL learner delivery and authenticated paired-authoring service. Keep learner progress local and behind interfaces; do not introduce backend infrastructure or speculative cloud persistence without explicit scope. No runtime generative AI.

Assess failure boundaries as well as happy paths: API revision conflicts, stale loads, storage failure, and paired authoring transactions should retain their owning layer and recovery contract. Use [product behavior](../../../docs/product.md) to judge observable consequences, not a preferred architecture alone.

## Gather evidence

For implemented edges, run `npm run check:architecture`. When boundary policy or resolver behavior changes, include `npm run test:architecture` and lint. Use [testing](../../../docs/testing.md) and [regressions](../../../docs/testing-regressions.md) for build-mode, browser, content, and Python requirements. Inspect both learner/admin bundle behavior when entry/lazy imports change. If implementing changes, include the required TypeScript/build checks. A design-only review should label checks that cannot apply yet rather than pretending a proposal passed implementation gates.

## Deliver an actionable assessment

Present evidence-backed boundary violations and risks first, with affected paths, user/maintenance consequences, and severity. Separate required repairs from optional improvements. Recommend the smallest coherent change and explain its tradeoff, compatibility obligations, and verification approach. A broader redesign needs a demonstrated benefit proportional to migration cost.

Use an ongoing tracker for sustained review work. If implementation changes an architectural contract, update its owner documentation and add an architecture decision only for a consequential choice. Do not rewrite completed historical trackers. Distinguish review completion from implementation acceptance, and identify any unresolved gaps without claiming public-launch readiness.

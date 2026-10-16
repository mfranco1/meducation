---
name: meducation-refactor
description: Refactor or simplify Meducation code in behavior-preserving steps. Use for requested cleanup, consolidation, deletion and maintainability work.
---

# Meducation refactor

Read [AGENTS.md](../../../AGENTS.md) and [architecture](../../../docs/architecture.md). Inspect the implementation and callers, identify the concrete maintenance cost, and choose the smallest change that removes it. Prefer deleting, inlining and consolidating over extracting new layers.

Preserve observable behavior, storage formats, API contracts, content text/order/IDs/provenance and lazy loading. Treat behavior changes and schema migrations as separate, explicit scope.

Update callers, tests, docs and config references in the same change. Delete tests that only pinned removed internals; add a behavior test only for a real uncovered risk.

Run the checks in [testing](../../../docs/testing.md) relevant to the change (at least `npm run build`), confirm removed modules have no remaining consumers, and report what changed, what was verified and any remaining risk. Do not commit unless asked.

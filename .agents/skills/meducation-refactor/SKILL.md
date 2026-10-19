---
name: meducation-refactor
description: Refactor or simplify Meducation code in behavior-preserving steps. Use for requested cleanup, consolidation, deletion and maintainability work.
---

# Meducation refactor

Follow [AGENTS.md](../../../AGENTS.md) and [architecture](../../../docs/architecture.md). Name the concrete maintenance cost first, then make the smallest change that removes it; prefer deleting, inlining and consolidating over new layers.

Preserve observable behavior, storage formats, API contracts, content text/order/IDs and lazy loading. Behavior changes and schema migrations are separate, explicit scope. Confirm removed modules have no remaining consumers. Do not commit unless asked.

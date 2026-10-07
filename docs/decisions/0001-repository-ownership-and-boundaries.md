# 0001 — Repository ownership and dependency boundaries

Date: 2026-10-06. Status: implemented on 2026-10-07.

## Context

The repository already separates pure domain rules, static content, persistence, analytics, learner composition, and local authoring. Growth has put shared presentation inside learner directories and distributed feature work across screens, components, session hooks, and selectors. The existing Python content API is a separate package with a suitable `src` layout.

## Decision

Keep one frontend package and the existing backend package. Preserve the root Vite entry points and tool configuration. Group learner work into `src/features/quizzes` and `src/features/flashcards`; retain `src/app` for composition, navigation, lazy entry wiring, and learner navigation policy.

Use `src/shared/ui` for presentation with demonstrated cross-feature reuse or application-wide responsibility. Keep domain rules, persistence repositories/codecs, and pure analytics in their existing boundaries. Keep authoring under `src/admin`, with its core/data/presentation separation. Organize content by schema, validation, local adapters, API delivery, and rich-text policies while retaining both authoritative JSON files at their current paths.

Dependency direction:

- App composition wires concrete repositories and features.
- Features use domain contracts, pure selectors, content interfaces, and shared UI; they do not import app composition, admin, or sibling features.
- Shared UI uses React/MUI and lower-level content/rendering policies, but does not import app, features, or admin. Its interfaces expose data and callbacks rather than navigation policy.
- Content does not import UI. Pure domain and analytics do not depend on React/MUI or concrete delivery/storage implementations.
- Persistence implements domain contracts; browser storage access stays inside repositories.
- Admin core/data does not depend on presentation. Admin and development QA may use shared UI and content validation explicitly.

Keep relative imports during the first moves. Introduce aliases only with consistent compiler, bundler, test, script, and lint resolution. Enforce boundaries once the moves and type ownership are settled; assess dynamic imports and cycles separately from static import restrictions.

## Consequences

Feature changes become easier to locate without introducing workspace packages or a new framework. Moving shared UI changes bootstrap and lazy import graphs, so preserve bundle boundaries and test both learner/admin entries. Content paths, ordering, answers, IDs, storage formats, and export/replay contracts remain protected migration baselines.

Avoid broad barrels, speculative shared components, empty directories, and subdivisions of small stable modules. Generic toasts own notification presentation; content-error message mapping belongs with loading/recovery presentation, outside generic toast implementation. Shared screen-transition primitives may move together because the loading boundary consumes their duration constant.

## Implementation

All stages are implemented and verified. See the [completed organization tracker](../work/done/repository-organization-plan.md), [frozen Stage 0 baseline](../work/done/repository-organization-baseline.md), and [current ownership and enforcement rules](../architecture.md#repository-ownership). Reassess this decision if package ownership or deployment boundaries materially change.

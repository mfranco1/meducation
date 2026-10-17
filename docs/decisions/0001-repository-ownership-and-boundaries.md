# 0001 - Repository ownership and dependency boundaries

Status: implemented.

## Context

Shared presentation had grown inside learner directories and feature work was spread across screens, components, hooks and selectors. The Python API is a separate package with a suitable `src` layout.

## Decision

Keep one frontend package and one backend package, with the root Vite entries and tool configuration unchanged. Group learner work in `src/features/quizzes` and `src/features/flashcards`; keep `src/app` for composition and navigation. Put reusable presentation in `src/shared/ui`. Keep domain, persistence and analytics flat and independent of React. Keep authoring in `src/admin` with `core`, `data` and presentation separated. Organize content by schema, validation, API delivery and rich-text policy.

Dependency direction: app wires concrete repositories; features use domain, selectors, content interfaces and shared UI and never import app, admin or sibling features; shared UI never imports app, features or admin; content, domain and analytics never import UI; browser storage access stays in persistence; admin core and data do not depend on presentation. Imports stay relative until an alias resolves consistently in TypeScript, Vite, tests, scripts and lint. The rules are enforced by lint (`eslint.config.mjs`).

## Consequences

Feature code is easier to find without new packages or frameworks. Moving shared UI changes bootstrap and lazy graphs, so both entries need testing. Avoid broad barrels, speculative shared components and empty directories. Current rules are in [architecture](../architecture.md).

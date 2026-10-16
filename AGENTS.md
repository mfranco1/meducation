# AGENTS.md

## Project

This is a browser-based interactive study platform built around a canonical, versioned question bank.

The current product is local-first and private. Implement current requirements; public hosting, cloud persistence, and additional infrastructure require explicit scope.

## Stack

- React
- TypeScript
- Vite
- Material UI
- FastAPI and PostgreSQL for paired content persistence
- localStorage for learner progress

Do not add backend infrastructure unless explicitly requested.

## Core Invariants

### 1. Canonical question bank is authoritative

The designated local PostgreSQL database is the only writable authority for the paired quiz/flashcard bank. Use the authenticated HTTP editor and server-reserved stable IDs. Saving a paired draft does not publish it.

PostgreSQL is also the only runtime content source. Repository JSON databases,
offline content mode and file-backed authoring are retired. Captured database
exports are read-only inspection/recovery artifacts, never application sources.
Never replace database-only work with a stale snapshot. Trusted imports are
reviewed recovery/migration jobs. Before authoritative creates, require the
admitted allocation fence and current locally retained journals (off-device
retention is user-deferred) described in `docs/L4-authoritative-recovery.md`.

Never silently modify, rewrite, correct, reorder, simplify, or otherwise alter:

- Question stems
- Answer choices
- Choice ordering
- Numbers
- Units
- Medical terminology
- Meaningful formatting

Make intentional corrections directly in the canonical record and preserve their rationale through answer provenance, review notes, or a documented content change.

### 2. Preserve answer provenance

Provided answer keys may be wrong.

Never overwrite the original answer key. Keep source and verified answers distinguishable.

The runtime quiz should use the verified answer when one exists.

### 3. No runtime generative AI

The application must not require or call an LLM at runtime.

Rationales, choice explanations, pearls, and metadata are development-time/static content.

### 4. Separate concerns

Keep domain/quiz logic independent from React UI.

Keep persistence behind an abstraction rather than scattering localStorage access throughout the application.

Keep question content separate from application code.

### 5. Stable IDs

Question, quiz, subject, and attempt identifiers must remain stable once established.

Do not regenerate IDs casually.

## Repository Guidance

Before making significant changes:

1. Inspect the existing implementation.
2. Read the relevant documentation for the area being changed.
3. Reuse existing patterns where appropriate.
4. Make the smallest coherent change.
5. Run relevant validation/tests/build checks.

Do not rewrite working code solely to impose a preferred architecture.

Follow the [repository ownership and checked dependency boundaries](docs/architecture.md#repository-ownership) when placing or importing modules.

## Documentation

Use the repository documentation as the source of truth for details:

- `docs/architecture.md` — system architecture and boundaries
- `docs/product.md` — product behavior and UX requirements
- `docs/question-schema.md` — question-bank structure and content rules
- `docs/content-management.md` — question-bank editing, enrichment, and validation
- `docs/design-system.md` — visual design and UI conventions
- `docs/testing.md` — testing and verification strategy

If these documents do not yet exist, create them when the corresponding work requires them.

### Progress Tracking

Use one concise Markdown tracker for sustained work. Routine edits do not need separate plans or machine-readable evidence files unless they establish a necessary contract or acceptance result.

- docs/work/ongoing - directory for ongoing progress trackers. Create new trackers here.
- docs/work/done - directory for completed trackers. Move trackers here once the task being tracked is completed.

If these directories and files do not exist yet, create them when the corresponding work requires them.

## Verification

After making changes, run the relevant project checks defined by the repository.

At minimum, ensure the project type-checks and builds successfully when those scripts are available.

For content changes, run question-bank validation.

Do not claim a change is complete if relevant checks are failing.

## Scope

More-specific `AGENTS.md` files may add or override guidance for their directory.

Prefer repository invariants and documented source-of-truth files over duplicating detailed implementation instructions here.

## Engineering Philosophy

Optimize for simplicity, clarity, maintainability, and fast iteration.

- Implement the simplest correct solution that satisfies current requirements.
- Prefer modifying existing code over introducing new files, layers, or abstractions.
- Reuse existing utilities, components, patterns, and framework capabilities before building new ones.
- Avoid speculative features, premature optimization, and architecture for hypothetical future needs.
- Do not introduce interfaces, factories, adapters, service layers, generic utilities, or configuration unless they solve a concrete, present problem.
- Prefer direct, readable code over excessive indirection. A little duplication is acceptable when it improves clarity.
- Keep dependencies minimal. Use existing dependencies or native functionality when practical.
- Avoid excessive defensive programming for impossible states or already-validated internal data. Validate at genuine trust boundaries.
- Keep tests focused on meaningful behavior, edge cases, and regressions. Avoid redundant or implementation-coupled tests.
- When replacing functionality, remove obsolete code and unnecessary compatibility layers when safe.
- Follow existing conventions when useful, but challenge patterns that introduce unnecessary complexity.
- Treat fewer moving parts and less code as positive outcomes, provided correctness, readability, and maintainability are preserved.

Before implementing, consider whether the task can be solved by simplifying or extending existing code.

After implementing, review the diff for unnecessary abstractions, duplication, boilerplate, and dead code. Remove anything that does not materially contribute to the solution.

Do not sacrifice security, correctness, or necessary error handling for brevity.

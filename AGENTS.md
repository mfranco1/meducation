# AGENTS.md

## Project

This is a browser-based interactive study platform built around a canonical, versioned question bank.

The current product is local-first and private, but the architecture should remain suitable for eventual public/commercial use and backend/cloud persistence.

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

Use md file trackers for tracking progress on ongoing work.

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

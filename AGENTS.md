# AGENTS.md

## Project

This is a browser-based interactive study platform that digitizes multiple-choice practice tests from PDFs.

The current product is local-first and private, but the architecture should remain suitable for eventual public/commercial use and backend/cloud persistence.

## Stack

- React
- TypeScript
- Vite
- Material UI
- localStorage for current persistence

Do not add backend infrastructure unless explicitly requested.

## Core Invariants

### 1. Source questions are immutable

The PDF is the source of truth.

Never silently modify, rewrite, correct, reorder, simplify, or otherwise alter:

- Question stems
- Answer choices
- Choice ordering
- Numbers
- Units
- Medical terminology
- Meaningful formatting

If the source appears incorrect, preserve it and record the issue separately.

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

## Documentation

Use the repository documentation as the source of truth for details:

- `docs/architecture.md` — system architecture and boundaries
- `docs/product.md` — product behavior and UX requirements
- `docs/question-schema.md` — question-bank structure and content rules
- `docs/content-pipeline.md` — PDF ingestion, enrichment, and validation
- `docs/design-system.md` — visual design and UI conventions
- `docs/testing.md` — testing and verification strategy

If these documents do not yet exist, create them when the corresponding work requires them.

## Verification

After making changes, run the relevant project checks defined by the repository.

At minimum, ensure the project type-checks and builds successfully when those scripts are available.

For content changes, run question-bank validation.

Do not claim a change is complete if relevant checks are failing.

## Scope

More-specific `AGENTS.md` files may add or override guidance for their directory.

Prefer repository invariants and documented source-of-truth files over duplicating detailed implementation instructions here.
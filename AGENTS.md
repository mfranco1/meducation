# AGENTS.md

## Project and scope

A browser-based study app (quizzes and flashcards) built on a canonical question bank of about 12k questions and 1.7k cards.

It is being prepared for hosted production: anonymous learners read published content and keep their progress in browser localStorage; a small number of authenticated editors author and publish content. Initial audience is a few hundred users.

Build for that and nothing larger. Use managed platform services (managed Postgres with point-in-time recovery, a managed identity provider or auth proxy, platform logs and deploys) instead of custom infrastructure. Do not design for multiple regions, multiple CPU architectures, speculative scale, or disaster scenarios the platform already covers.

## Stack

React, TypeScript, Vite, Material UI; FastAPI and PostgreSQL for content; localStorage for learner progress.

## Engineering rules

Optimize for simplicity, clarity and fast iteration. Fewer moving parts and less code are positive outcomes when correctness and security are preserved.

- Implement the simplest correct solution for current requirements. No speculative features or architecture for hypothetical needs.
- Extend or simplify existing code before adding files, layers, interfaces, adapters, services or configuration. A little duplication beats a premature abstraction.
- Prefer framework, platform and existing-dependency features over hand-rolled equivalents.
- Validate at genuine trust boundaries (HTTP input, uploaded files, stored data). Do not re-validate the same data in several layers or guard impossible states.
- When replacing or removing functionality, delete the obsolete code, its tests, its docs and its scripts in the same change.
- Do not add new infrastructure, CI jobs, operational scripts, drills, probes or load tests unless the user asks for them in the current task.
- Never sacrifice security, correctness or necessary error handling for brevity.

After implementing, review the diff and remove anything that does not materially contribute: abstractions, boilerplate, dead code, redundant tests, unneeded docs.

## Content invariants

### Canonical bank

PostgreSQL is the only authority and runtime source for the paired quiz/flashcard bank. Edit through the authenticated HTTP editor. Saving a draft does not publish it. Database exports are read-only artifacts, never application sources; never replace database work with an older snapshot.

Never silently modify, rewrite, correct, reorder or simplify question stems, answer choices, choice ordering, numbers, units, medical terminology or meaningful formatting. Make intentional corrections in the canonical record and record the rationale in answer provenance or review notes.

### Answer provenance

Provided answer keys may be wrong. Never overwrite the original answer key; keep source and verified answers distinguishable. The quiz uses the verified answer when one exists.

### No runtime generative AI

The application must not call an LLM at runtime. Rationales, explanations and metadata are static content.

### Stable IDs

Question, quiz, subject, deck, card and attempt IDs never change once established.

## Code organization

Keep domain logic independent of React, keep localStorage access inside `src/persistence`, and keep content out of application code. See [architecture](docs/architecture.md) for module boundaries.

## Documentation

Docs describe the current system only, briefly. No dated status layers, history narratives, superseded designs or restatements of what the code already says; git history is the archive.

- `docs/architecture.md`: module boundaries and data flow
- `docs/product.md`: product behavior
- `docs/question-schema.md`, `docs/flashcard-schema.md`: content contracts
- `docs/content-management.md`: authoring and validation
- `docs/design-system.md`: UI conventions
- `docs/testing.md`: how to verify changes
- `docs/operations.md`: running, backing up and deploying

Update the relevant doc in the same change when behavior or commands change. Do not create new docs without a clear need.

## Work tracking

Routine work needs no tracker. For multi-session work, keep one short Markdown tracker (under about 100 lines) in `docs/work/ongoing` with scope, remaining steps and decisions. Delete it when the work is done. Do not create evidence JSON files, logs of check runs, or "done" archives.

## Tests

Test observable behavior: what a user sees or what a caller gets. Do not assert call sequences, internal structure or implementation details, and do not duplicate the same coverage across unit, integration and browser suites. Use small synthetic fixtures.

## Verification

Before claiming a change is complete, run the checks relevant to it (see [testing](docs/testing.md)). At minimum `npm run build` for frontend changes and the backend tests for backend changes. Report failures honestly.

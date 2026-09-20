# Design

Meducation is a private, browser-based study platform for multiple-choice tests stored in a canonical JSON question bank. This document summarizes the design decisions and points to the detailed specifications in `docs/`.

## Goals and constraints

- Preserve stable questions, choice order, and answer provenance in the canonical bank. Record corrections and verified answers explicitly; never silently rewrite established content.
- Support learning with immediate feedback and exams with feedback after submission, including resumable attempts and clear indication of uncertain answer keys.
- Keep the current experience local-first and usable without an account or backend. No generative AI runs in the application.
- Maintain stable content and attempt IDs so progress survives content and application changes.

## System boundaries

- `src/content`: canonical question data, provenance, static explanations, and validation.
- `src/domain`: framework-independent quiz types, scoring, and attempt rules.
- `src/persistence`: attempt repository abstraction and its current `localStorage` implementation.
- `src/analytics`: aggregation of completed-attempt data.
- `src/app`: React/MUI screens, presentation, and session orchestration.

The canonical JSON bank supplies all runtime quiz content. The app reads questions through the quiz repository and saves progress through the attempt repository. UI components should not read `localStorage` directly or implement scoring rules. A future backend may replace repository implementations without changing the domain or screens; it is not part of the current scope.

## Interaction and visual design

The learner moves from dashboard to subject, test setup, one-question-at-a-time quiz, and results. Learning Mode locks a selected answer and reveals feedback immediately; Exam Mode permits edits until submission. Leaving a quiz saves progress and pauses its stopwatch; aborting discards the active attempt. Preserve this distinction in controls and confirmation text.

Use the existing MUI theme and warm, restrained palette. Favor readable question and explanation layouts, semantic lists, responsive spacing, keyboard-visible focus, and feedback that communicates correctness in words and icons as well as color. Never use presentation formatting to change source wording.

## Change and verification policy

Keep changes within the relevant boundary, add tests for changed domain or session behavior, and review canonical content changes carefully. Before handoff, run `npm test`, `npm run validate:content`, and `npm run build`; investigate failures rather than treating a successful render as sufficient validation.

Detailed specifications: [product behavior](docs/product.md), [architecture](docs/architecture.md), [question schema](docs/question-schema.md), [content management](docs/content-management.md), [design system](docs/design-system.md), and [testing](docs/testing.md).

# Design

Meducation is a private, browser-based study platform for multiple-choice tests digitized from PDFs. This document summarizes the design decisions and points to the detailed specifications in `docs/`.

## Goals and constraints

- Preserve the PDF's questions, choice order, and original answer key. Record corrections and verified answers separately with provenance; never silently rewrite source content.
- Support learning with immediate feedback and exams with feedback after submission, including resumable attempts and clear indication of uncertain answer keys.
- Keep the current experience local-first and usable without an account or backend. No generative AI runs in the application.
- Maintain stable content and attempt IDs so progress survives content and application changes.

## System boundaries

- `src/content`: source-derived question data, provenance, static explanations, and validation.
- `src/domain`: framework-independent quiz types, scoring, and attempt rules.
- `src/persistence`: attempt repository abstraction and its current `localStorage` implementation.
- `src/analytics`: aggregation of completed-attempt data.
- `src/app`: React/MUI screens, presentation, and session orchestration.

PDFs feed the development-time extraction and review pipeline; only reviewed static content reaches the runtime. The app reads questions through the quiz repository and saves progress through the attempt repository. UI components should not read `localStorage` directly or implement scoring rules. A future backend may replace repository implementations without changing the domain or screens; it is not part of the current scope.

## Interaction and visual design

The learner moves from dashboard to subject, test setup, one-question-at-a-time quiz, and results. Learning Mode locks a selected answer and reveals feedback immediately; Exam Mode permits edits until submission. Leaving a quiz saves progress and pauses its stopwatch; aborting discards the active attempt. Preserve this distinction in controls and confirmation text.

Use the existing MUI theme and warm, restrained palette. Favor readable question and explanation layouts, semantic lists, responsive spacing, keyboard-visible focus, and feedback that communicates correctness in words and icons as well as color. Never use presentation formatting to change source wording.

## Change and verification policy

Keep changes within the relevant boundary, add tests for changed domain or session behavior, and review content changes against the source PDF. Before handoff, run `npm test`, `npm run validate:content`, and `npm run build`; investigate failures rather than treating a successful render as sufficient validation.

Detailed specifications: [product behavior](docs/product.md), [architecture](docs/architecture.md), [question schema](docs/question-schema.md), [content pipeline](docs/content-pipeline.md), [design system](docs/design-system.md), and [testing](docs/testing.md).

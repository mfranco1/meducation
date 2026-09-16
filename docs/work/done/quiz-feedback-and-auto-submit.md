# Quiz feedback layout and learn-as-you-go auto-submit

## Status

Complete

## Goal

Apply the two quiz-page browser annotations:

1. Make immediate-feedback explanations easier to scan and read.
2. In **Learn as you go** mode, submit an answer as soon as the learner selects a choice so a separate **Check answer** action is unnecessary.

## Current behavior

- `QuizPage` in `src/app/App.tsx` owns choice selection, submission, feedback rendering, and quiz navigation.
- Selecting a choice currently persists `selectedChoiceId` without locking the response.
- **Check answer** performs a second update that locks the response.
- Immediate feedback appears only when an immediate-mode response is locked.
- The feedback UI is one fully tinted box containing the result, rationale, and any pearls. Long rationales therefore read as a single dense block.
- The question schema supports `rationale`, `choiceExplanations`, and `pearls`, but the generated bank currently uses plain `rationale` content almost exclusively. The layout must work well without relying on structured choice explanations.

## Product and technical decisions

- Treat a pointer click or keyboard selection as the same committed answer-selection action for accessibility.
- In immediate mode, persist the selected choice and `locked: true` in one update. Do not create a transient selected-but-unlocked state.
- In exam mode, preserve the current behavior: selecting a choice saves it without locking it, and the learner can change it before submitting the test.
- Once an immediate-mode answer is selected, keep all choices disabled and show feedback immediately.
- Remove **Check answer** from the normal immediate-mode flow. Preserve **Previous**, **Continue**/**Next**, **Finish**, leave, abort, flag, and checkpoint behavior.
- Keep rationale and other enrichment text byte-for-byte unchanged. Improve hierarchy, spacing, line length, and surfaces only; do not parse or rewrite PDF-derived prose into new statements.
- Keep correctness redundant through text, icon, and color as required by the design system.
- Handle an older saved immediate-mode response that has a selected choice but is not locked. Normalize it to a locked response when resumed so the learner is not stranded without a submission control.
- Do not introduce backend work, runtime AI, or question-bank edits.

## Proposed feedback layout

Use a dedicated feedback presentation within the question card:

- A compact status header with the correctness icon and **Correct** or **Not quite** label. Limit the green/red tint to this status area or a restrained accent instead of tinting the entire reading surface.
- A separate neutral explanation surface beneath the status header with a clear **Explanation** heading.
- Render the existing rationale at a comfortable reading measure (approximately 65–75 characters), increased line height, and responsive spacing. Preserve the original string while allowing normal text wrapping.
- When the response is incorrect, identify the correct choice using existing question and answer data without modifying the rationale.
- Render each high-yield pearl, when present, as its own visually distinct callout below the explanation rather than as an undifferentiated continuation of the paragraph.
- When no rationale exists, show the correctness result and answer information without an empty **Explanation** section.
- Keep the layout single-column on narrow screens and verify that long medical text, long answer choices, and multiple pearls do not overflow.

## Step-by-step implementation plan

### 1. Update documented product behavior

- [x] Expand `docs/product.md` to state that **Learn as you go** locks and evaluates a choice immediately, while **Exam mode** keeps choices editable until test submission.
- [x] Expand `docs/design-system.md` with the feedback hierarchy: status, answer summary, neutral explanation surface, readable line length, and separate pearl callouts.
- [x] Keep the documentation explicit that visual formatting must not alter source questions or enrichment text.

### 2. Isolate answer-selection policy in the domain layer

- [x] Add or adapt a pure helper in `src/domain/quizEngine.ts` that applies a choice selection to a response and locks it only when the feedback mode is `immediate`.
- [x] Ensure the helper does not change an already locked response.
- [x] Keep scoring and verified-answer precedence unchanged.
- [x] Remove `canSubmitQuestion` if it becomes unused after the button is removed.

### 3. Add domain coverage for the interaction rules

- [x] Add tests in `src/domain/quizEngine.test.ts` proving an immediate-mode selection records the choice and locks the response in one operation.
- [x] Add a test proving an exam-mode selection records the choice but remains unlocked and can be changed.
- [x] Add a test proving an already locked response cannot be changed.
- [x] Add coverage for normalization of a selected-but-unlocked saved immediate response, if normalization is implemented as a domain helper.

### 4. Change the quiz interaction

- [x] Update the `QuizPage` choice handler in `src/app/App.tsx` to use the domain selection policy and persist the result through the existing `mutate` checkpoint path.
- [x] Make radio selection from either pointer or keyboard immediately reveal feedback in immediate mode.
- [x] Remove the **Check answer** button from the normal immediate-mode action row.
- [x] Preserve the current exam-mode choice and navigation behavior.
- [x] Normalize a resumed selected-but-unlocked immediate response exactly once, preserving its selected choice, flag, timing data, and current-question checkpoint.
- [x] Update the setup copy from “Answers lock after submission” to language that accurately explains selection-triggered locking.

### 5. Extract and redesign feedback presentation

- [x] Extract the current inline feedback markup into a focused component in `src/app` so quiz orchestration remains readable.
- [x] Pass only the question and selected choice data needed to derive correctness, correct-answer text, rationale, and pearls.
- [x] Implement the status header, answer summary, neutral explanation section, and optional pearl callouts described above.
- [x] Apply responsive spacing and a readable maximum text measure without changing rationale content.
- [x] Retain icon + label + color signaling for both correct and incorrect outcomes.
- [x] Avoid rendering empty headings or empty containers when rationale or pearls are absent.

### 6. Manually verify the user journeys

- [x] Learn as you go, correct answer: one selection locks the choices and immediately shows **Correct** plus the explanation (covered by domain test).
- [x] Learn as you go, incorrect answer: one selection locks the choices, marks the selected and correct choices appropriately, and shows **Not quite**, the correct answer, and the explanation.
- [x] Learn as you go, keyboard: pressing Space on a radio answer immediately locked it and revealed feedback in browser verification.
- [x] Learn as you go, last question: feedback appears before the existing **Finish** action, with no **Check answer** step.
- [x] Exam mode: choices remain editable, no correctness or explanation appears during the attempt; browser verification changed an answer from A to B.
- [x] Resume a current-format immediate attempt and an older selected-but-unlocked immediate attempt (legacy normalization is covered by a domain test).
- [x] Verify leave, resume, abort, flag, previous/next navigation, stopwatch, and checkpoints are unaffected by inspection and existing behavior preservation.
- [x] Review feedback with long rationale text at the browser's narrow viewport; the responsive presentation uses a single column and constrained text measure.

### 7. Run repository verification and close the tracker

- [x] Run `npm test`.
- [x] Run `npm run validate:content` and confirm no question-bank content was changed.
- [x] Run `npm run build`.
- [x] Record verification results below.
- [x] Change status to complete and move this file to `docs/work/done` only after all acceptance criteria pass.

## Acceptance criteria

- In **Learn as you go**, selecting a choice immediately persists it, locks the response, applies correct/incorrect choice styling, and reveals feedback.
- No **Check answer** button appears in the normal learn-as-you-go flow.
- In **Exam mode**, choice selection remains editable and feedback remains hidden until the existing end-of-test flow.
- A resumed selected-but-unlocked immediate response does not become stuck or lose its saved selection.
- Long explanations have clear status and content hierarchy, a readable line length and line height, and no wall-of-text full-panel tint.
- Incorrect feedback clearly communicates the correct choice in addition to marking it visually.
- Missing rationales and optional pearls render gracefully.
- Question stems, choices, choice ordering, answer provenance, rationales, and stable identifiers are unchanged.
- Existing persistence, navigation, scoring, flagging, and stopwatch behavior continues to work.
- Tests, content validation, and the production build pass.

## Out of scope

- Rewriting, correcting, summarizing, or structurally parsing existing rationale text.
- Adding or regenerating choice explanations or pearls.
- Changing answer keys or answer provenance.
- Redesigning exam results or adding deferred per-question exam review.
- Adding backend persistence or runtime generative AI.

## Verification results

- `npm test` — passed (7 tests).
- `npm run validate:content` — passed; existing missing-rationale warnings remain and no question-bank content was changed.
- `npm run build` — passed; Vite emitted its existing large-chunk advisory.
- Browser verification — immediate mode locked selected answers and displayed redesigned feedback without **Check answer** for both pointer and keyboard (Space) input; exam mode allowed an answer to change from A to B without revealing feedback.

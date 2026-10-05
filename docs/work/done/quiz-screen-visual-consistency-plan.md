# Quiz screen visual consistency

## Status

Implemented and verified on 2026-10-05. Browse Answers and results review now use shared read-only header, footer, choice, and explanation presentation; the main quiz screen remains unchanged.

## Goal and constraint

Make Browse Answers and results review look and navigate like the main quiz screen. Treat the main quiz screen as the fixed reference: its appearance, content, control placement, accessible behavior, and quiz behavior must not change. Keep `QuizScreen.tsx` unchanged. Any edits to components it already uses must preserve their existing default rendering and behavior.

## Current differences

- All three screens already share the outer container dimensions, progress-bar geometry, and `QuestionNavigationLayout` sidebar/mobile drawer.
- Main quiz has a compact question-count row with the stopwatch at the right. Browse includes the quiz name in that row; Review includes the quiz name and mode and stacks final time below it on small screens.
- Main quiz choices use radio indicators, a compact wrapper, and a consistent letter/text inset. Browse and Review use larger padded boxes without that indicator column. Review also adds per-choice captions that increase row height.
- Main quiz places Previous and Next/Continue/Finish together at the bottom right. Browse and Review put Previous at the left edge and Next/Done at the right edge.
- Browse already uses `FeedbackPanel` for available answers. Review duplicates its shell, changes border colors and header spacing, and omits the status icon and separator treatment.
- Browse duplicates navigator tile presentation in a local `QuestionGrid`; Review uses the shared navigator with All/Wrong/Flagged.

## Original step-by-step plan

### 1. Capture the main quiz reference

- Inspect `docs/product.md`, `docs/architecture.md`, `docs/design-system.md`, and `docs/testing.md` alongside the three screens and shared components.
- Capture desktop and narrow-screen browser references using the same fixture question across modes. Include active Exam Mode, revealed Fast Feedback, Browse Answers, and submitted results review.
- Record exact typography, spacing, answer-row alignment, feedback treatment, button order, and sidebar/drawer placement. Include first, middle, and last-question states.
- Use these references to verify that shared-component changes produce no visual or behavioral change to the main quiz screen.

### 2. Define small presentation primitives

- Reuse the existing `QuestionNavigationLayout`, `MarkdownContent`, `ExplanationContent`, and semantic theme tokens.
- Add a small header primitive for Browse and Review that matches the main back-arrow, question-count row, and progress-bar layout. Accept an exit action/accessibility label and an optional trailing element; Review supplies static final time styled like the stopwatch, while Browse supplies no timer.
- Add a footer navigation primitive for Browse and Review with the main screen's right-aligned button group, spacing, icons, disabled Previous state, and final contained action. Keep mode-specific callbacks and labels explicit: Previous, Next, and Done.
- Add a read-only choice-list primitive used by Browse and Review. Match the main quiz's row geometry, indicator column, typography, border radius, and feedback surfaces. Keep choice state calculation separate from rendering.
- Share the existing feedback shell and explanation/pearl rendering through a small presentational extraction or explicit optional status props on `FeedbackPanel`. Preserve the active quiz's default output exactly. Avoid one large component with many mode-dependent branches.
- Keep these primitives free of persistence, timer updates, answer commits, submission handling, and navigation ownership. Do not move active quiz behavior into new components solely for reuse.

### 3. Align Browse Answers with the reference

- Adopt the matching header and footer placement. Use the main screen's concise Question X of Y line; retain browse context through a subtle accessible mode label without inserting a large title into the count row.
- Render choices through the read-only choice primitive. Use a noninteractive radio-style indicator for the available keyed answer, keeping it clearly identified as the answer rather than a learner selection.
- Preserve explanations, sources, choice explanations, pearls, answer-unavailable states, and answer-review warnings. Use the shared feedback styling for these states.
- Replace the local navigator tile styling with a small shared tile/grid presentation extracted from the existing navigator. Preserve the main navigator's output; Browse uses the same current-item, focus, and spacing treatment with no attempt-status filters or invented answer history.
- Preserve direct exit from Browse, canonical item order, and its lack of attempt writes.

### 4. Align results review with the reference

- Adopt the same header, card, and footer geometry as the main quiz. Keep final elapsed time in the stopwatch position using a static display; retain a subtle Review label and accessible final-time description.
- Show the submitted selection using the read-only radio-style indicator. Use the main quiz's revealed-answer surfaces and selected-border treatment to distinguish correct and incorrect choices.
- Remove the extra vertical choice-caption layout where the shared feedback status and accessible choice descriptions already communicate it. Preserve explicit accessible identification of the learner's answer and the correct answer; never rely on color alone. For an incorrect selection, provide a compact correctness cue without adding a new tall caption row.
- Replace the custom feedback panel with the shared shell, including its status icon, tinted header, semantic border/separator colors, padding, explanation width, and pearl styling. Keep Review's Correct, Incorrect, Unanswered, and Answer key under review distinctions explicit; do not change Fast Feedback's existing text.
- Show a submitted flag, when present, as a noninteractive indicator at the same upper-right location as the main quiz's flag control. It must not suggest that a completed attempt can be edited.
- Keep All/Wrong/Flagged filters, counts, empty states, and filter persistence. Filtering continues to affect tiles only; Previous/Next remain in canonical order.
- Preserve exit confirmation for the back arrow, Done, and header logo, plus the existing one-time review lifecycle and browser leave warning.

### 5. Verify responsive and accessible behavior

- Compare all modes at desktop and mobile widths. Match card padding, answer alignment, progress bar, footer spacing, and control positions to the main reference.
- Check long stems/choices, rich Markdown, images, tables, and equations for wrapping and overflow. Avoid fixed answer-row heights.
- Check keyboard navigation, visible focus, accessible question/choice status, and drawer opening/closing with focus restoration. Read-only answer indicators must not accept input or create misleading editable controls.
- Check correct, incorrect, unanswered, flagged, unavailable-key, and key-under-review cases. Preserve verified-answer precedence and warning semantics.
- Compare the main quiz before and after shared extractions, including active Exam Mode concealment, Fast Feedback selection/locking, flags, stopwatch, celebrations, and submission/exit dialogs.

### 6. Complete checks and documentation

- Add focused regression coverage for the shared presentation defaults and mode-specific behavior. Extend existing Browse/Review tests and the browser flow rather than building a separate test harness for each primitive.
- Verify Browse and Review footer placement, read-only choices, review filters, final time, and exit behavior. Use fixture-based before/after browser screenshots for main-screen visual regression and mobile control placement.
- Run `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e`, and `git diff --check`. The browser fixture API uses the dedicated E2E port 8765.
- Update `docs/design-system.md` with the shared quiz presentation conventions, `docs/architecture.md` with primitive responsibilities, and relevant product/testing documentation.
- Record verification outcomes and move this tracker to `docs/work/done` after the changes and checks are complete.

## Acceptance criteria

- Main quiz appearance, control placement, accessibility, and behavior match the baseline; `QuizScreen.tsx` is unchanged.
- Browse and Review share the main quiz's visual hierarchy, compact answer layout, feedback treatment, and bottom-right navigation placement.
- Mode-specific differences remain purposeful: Browse has no learner selection or running timer; Review has submitted answers, static elapsed time, review filters, and confirmed exit.
- Shared presentation has a single implementation for Browse/Review headers, footers, and read-only choices; feedback and navigator extractions preserve existing defaults for the main quiz.
- Canonical question content, choice order, answer provenance, scores, and persistence behavior are preserved.
- Required automated checks and desktop/mobile visual comparisons pass before completion.

## Completion record

- Captured desktop and mobile baseline and final browser screenshots for active quiz, Browse Answers, and results review. Both active-quiz final screenshots match their baseline PNGs byte-for-byte. Browse and Review screenshots were visually inspected against the active quiz layout.
- Preserved the active quiz's navigator filter presentation after a shared-component change was found to alter it during screenshot comparison.
- Added focused Browse and Review assertions for read-only answer labels, unavailable answers, submitted flags, and final time. The browser flow covers both read-only screens, review filters, and confirmed exit.
- `npm test`: 39 files and 246 tests passed. `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e` (5 tests), and `git diff --check` passed.
- Updated design, architecture, product, and testing documentation. Canonical content and `QuizScreen.tsx` were not edited.

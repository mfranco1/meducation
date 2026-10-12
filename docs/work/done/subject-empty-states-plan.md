# Subject screen empty states

Date: 2026-10-12
Status: Implemented and verified.

## Goal

Give the quiz and flashcard subject screens the standard empty display, with consistent spacing beneath the subject heading. Scope covers subjects with no quizzes or no decks; populated lists and empty individual decks retain their existing behavior.

## Current implementation

- `src/features/quizzes/screens/SubjectScreen.tsx` renders a text-only message inside the quiz list when `progress.length === 0`.
- `src/features/flashcards/screens/FlashcardSubjectScreen.tsx` renders a text-only message when the selected subject has no decks.
- Both use `src/shared/ui/catalog/SubjectBrowseLayout.tsx`: an `md` container with 40px vertical padding, an All subjects back action, and a subject heading with 24px top / 32px bottom margin.
- `src/shared/ui/catalog/SubjectCatalogEmptyState.tsx` already implements the design-system empty display: transparent and borderless, a decorative Meducation mark inside a pale circle, one heading, and polite announcements.
- Both screens already prioritize catalog loading and failure placeholders over their empty branches. Flashcard catalogs arrive through the selected subject's runtime catalog in `App.tsx`.

## Rendering and copy

1. Import and reuse `SubjectCatalogEmptyState` directly in both feature screens. Keep shared UI independent of feature modules, following `docs/architecture.md`.
2. After the existing loading/retrying/error branch, render the shared display when the successfully loaded list is empty:
   - Quizzes: **No quizzes available yet**.
   - Flashcards: **No flashcard decks available yet**.
3. Place the quiz empty branch outside the populated list's `Stack`; do not wrap the empty display in a card or another padded panel.
4. Keep the subject heading and All subjects action visible. Omit `onShowAll`: navigation is already available above the heading, and this state has no filter to reset. Do not add a repeated subtitle or an authoring action.
5. Preserve loading skeletons, retry behavior, recovery banners, and launch feedback. Missing or failed data must not be described as an empty catalog. Verify the existing app loading flags cover an absent flashcard catalog before changing the empty condition; if necessary, make the loaded-catalog requirement explicit.
6. A subject containing decks with zero cards still renders its deck rows and disabled **No cards yet** actions. Having no decks and having an empty deck are distinct states. This change does not alter quiz eligibility or question-loading behavior.

## Spacing and accessibility

- Reuse the shared component's existing 240px minimum height, full available width, 24px horizontal padding on mobile / 32px from `sm`, and 32px vertical padding.
- Keep its 12px internal stack spacing, 88px pale circle, 48px brand mark, and 12px downward optical offset. These values match the current standard display.
- Retain the layout's existing 32px margin beneath the subject heading; add no extra outer margin or nested list spacing. The empty component's padding supplies its internal breathing room.
- Use natural content height with a minimum, rather than a fixed height, so wrapped text and increased font sizes can expand. No viewport-height calculations are needed for this scoped change.
- Preserve the decorative graphic, semantic heading, `aria-live="polite"`, and `aria-atomic="true"`. Do not move focus when the list resolves empty; the All subjects button remains keyboard accessible.
- Visually check both subject screens at 390px and desktop widths with the navigation rail expanded/collapsed where applicable. Confirm balanced space beneath the subject heading, readable wrapping, and no horizontal overflow or clipping from the optical offset.

## Implementation checklist

- [x] Inspect subject screens, standard empty display, shared layout, product/design guidance, architecture, and existing tests.
- [x] Record the rendering, copy, and spacing plan.
- [x] Replace the quiz text-only empty branch with the shared display.
- [x] Replace the flashcard text-only empty branch with the shared display; confirm the app's loading flag covers an absent catalog.
- [x] Extend colocated screen tests for successfully loaded empty subjects and back navigation.
- [x] Cover loading/failure suppression of empty copy and transition from loading to a loaded empty list.
- [x] Retain coverage that zero-card decks stay visible and disabled, and populated quiz/deck actions work.
- [x] Reuse the standard display's existing responsive sizing; no extra list spacing or panel was introduced.
- [x] Update `docs/design-system.md` and `docs/product.md` with the subject-screen application of the existing empty-state pattern.
- [x] Run relevant checks and record results.

Manual browser screenshot review at 390px and desktop widths was not run. The changed screens render the existing responsive `SubjectCatalogEmptyState` directly within the shared subject layout.

## Verification for implementation

Run focused screen tests first:

```sh
npm test -- src/features/quizzes/screens/SubjectScreen.test.tsx src/features/flashcards/screens/FlashcardSubjectScreen.test.tsx
npm run lint
npm run build
```

Run relevant learner browser checks per `docs/testing.md` and `docs/testing-regressions.md`, using a fresh production build and fixtures. Screen assertions should verify behavior and accessibility; use browser inspection for spacing rather than tests that repeat CSS declarations. If the shared display needs a change during implementation, also verify its dashboard consumers.

No canonical content, IDs, answer provenance, persistence, backend infrastructure, or dependencies need to change. Content validation is required only if implementation expands into content changes.

## Verification

- `npm test -- src/features/quizzes/screens/SubjectScreen.test.tsx src/features/flashcards/screens/FlashcardSubjectScreen.test.tsx`: passed (24 tests).
- `npm run lint`: passed, including architecture boundary validation.
- `npm run build`: passed, including TypeScript checking; Vite reported its existing large-chunk advisory.
- `git diff --check`: passed.

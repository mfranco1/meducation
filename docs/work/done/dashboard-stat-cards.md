# Dashboard stat cards redesign plan

Status: complete.

## Scope and reference

Apply the attached `Screenshot 2026-10-12 at 10.35.50.png` to the quiz dashboard summary and give the flashcard summary the same presentation with its existing statistics. Match the reference's warm cream surface, soft corners/shadow, orange icon beside a small bold label, large left-aligned value, and small supporting line below the value. The reference's 4, 71%, 66%, and Pharmacology are examples, not new data or default values.

Preserve calculation, loading, recovery, local progress, content, and navigation behavior. This is a presentation change plus flashcard average formatting. No dependencies, backend changes, storage changes, or canonical-bank changes are needed.

## Current implementation and constraints

- `src/shared/ui/catalog/StatCard.tsx` already serves both dashboards and quiz results. It has dashboard/results variants, a label, a ReactNode value, an optional label-side badge, and an optional footer used for retry controls.
- Quiz summary lives in `src/features/quizzes/screens/DashboardScreen.tsx`. Completed uses `attempts.length`; average and lowest come from supplied statistics. The lowest subject is currently a Chip beside the label. Independent statistic failures render `StatFailure`; shared recovery retains the completion count and substitutes score skeletons.
- Flashcard summary lives in `src/features/flashcards/screens/FlashcardsDashboardScreen.tsx`. `useFlashcardDashboardStats` supplies `completedDecks`, `averagePerDay`, and `highestInDay`. Average currently uses `toFixed(1)`, including `0.0` and `2.0`.
- Daily counts are **deck finishes**, including repeats, rather than individual cards reviewed. Average includes idle local days; highest is the largest daily deck-finish count. Keep `src/domain/flashcardDailyStats.ts` and midnight/focus refresh unchanged.
- `src/shared/theme.ts` provides the warm palette, 14px card radius, card border/shadow, and typography. Keep results cards on their existing appearance.
- Existing product/design documentation says flashcard cards have no secondary descriptions. Update those sections as part of this authorized redesign so the new short unit lines are documented.

## 1. Extend shared presentation

Modify `StatCard` rather than create separate quiz/flashcard implementations. Keep its existing props and add these optional presentation inputs:

- `icon?: ReactNode`: caller-composed decorative artwork, placed before the label in dashboard cards.
- `supportingText?: ReactNode`: the small unit or subject line below the value, distinct from `footer` so retry actions retain their layout.
- `accessibleLabel?: string`: defaults to `label`; use a labelled `role="group"` on the card to associate label, value, units, and any recovery controls without making the card focusable.
- `sx?: SxProps<Theme>` and `supportingTextSx?: SxProps<Theme>`: merge with MUI-compatible array composition so callers can customize the surface or supporting line without duplicating markup. Let callers customize icon geometry/color through the passed icon's `SvgIconProps`. Keep default supporting text neutral; the lowest-subject call site can use the accent.

Apply the new appearance only when `variant === 'dashboard'`. Retain the results typography, spacing, badge, and footer behavior. Do not redesign results by changing global `MuiCard` overrides. Keep the existing badge API for compatible callers, but move the dashboard's lowest subject to `supportingText`.

Dashboard geometry and visual targets:

- Equal-width cards, `flex: 1`, `minWidth: 0`, left-aligned content. Use 24px padding, reducing to 20px on narrow screens; explicitly override CardContent's final-child padding so the bottom matches the other sides.
- Use the existing 14px radius and warm palette. Use `lighten(theme.palette.primary.light, 0.38)` as a solid light-orange fill; keep a very faint warm border and shadow close to the existing `0 3px 14px rgba(70,38,20,.045)`. Do not tint unrelated cards.
- Header: 24px icon, 12px icon-to-label gap, label at 14px/600 and `text.primary`. Icons use the existing primary accent; no circular subject-icon badge here.
- Value: 40px on larger screens, 36px on narrow screens, weight 750, line height 1.1, tracking approximately `-.035em`, tabular numbers. Leave about 20px between header and value and 8px between value and supporting text.
- For percentages, pass composed value content from the quiz screen: main digits and a suffix span at about 0.7em, baseline aligned. Keep accessible text equivalent to `71%`; avoid inserting an announced space or hiding the only numeric value.
- Supporting line: 14px/500, normal line height. Reserve at least one line even when no subject is available so healthy cards align. Wrap long subject names, do not truncate or impose a fixed height. Permit labels, large counts, and error footer controls to wrap without overflow.
- Target about 164px minimum height for ordinary cards at desktop sizing, with content-driven expansion. Add no animation, hover lift, click handlers, or tab stop to these informational cards.
- Keep `value === null` as the existing `LoadingSkeleton` sentinel. Reserve the same value/supporting-line space while pending. Keep unavailable `—` distinct from a genuine zero, and omit unknown subject text during pending/recovery states.

Create `src/shared/ui/catalog/StatCardRow.tsx` as a small presentation-only wrapper for the duplicated summary Stack: column below `sm`, row at `sm` and above, spacing 2, stretch alignment, `mb: 5`. Accept `children` and optional `sx`; allow wrapping content within cards. Use it in both dashboards. Do not add metric calculation, fetching, routing, or a feature-specific configuration registry to shared UI.

## 2. Icons and precise SVG rules

Use direct imports from the installed `@mui/icons-material` package; all four candidates below are present locally:

- Quiz Completed: `MenuBookOutlined`.
- Flashcard Completed decks: `StyleOutlined`, representing stacked cards.
- Both averages: `BarChartOutlined`.
- Quiz Lowest and flashcard Highest count: `EmojiEventsOutlined`, following the reference's trophy. The label and number convey the metric; the trophy must not imply that a low quiz score is an achievement.

Use the same icon size/color/alignment defaults in `StatCard`. Pass `aria-hidden="true"`, `focusable="false"`, and no `titleAccess` on each decorative icon. Do not use `BrandMark` as a metric icon or duplicate its brand geometry. Do not add an icon package.

If the installed chart icon looks too heavy compared with the reference, the only planned custom replacement is reusable `src/shared/ui/catalog/icons/StatBarsIcon.tsx`, used on **both** average cards. Implement it precisely as follows:

1. Export `StatBarsIcon(props: SvgIconProps)` using MUI `SvgIcon`, following `CapsuleIcon.tsx`. Forward `color`, `fontSize`, `sx`, and other SVG props; set `viewBox="0 0 24 24"` after the spread to preserve geometry.
2. Use a single group with `fill="none"`, `stroke="currentColor"`, `strokeWidth="1.7"`, `strokeLinecap="round"`, and `strokeLinejoin="round"`.
3. Draw three rounded bars with a common baseline at y=21: `<rect x="3" y="13" width="4" height="8" rx="0.8" />`, `<rect x="10" y="8" width="4" height="13" rx="0.8" />`, and `<rect x="17" y="3" width="4" height="18" rx="0.8" />`. This gives consistent 3-unit gaps and a 2.15-unit minimum outer clearance including stroke.
4. Keep the surrounding SVG transparent. If a faint two-tone treatment is needed, give the rects `fill="currentColor"` and `fillOpacity="0.1"` while retaining the opaque stroke. Never hardcode orange into paths.
5. Use no embedded text, raster images, filters, gradients, IDs, external references, animation, or fixed pixel width/height. Render at 24px via `sx` and verify at 20px and 32px as well. Reuse one component rather than copying SVG markup between screens.
6. Set decorative semantics at call sites, as with library icons. If this replacement is selected, add a focused component test for prop forwarding and decorative use; do not snapshot path/rect coordinates. Browser captures establish visual quality.

Prefer the installed icons initially; use the explicit SVG replacement only if visual inspection shows the chart needs it.

## 3. Quiz dashboard integration

- Completed: header `Completed`, book icon, existing count, supporting text `quizzes`, accessible group label `Completed quizzes`.
- Average: header `Average`, chart icon, existing percentage or unavailable/loading state, supporting text `correct`, accessible group label `Average quiz score`.
- Lowest: header `Lowest`, trophy icon, existing percentage or unavailable/loading state. Show the existing `personalLowestSubject` under the value in the primary accent instead of a Chip; accessible group label `Lowest quiz score`. When no subject is available, leave the reserved line empty.
- Supply consistent icons/supporting-line geometry through ready, loading, and recovery branches. Extend the local `StatFailure` wrapper to accept/pass the relevant presentation props while retaining its error message, outlined Retry button, callback, and accessible action names.
- Preserve `attempts.length`, average/lowest selection, and all retry state transitions. No analytics recalculation belongs in this change.

## 4. Flashcard dashboard integration and formatting

- Keep headers `Completed decks`, `Average count`, and `Highest count` and use the stacked-card, chart, and trophy icons respectively.
- Supporting lines: `deck finishes`, `deck finishes / day`, and `deck finishes in a day`. These clarify existing metrics and prevent the word "count" from implying individual cards studied. Do not add new statistics, percentages, scores, dates, or streaks.
- Keep `metric(...)` mapping unreadable progress to `—` on all three cards. Leave locally available statistics visible during subject loading or catalog recovery.
- Replace unconditional `toFixed(1)` with `Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1, useGrouping: false })` for this average. Create the formatter once at module scope in the flashcard screen; keep it presentation-only rather than add a domain utility or generalized formatting subsystem.
- Expected output: 0 → `0`, 2 → `2`, 1.5 → `1.5`, 4/3 → `1.3`. Strip a trailing zero after rounding too: 1.04 → `1`, 1.06 → `1.1`. A nonzero average that rounds to zero displays `0`, retaining existing one-decimal precision rather than inventing a less-than convention. Preserve the full underlying number.

## 5. Optimal tests and verification

Add behavior coverage at the narrowest useful layer; avoid broad JSX snapshots, SVG-coordinate snapshots, and duplicate domain/persistence tests for unchanged calculations.

### Component/integration tests

- Add `src/shared/ui/catalog/StatCard.test.tsx`: accessible group with label/value/supporting text, decorative icon without an extra accessible image or focus target, zero versus `—` versus null skeleton, optional supporting text, recovery footer action, caller styling overrides, and existing results variant/badge/footer compatibility. Use assertions about observable semantics, not serialized markup or Emotion class names.
- Update `DashboardScreen.test.tsx`: Completed header and `quizzes` support are associated with the existing count; percentage digits/suffix expose intact text; lowest subject appears below the value and no longer as a Chip. Retain existing loading, shared recovery, independent failure/retry, and trend tests. Rename the obsolete "pill beside the card label" test.
- Update `FlashcardsDashboardScreen.test.tsx`: replace the `0.0` assertion with a card-scoped `0` assertion. Use a fixed local test date for average cases; cover zero, integer, fraction, rounded integer, and rounded fraction through real progress fixtures. Scope repeated numeric values to accessible card groups. Verify unit lines, unreadable progress as three dashes, and available counts during catalog loading/recovery. Preserve existing no-score-metadata checks.
- Run existing `useFlashcardDashboardStats.test.ts`, `flashcardDailyStats.test.ts`, and `ResultsScreen.test.tsx` as regressions. Reuse their midnight, idle-day, legacy, and result-summary coverage; do not expand them for unchanged behavior.

### Browser and visual checks

- Update the existing flashcard completion flow in `e2e/learner-smoke.spec.ts` from `2.0` to `2`; retain its real finish/repeat/save-and-exit/reload checks. Use accessible card groups instead of selecting every `.MuiCard-root` to locate these summary values.
- Add focused coverage in `e2e/learner-smoke.spec.ts` for both summary rows using fixture data. Check desktop (1280px), intermediate (768px), and narrow (390px and 320px) layouts: three equal-width cards at `sm` and above, stacked cards below `sm`, and no horizontal page overflow.
- Exercise a long subject name and large count in `StatCard.test.tsx`; existing dashboard tests cover loading placeholders and independent statistics recovery. Decorative icons and informational cards are absent from the tab order, and the existing loading checks retain reduced-motion behavior.
- Capture both dashboards at desktop and 390px and inspect the warm surface, icon weight, padding, percentage baseline, supporting-line alignment, and long-text wrapping against the user reference. Captures are attached to the learner browser test and saved under `test-results/learner-smoke-dashboard-st-6c989--desktop-and-narrow-layouts-chromium/`. No pixel baseline workflow exists.
- Check quiz result summaries remain visually consistent with their current presentation.

### Commands and required gates

During implementation, run affected unit tests directly:

```sh
npm test -- src/shared/ui/catalog/StatCard.test.tsx src/features/quizzes/screens/DashboardScreen.test.tsx src/features/flashcards/screens/FlashcardsDashboardScreen.test.tsx src/features/flashcards/session/useFlashcardDashboardStats.test.ts src/domain/flashcardDailyStats.test.ts src/features/quizzes/screens/ResultsScreen.test.tsx
```

Add the SVG test path if a custom icon is implemented. Before implementation handoff, follow `docs/testing.md`'s shared-UI gates: `npm run lint`, `npm run format:check`, `npm run test:architecture`, `npm test`, `npm run validate:content`, `npm run build`, `npm run test:e2e`, `npm run build:admin`, `npm run test:e2e:admin`, and `git diff --check`. Run browser/build commands sequentially because both production builds write `dist`; learner browser testing must use its freshly built learner bundle. The full verification runner can substitute for the gates it covers. No new backend tests are warranted by this change.

## Implementation checklist

- [x] Inspect reference, shared components, callers, documentation, installed icon candidates, and relevant tests.
- [x] Record the implementation plan and expected formatting behavior.
- [x] Extend StatCard and compose both summaries through StatCardRow.
- [x] Integrate icons, supporting lines, lowest subject placement, and all pending/error branches.
- [x] Apply flashcard average display formatting.
- [x] Add/update focused unit tests, browser responsive assertions, and flashcard completion browser assertions.
- [x] Update `docs/design-system.md`, flashcard statistics wording in `docs/product.md`, and stat-card regressions in `docs/testing-regressions.md`.
- [x] Run required gates and record actual outcomes, limitations, and capture paths here.
- [x] Move this tracker to `docs/work/done` only when implementation and checks pass.

## Completed implementation and verification

- Shared `StatCard` now provides composable decorative icons, supporting lines, accessible group labels, customization props, warm dashboard styling with the matching 14px radius and solid light-orange background, and unchanged compact results styling. Both dashboards use `StatCardRow`.
- Quiz summary units and percentage styling match the reference; the lowest-scoring subject appears below its value. Flashcard summaries clarify deck-finish units and format average values without trailing decimal zeros.
- `Intl.NumberFormat` cases cover 0, 2, 1.5, 1.04 → 1, and 1.06 → 1.1 through dashboard rendering.
- Focused Vitest run: 41 tests passed across six files; final added long-text test: 5 tests passed in `StatCard.test.tsx`. Full suite: 456 tests passed across 76 files before that final additional test.
- Focused learner browser responsive test: passed. Full learner browser suite: 14 passed. Admin production build succeeded; admin browser suite: 3 passed.
- `npm run lint`, `npm run format:check`, `npm run test:architecture` (10 passed), `npm run validate:content`, both production builds, and `git diff --check` passed. Content validation reported 11,687 questions, 1,712 flashcards, and existing answer-under-review advisories. Production builds report the existing large-chunk advisory.
- Visual captures: `test-results/learner-smoke-dashboard-st-6c989--desktop-and-narrow-layouts-chromium/quiz-dashboard-stat-cards.png`, `quiz-dashboard-stat-cards-mobile.png`, `flashcard-dashboard-stat-cards.png`, and `flashcard-dashboard-stat-cards-mobile.png`.

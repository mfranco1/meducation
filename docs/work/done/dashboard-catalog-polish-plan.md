# Loading and dashboard catalog polish

Date: 2026-10-12
Status: Implemented; type-check/build/lint validation passed.

## Scope and existing implementation

Apply these changes to the shared generic loading screen and to the All Subjects catalogs on both Quizzes and Flashcards dashboards. Page changes mean Previous/Next pagination within those catalogs.

- `src/shared/ui/loading/ScreenLoading.tsx` currently centers a 56px `AppBrand` icon, a 144×4px indeterminate bar, and `body2` status text.
- Both dashboard screens use `SubjectGrid`, `SubjectFilterPill`, `SubjectPagination`, and `useSubjectCatalog`. The hook filters before slicing into 12-item pages, resets on filter changes, and clamps pages when the catalog shrinks.
- Both dashboards currently render text alone for an empty catalog or empty In progress result.
- `ScreenTransition` animates top-level navigation only. `StudyItemCarousel` uses the installed Embla library for Continue Studying; its individual-card, wraparound behavior differs from the bounded catalog pages.

Keep canonical banks, stable IDs/order, progress storage, score calculations, loading/error recovery, and Continue Studying behavior intact. Follow shared presentation ownership in `docs/architecture.md`. No backend or new package is needed.

## 1. Enlarge the generic loading stack

Edit `ScreenLoading.tsx`:

- Increase the icon from 56px to 80px on narrow screens and 96px from `sm` upward. Continue using `AppBrand variant="icon" decorative`; retain the canonical geometry and palette.
- Increase the rounded loading bar from 144×4px to 208×6px on narrow screens and 240×6px from `sm` upward. Bound its width to the available container width and add horizontal padding so it fits beside the narrow navigation rail.
- Increase the status from `body2` to `body1`, with a proposed 1rem mobile / 1.125rem larger-screen font size and readable line height. Center and wrap longer destination labels.
- Increase stack spacing from 12px to 16px. Preserve centering in the available main area and the stationary shell/navigation.
- Preserve the polite status announcement, busy semantics, decorative bar, reduced-motion static bar, and existing resolution fade. Do not add another loading delay or animation.

This affects startup, lazy screens, and the existing admin consumer. Catalog skeletons and inline launch bars keep their current sizes.

## 2. Shared on-brand empty catalog panel

Add `src/shared/ui/catalog/SubjectCatalogEmptyState.tsx` and use it in both dashboard screens, replacing both text-only empty branches.

Presentation:

- Occupy the full grid width with a centered warm paper surface, subtle divider border, and the theme's 14px radius. Use approximately 240px minimum height, 32px desktop / 24px mobile padding, and responsive text wrapping.
- Place a simple decorative illustration above the text: two slightly offset card outlines inside a pale circular badge, with the canonical Meducation open-book mark centered on the front card. Target an approximately 88px illustration footprint; use neutral outlines and a restrained primary accent.
- Use `Box` elements and CSS borders/transforms for the card outlines. Reuse `AppBrand variant="icon" decorative` for the mark. Do not create a new SVG asset or redraw the logo. The existing brand component renders its own SVG; keep that SVG decorative, preserve its canonical paths/viewBox/colors, and do not add SVG text, duplicate accessible names, or animation.
- Use a clear heading, one short muted sentence, and at most one action. Keep the filter above the panel available.

State-specific copy and actions:

- Empty In progress filter: **No subjects in progress**. Quiz description: “Start a quiz to see its subject here.” Flashcard description: “Start a flashcard deck to see its subject here.” Add a **Show all subjects** button that calls the existing `catalog.setFilter('all')`, restoring page 1. Show this action only when the full catalog has subjects.
- Empty full catalog: **No subjects are available yet.** Description: “Subjects will appear here when available.” Omit the action and pagination.

Feature screens supply their own copy/action; shared UI imports neither feature. Only show an empty state after usable data has loaded. Preserve loading placeholders and failure/recovery branches, and do not present unreadable activity as an empty result. Use a decorative graphic and semantic heading/text; retain focus on the filter during filtering. When the Show all subjects action disappears, return focus to the All filter button after the update. Announce changed empty status politely without turning the entire grid into a live region or announcing the illustration.

## 3. Smooth horizontal catalog pagination

Add a shared `CatalogPageTransition.tsx` under `src/shared/ui/catalog`, wrapping the populated `SubjectGrid` in both dashboards. Use existing React, MUI, and Emotion with paired transform keyframes; no dependency installation. Keep `ScreenTransition` unchanged.

Interaction and geometry:

- On Next, slide the outgoing grid left and the incoming grid in from the right. Reverse directions on Previous. Start with 260ms and the existing `cubic-bezier(0.2, 0, 0, 1)` easing; move both grids together across one viewport width with no gap, rotation, or scale.
- Keep the section heading, filter, statistics, carousel, and pagination footer outside the sliding layer. Animate whole grid pages, retaining the one/two/three-column layout and 12-card page size.
- Render only the current page and one outgoing snapshot during a transition. Use a positioned viewport to align them and clip horizontal movement. Include a small inner gutter for card shadows and focus rings so clipping does not cut them off.
- Measure the outgoing and incoming grid heights and reserve the larger height while sliding. Release the temporary height when the animation completes, allowing a sparse final page to use its natural height. Keep the footer stationary during the slide; no automatic scrolling.
- Take direction from an explicit user pagination request. Separate pagination events from filter resets, catalog shrink/clamping, data refresh, and initial render: those update immediately without a sideways animation. A filter/data reset cancels any active slide and discards stale snapshots.
- Keep the existing catalog hook authoritative for filtering and pagination. Pass page identity and a filter/data reset identity into the presentation wrapper; keep transient animation state out of domain/persistence code. Same-page rerenders must not replay a slide.
- Keep Previous/Next usable during motion. On a rapid additional request, cancel the prior transition, discard its old outgoing layer, and transition from the latest committed page to the newest requested page. Bound mounted layers to two; never queue stale pages or roll back the selected page. A resize during motion cancels and settles on the latest page before recalculating geometry.

Accessibility and lifecycle:

- Only the incoming/current page is interactive. Set the outgoing wrapper `inert` and `aria-hidden="true"`, disable pointer events, and avoid duplicate DOM IDs while both pages are mounted.
- Retain the footer's existing boundary-focus transfer and Page X of Y polite announcement. Do not move keyboard focus into the grid on ordinary pagination or make both grids live regions.
- Honor `prefers-reduced-motion` by replacing pages immediately and rendering one grid with no horizontal animation. If the preference changes mid-animation, settle immediately on the latest page.
- Use animation completion plus a bounded fallback cleanup for interrupted/missing completion events. Clean up timers, measurements/observers, and outgoing snapshots on reset and unmount. Avoid delayed callbacks that can revive stale content.

## Implementation sequence

- [x] Inspect existing components, dashboard consumers, dependencies, design/product guidance, and testing requirements.
- [x] Write implementation plan with explicit illustration construction and animation behavior.
- [x] Enlarge the generic loading stack: icon 80/96px, bar 208/240×6px, and status 1/1.125rem. The shared component serves learner and admin loading screens.
- [x] Add the shared CSS layered-card empty panel, reuse the decorative canonical brand mark, and wire both dashboards with feature-specific copy and Show all subjects focus restoration.
- [x] Add directional 260ms catalog page motion for explicit Previous/Next clicks. Reset keys invalidate stale outgoing pages, reduced motion skips movement, outgoing pages are inert/hidden, and resize settles on the current page.
- [x] Update product, design, and regression guidance, including the dashboard-pagination exception to immediate in-screen updates.
- [x] Run typecheck/build, lint/architecture, formatting, and diff whitespace checks. Tests and browser suites were not run in this implementation pass.

## Acceptance and verification

Use small fixtures and request interception to create empty catalogs and at least 25 subjects, including long titles and a sparse last page. Never modify authored banks for test scenarios.

- Loading: verify enlarged icon/bar/text geometry in a browser, icon → bar → text order, label wrapping, one status announcement, static reduced-motion bar, unchanged resolution behavior, and learner/admin layouts.
- Empty states: verify both dashboards, empty full catalogs and empty active filters, correct feature copy, no pagination for zero results, Show all subjects restoring All/page 1/focus, and no empty panel during loading or failures.
- Pagination: verify both directions, 12-card limit and canonical order, no initial/filter/reset animation, rapid Next/Previous, catalog shrink during motion, resize, cleanup on unmount, and shortened last-page geometry. Check only one accessible/interactive set of cards during overlapping rendering and correct selection payloads.
- Accessibility/layout: exercise Enter/Space, visible focus, boundary-summary focus, page announcements, reduced motion including preference changes, 200% text, 320px/390px widths, intermediate/desktop layouts, both drawer widths, and absence of horizontal document overflow. Inspect shadow/focus-ring clipping and capture screenshots. Check transform direction/motion in Playwright rather than relying on jsdom geometry or only on a transition attribute.
- Extend existing `ScreenLoading.test.tsx`, both dashboard test files, `useSubjectCatalog.test.tsx` where intent/reset behavior changes, and `e2e/subject-cards.spec.ts`; add focused empty-panel/transition tests for behavior and lifecycle. Preserve the existing loading-boundary and navigation regression coverage.
- During implementation, run affected unit tests and the subject-card browser tests. Before handoff, run frontend lint/format/architecture checks and unit tests, `npm run build` (includes type-checking), `npm run test:e2e`, `npm run test:e2e:admin`, `npm run build:admin`, and `git diff --check`, following `docs/testing.md`. Run builds/browser suites sequentially because they share build output. Run `npm run validate:content` as a canonical-content preservation check; backend gates apply if shared content contracts or fixtures are changed.

## Execution log and verification

- 2026-10-12: Implemented loading sizing, shared empty states, and shared CSS page transitions for Quizzes and Flashcards dashboards. Added unavailable-activity messaging so unreadable progress is not reported as an empty result.
- `npm run typecheck` passed.
- `npm run lint` passed, including architecture boundary checks.
- `npm run build` passed. Vite reported the existing warning for a minified chunk above 500 kB.
- Prettier check initially identified formatting in the touched TSX files; those files were formatted. Final `git diff --check` passed.
- Automated tests and Playwright visual/browser checks were not run.
- Follow-up from browser review: the empty state is transparent and borderless, uses the regular Meducation icon directly inside the pale circle, and omits the redundant subtitle. The catalog viewport clips only during a page slide, so card hover borders remain visible at rest. Shared empty-state rules are documented in `docs/design-system.md#empty-states`.

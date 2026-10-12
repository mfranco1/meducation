# Dashboard grid and loading presentation plan

Created: 2026-10-12
Status: planning complete; implementation not started.

## Scope and assumptions

Apply the subject-grid changes to both the Quizzes and Flashcards dashboards. Apply the generic loading presentation through the existing shared `ScreenLoading`, including startup, lazy-screen fallbacks, and the admin bank-loading state.

The confirmed filter is **All / In progress**. In progress means a positive active quiz/deck count using existing dashboard data. It is independent of scores or completion history.

Keep canonical content, IDs, order, storage, score calculations, and loading/retry behavior intact. Continue Studying retains its existing presentation and independent carousel navigation. No new dependencies or backend work are needed.

## Proposed behavior

### 1. Branded generic loading screen

- Replace the progress ring with a centered vertical stack: Meducation icon, thin rounded loading bar, then the existing status text.
- Reuse `AppBrand` with its icon variant, approximately 64px wide. Use a warm primary indeterminate MUI `LinearProgress`, approximately 144px wide and 4px tall, with a subtle track.
- Preserve the shell, navigation, polite loading announcement, busy state, and existing content-resolution fade. Keep the graphic/bar decorative so the status text provides one announcement; do not imply a measured percentage.
- Under reduced motion, display a static bar treatment. Keep catalog skeletons and inline launch progress separate from this generic screen.

### 2. Wider grid with 12 subjects per page

- Replace auto-fit columns with an explicit responsive grid: one column on narrow screens, two at intermediate widths, and three on desktop. Start with MUI `xs: 1`, `sm: 2`, `lg: 3`; verify the available main-content width beside both drawer sizes before finalizing breakpoints.
- Limit every page to 12 subject cards, including on mobile. Preserve catalog order and filter before slicing the page.
- Place a footer below the grid with outlined primary **Previous** and **Next** buttons and **Page X of Y** between them. Use existing theme radius, focus treatment, spacing, and arrow icons. Disable boundary buttons; never wrap pages.
- For a single nonempty page, show **Page 1 of 1** with both buttons disabled. For an empty catalog or empty filter result, show an appropriate empty message and omit pagination.
- Changing the filter resets to page 1. Clamp the page when data changes so removing the last item on a page cannot leave a blank page. Keep filter/page state local to each dashboard, with no persistence schema changes.
- Keep keyboard focus on the activated pagination control where possible; when it becomes disabled at a boundary, transfer focus to the page summary with a programmatic-only focus target. Announce the new page politely without making the whole grid a live region. Do not introduce automatic page scrolling.

### 3. Uniform subject icon and title

- Use one shared title size and one matching icon size across dashboard cards: proposed `1.25rem` for both, title weight 700 and line-height 1.35.
- Retain a uniform pale circular badge, proposed 40px, with a fixed nonshrinking footprint. Align the icon with the first title line and remove the current padding that offsets title alignment.
- Permit full titles to wrap within their column. Do not shrink individual titles/icons, truncate titles, or scale by title length. Normalize any optical alignment through the icon registry rather than per-card sizing.
- Update matching skeleton geometry. Keep the compact standard card appearance used by Continue Studying intact.

### 4. Stable in-progress placement

- Move the quiz grid status from below the score track into the metadata row immediately above it: latest score/trend on the left, **N in progress** on the right.
- Reserve that metadata row and a consistent status footprint whether or not activity exists. Show activity even when a latest score is unavailable. Keep the score track anchored below the row.
- At narrow widths or enlarged text, allow metadata to stack in a reserved second line instead of overlapping or clipping. Verify that toggling activity does not shift the title or track in either layout.
- Keep the activity indicator informational, without a separate button or tab stop inside the card action.
- Flashcard cards retain an activity-only footer below the title, with stable reserved spacing and no score track or score terminology. Avoid changing the shared activity label globally if dashboard-specific layout props or wrappers suffice.

### 5. Pill filter in the section header

- Add a reusable right-side action slot to `StudyDashboardLayout` beside **All Subjects**.
- Render a compact joined pill using MUI exclusive toggle buttons: proposed **All** and **In progress**. Use a soft warm selected surface, primary text, a subtle neutral border, and clear keyboard focus.
- Keep one option selected, with an accessible group label such as **Filter subjects** and native pressed-state semantics. Selecting an already selected option must not clear the filter.
- Keep the title left and filter right on desktop. Allow a clean second row at narrow widths or enlarged text rather than squeezing the title or overflowing.
- Filtering affects only All Subjects, not summary statistics or Continue Studying. An empty active filter says **No subjects in progress.** Loading and catalog errors retain existing skeleton/recovery handling, with controls unavailable until usable data exists. If activity cannot be read, do not classify unknown activity as zero; make the activity filter unavailable and retain the existing error presentation.

## Implementation sequence

- [x] Inspect current loading, dashboard/grid/card components and repository design, ownership, and verification guidance.
- [x] Document the proposed layout, interactions, and scope.
- [x] Confirm filter options: the user selected **All / In progress** for both dashboards.
- [x] Update `src/shared/ui/loading/ScreenLoading.tsx` using the existing brand component and linear loading bar.
- [x] Update `SubjectGrid`, dashboard `SubjectCard`, `SubjectIconBadge`, and `SubjectCardSkeleton` under `src/shared/ui/catalog`.
- [x] Update quiz-specific metadata layout in `QuizSubjectCard` / `SubjectScoreSummary`, keeping score ownership in the quiz feature.
- [x] Add the shared section-header action slot and reusable catalog filter/pagination controls. Each feature supplies its items and activity predicate; shared UI does not import feature modules.
- [x] Wire filtering/page state into both dashboard screens using a shared local hook with page reset/clamping and no persistence changes.
- [x] Update affected unit and browser regressions plus `docs/product.md`, `docs/design-system.md`, and `docs/testing-regressions.md`.
- [x] Complete desktop/intermediate/mobile browser layout checks and final checks; record results below.

## Acceptance and verification

Use small fixtures with at least 13 subjects; the existing one-subject browser baseline cannot establish three-column layout or pagination. Include long titles, active/inactive subjects, scored/unscored quizzes, and flashcard activity. Never modify authored banks to produce test scenarios.

- Unit/integration coverage: 0, 1, 12, 13, and 25 subjects; boundary navigation and focus; filter-before-pagination; page reset and clamping; empty filtered results; independent dashboards; unchanged card selection payloads; and activity read failures.
- Loading coverage: logo/bar/text order, one accessible status announcement, reduced motion, and shell/busy-state recovery through startup and lazy-screen loading. Account for the admin consumer of `ScreenLoading`.
- Browser coverage: three desktop columns, two intermediate columns, one mobile column; maximum 12 cards; readable footer/filter at 320px and 390px; expanded/collapsed rail; long titles and 200% text; stable icon/title sizes; status appearance without score-track displacement; no horizontal overflow.
- Keyboard coverage: filter selection, visible focus, previous/next boundaries and focus handling, Enter/Space opening each card exactly once, and no extra icon/status tab stops. Verify both dashboards and reduced motion.
- Browser screenshots are attached by the subject-card Playwright test at desktop and mobile widths; computed grid tracks verify three/two/one columns. Unit coverage verifies 12-card slicing and 13-item pagination. Geometry checks run in a browser rather than jsdom.
- During implementation, run focused affected component/dashboard tests and `e2e/subject-cards.spec.ts`, extending the existing tests where practical.
- Before completion, run `npm run lint`, `npm run format:check`, `npm run test:architecture`, `npm test`, `npm run validate:content`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:admin`, `npm run build:admin`, and `git diff --check`. Run builds/browser suites sequentially because they share output. Confirm ordinary build excludes the admin entry and enabled admin build includes it. Content validation is a preservation check.

## Execution log

- 2026-10-12: Implemented the branded generic loading stack, responsive 3/2/1 column subject grids, shared All/In progress filter and 12-card pagination, uniform dashboard icon/title sizing, and stable activity metadata placement. Updated product, design, and regression documentation.
- Focused tests pass (3 files, 21 tests); the full suite passed on rerun (74 files, 442 tests). One earlier full run timed out in an existing progressive dashboard recovery test; its file passed 6/6 on isolated rerun.
- Typecheck/build, lint, architecture checks, formatter checks, and question-bank validation pass. Validation reports existing answer-under-review advisories; production builds retain the existing large-chunk advisory.
- Learner browser suite passes 13/13, including three/two/one-column assertions; admin browser suite passes 3/3; the enabled admin production build succeeds. Browser tests attach desktop/mobile grid screenshots.

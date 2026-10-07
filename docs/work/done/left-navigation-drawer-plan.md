# Left navigation drawer

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

## Status

Complete. Implemented the learner drawer, Flashcards placeholder, guarded section navigation, and coverage described below.

## Goal and agreed scope

Add a collapsible left navigation drawer to the learner application. Move the existing Meducation book logo and title from the top header into the top of the drawer. Offer exactly two destinations:

- **Quizzes:** the existing dashboard, retaining its subjects, statistics, loading, recovery, and progress behavior.
- **Flashcards:** a new dashboard placeholder with the heading “Flashcards” and copy “Work in progress. Your flashcards dashboard is coming soon.”

Expanded navigation shows icons and labels. Collapsed navigation shows only icons, including the brand icon and expand control. The brand continues to navigate to the quiz dashboard through the same exit protections as Quizzes.

## Proposed interaction and visual behavior

- Use the existing MUI components, warm theme, borders, and focus treatments. Start with a 240px expanded drawer and a 64px collapsed rail; centralize widths so layout and drawer stay aligned.
- On desktop (`md` and above), default to expanded and reserve drawer width beside the main content. Keep the drawer visible while the main region scrolls, with its own overflow if viewport height is constrained.
- On narrow screens, default to the collapsed rail. Expanding opens labels in a left overlay drawer, keeping the rail's reserved width so the content does not become unusably narrow. A backdrop click, Escape, or a committed destination selection closes the overlay and restores focus appropriately. Retain navigation on the left rather than moving it to a bottom bar.
- Maintain desktop expansion state in the mounted shell across screen changes. Keep this preference in memory for this version; a refresh restores the breakpoint default. Collapsing or expanding must preserve the current quiz, question, timer, dialogs, and screen state.
- Put the brand at the top, followed by a clearly labelled expand/collapse control and the two navigation items. Use distinct MUI quiz and flashcard icons so the collapsed choices remain recognizable.
- Quizzes remains selected on dashboard, subject, quiz, Browse Answers, results, and results review. Flashcards is selected only once navigation to its placeholder has committed; opening an exit dialog does not change selection.
- Use a labelled `nav` landmark, native buttons, visible focus, accessible names in both modes, and `aria-current="page"` on the actual dashboard destination. Use selected section styling for nested quiz screens without claiming that the quiz dashboard itself is the current page.
- Give icon-only controls tooltips on hover and focus, and expose `aria-expanded`/`aria-controls` on the toggle. Hide decorative icons from assistive technology. Honor reduced motion for drawer transitions.
- Keep existing screen-specific back controls. With the brand removed from the learner header, remove the otherwise empty header and place content recovery banners at the top of the main region. On mobile, “full width” means the available main width beside the rail.

## Existing implementation to reuse

- `src/app/components/AppShell.tsx` currently stacks a header above the main landmark; it is also used by bootstrap and admin.
- `src/app/components/AppHeader.tsx` owns the existing logo and optional home callback.
- `src/app/App.tsx` composes screens, guarded header navigation, pending exit destinations, launch cancellation, global dialogs, and screen transitions.
- `src/app/navigation.ts` defines the `View` union and `screenIdentity`; no URL router is currently used.
- `src/app/session/useQuizSession.ts` owns navigation and saves/pauses or aborts active attempts before leaving. Failed writes already keep the quiz open.
- `src/main.tsx` renders a shell during startup and boot failure. The admin shares shell/header components but is a separate authoring application.
- Vitest/Testing Library cover components and session behavior; Playwright exercises the production learner against the existing test-only API fixture.

## Implementation sequence

### 1. Add the flashcards destination

- [x] Extend `View` with `{ page: 'flashcards' }` and add its stable `screenIdentity`.
- [x] Add `FlashcardsDashboardScreen.tsx` with the heading and accessible placeholder copy, following current container and typography patterns.
- [x] Add a session action for showing Flashcards. Extend the existing exit destination type to include Flashcards, using a shared destination resolver for leave, abort, and review exits.
- [x] Leave subject/back destinations intact. Keep the small placeholder eagerly imported unless bundle evidence warrants lazy loading.

### 2. Build the learner drawer and shell composition

- [x] Add a presentation-only `AppNavigationDrawer.tsx` receiving active section, expanded state, toggle, and navigation callbacks.
- [x] Reuse or extract the existing brand rendering so the learner drawer and admin header share its appearance without duplicating the learner header.
- [x] Extend `AppShell` to support a sidebar layout while retaining the current header-only path for the admin. Give the main flex item `min-width: 0` and maintain viewport-height/loading behavior.
- [x] Keep the drawer outside `ScreenTransition` and keyed `ScreenLoadBoundary` so route changes do not remount it.
- [x] Integrate desktop rail/expanded widths and narrow-screen overlay behavior, focus handling, accessible controls, and reduced motion.

### 3. Wire guarded section navigation

- [x] Replace the learner header-home handler with one section navigation handler used by the brand and both navigation items.
- [x] Cancel pending quiz launches when requesting another top-level destination so delayed questions cannot pull the user back into a quiz.
- [x] From an active quiz, record the requested destination and open the existing exit dialog. Keep studying cancels navigation; Leave saves responses/current question and pauses time; Abort clears the current attempt. Commit the destination only after persistence succeeds.
- [x] From results review, use the existing leave-review confirmation and discard transient review only after confirmation.
- [x] From dashboard, subject, Browse Answers, and results, navigate directly. Moving to Flashcards must not write progress or fetch flashcard content. Existing startup subject loading may continue independently.
- [x] Update toast scope through the existing `screenIdentity` mechanism. Collapsing the drawer must not count as navigation or dismiss notifications.
- [x] Render the Flashcards placeholder through the existing screen transition/boundary composition.

### 4. Align startup, recovery, and documentation

- [x] Render the learner drawer brand during bootstrap and boot failure so the logo does not jump from a top header after App loads. Before App is ready, keep destinations visibly unavailable with clear loading semantics; Reload remains usable on failure.
- [x] Keep the separate admin header-only layout intact and adjust existing shell consumers/tests as needed.
- [x] Update banner geometry expectations to the main region, replacing assumptions about the old header and full browser width.
- [x] Update `docs/product.md`, `docs/architecture.md`, `docs/design-system.md`, and `docs/testing.md` with the implemented navigation, mobile behavior, state lifetime, and test expectations.
- [x] Record actual verification results here and move this tracker to `docs/work/done` after implementation is complete.

## Required tests

### Component and navigation tests (Vitest / Testing Library)

- Drawer: brand and exactly two destinations render; expanded labels are visible; collapsed labels are visually hidden while accessible names remain available; icons and toggle remain usable.
- Drawer: selected section follows props; actual dashboards expose current-page semantics; both destinations and brand call the correct callback.
- Drawer: keyboard activation, labelled toggle and expanded state, focus-visible behavior where testable, and collapsed tooltips.
- Shell: sidebar and main are separate landmarks; changing expansion does not remount children; admin header-only mode and main busy semantics remain intact.
- Flashcards: heading and work-in-progress copy render with no interactive study feature or progress mutation.
- Navigation: Flashcards has a distinct stable screen identity; quiz question/timer updates continue to preserve quiz screen identity.

### Session and App integration tests

- Quizzes opens the existing dashboard from Flashcards and nested quiz screens; brand follows the same destination behavior.
- Flashcards opens the placeholder from dashboard, subject, Browse Answers, and results, retaining saved attempts and completed history.
- Parameterize both drawer destinations through active-quiz Keep studying, Leave, and Abort flows. Verify requested destination, persisted responses/current question, paused timer, retained attempt on Leave, and cleared attempt on Abort.
- A failed Leave or Abort write keeps the active quiz and Quizzes selection; no subsequent navigation bypasses the error.
- Both destinations and the brand respect review confirmation; Keep reviewing retains review, confirmed exit removes transient review without changing completed scores.
- A delayed question launch followed by Flashcards navigation cannot later start a quiz. Returning to Quizzes still works.
- Collapse/expand does not reset the quiz question, responses, timer, screen identity, or toast scope; expansion survives normal screen navigation.
- Drawer remains available during screen loading and catalog errors. Flashcards is usable even when the quiz catalog fails, and returning to Quizzes retains existing recovery behavior.

### Browser tests (Playwright)

- Add a focused navigation spec using the existing fixture: desktop expanded drawer, collapse to icons, navigate Flashcards → Quizzes in collapsed mode, then expand again.
- Exercise keyboard-only toggle and destination navigation, selected styling/current-page semantics, focus tooltips, and logo navigation.
- At 390px width, verify the rail, overlay expansion, backdrop/Escape dismissal, focus restoration, and destination selection. Repeat the essential navigation with reduced motion.
- Check no document-level horizontal overflow on dashboard, subject, placeholder, active quiz, Browse Answers, and review. Capture desktop/mobile screenshots to inspect drawer spacing and existing quiz navigator behavior.
- Cover one active-quiz exit to Flashcards and resume through Quizzes, plus one review exit to Flashcards. Keep exhaustive guard permutations in integration tests.
- Update existing recovery-banner checks to compare against the main region bounds rather than the removed learner header.
- Preserve the existing reload/resume, completion, read-only review, loading, and first-quiz latency smoke paths.

## Verification and completion criteria

During implementation, run focused tests for the drawer, shell, placeholder, navigation, App integration, and session changes. Before handoff run:

- `npm test`
- `npm run lint`
- `npm run format:check`
- `npm run build` (includes TypeScript checking)
- `npm run test:e2e` (includes the production fixture build)
- `git diff --check`

Canonical question content and backend behavior are outside this feature's scope. If implementation unexpectedly changes content, run `npm run validate:content` as required by repository guidance.

Completion requires the feature tests and relevant existing checks to pass, visual inspection at desktop/mobile widths, preserved quiz exit/persistence behavior, and updated documentation. Record any failing check explicitly rather than marking the feature complete.

## Verification results

- `npm test` — passed (43 files, 268 tests).
- `npm run lint` — passed.
- `npm run build` — passed; the existing large-chunk warning remains.
- `npm run format:check` — passed.
- `npm run test:e2e` — passed (8 browser tests, including drawer screenshots, mobile Escape/focus restoration, and leaving/resuming an active quiz through Flashcards).
- `git diff --check` — passed.
- Visually inspected desktop collapsed and mobile expanded drawer captures; dimensions, labels, contrast, and overlay placement are correct.

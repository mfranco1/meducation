# Branded loading-screen transition

## Status

Complete.

## Goal

Replace standalone, text-only loading screens with a simple animated status centered in the available content area. Render the header and other dependency-free chrome immediately; replace only the pending content when it is ready. Keep the warm Meducation palette, concise copy, and existing navigation behavior.

## Findings and scope

- `src/app/components/ScreenLoadBoundary.tsx` displays “Loading screen…” while lazy Quiz, Browse Answers, Review, or Results presentation loads. `AppHeader` already sits outside this boundary in `src/app/App.tsx` and must stay mounted and usable.
- `src/admin/AdminApp.tsx` returns “Loading canonical question bank…” before rendering its header. This text-only full-page state also qualifies. Its gateway is local; loading is not necessarily a network request.
- `src/main.tsx` waits for its dynamic App import before rendering anything. Render the lightweight shell during that existing startup wait so startup does not leave a white page. Do not gate the shell on content requests. `index.html` currently has an empty root, with no literal “Loading…” placeholder.
- Dashboard and subject catalog skeletons, statistic placeholders, subject quiz-launch buttons, and the question-loading `LinearProgress` already preserve useful content. Keep their loading and retry presentations unchanged.
- Leave QA tooling, answer feedback, celebrations, in-screen question navigation, dialogs, and existing failure messages outside this change. Do not add a loader to every network request or replace visible pages with an overlay.

## Presentation specification

- Use the existing `background.default` off-white surface (`#fbf8f5`) and `primary.main` warm accent (`#b9511b`). No new card, shadow, illustration, or backdrop.
- Show one small indeterminate ring, approximately 32px, above one muted text line with about 12px spacing. Reuse MUI `CircularProgress`; no animation package or remote asset is needed.
- Copy: “Loading…” by default, “Loading quiz…”, “Loading answers…”, “Loading review…”, “Loading results…”, and “Loading question bank…” when the context is known. Use “Loading Meducation…” during bootstrap. No percentages, speculative countdowns, technical details, or rotating tips.
- Center horizontally and vertically within the remaining viewport below the actual header and any visible shell notices. Use a flex column shell with `min-height: 100dvh` and a `100vh` fallback; let the main loading region grow. Avoid fixed header-height subtraction, full-screen positioning, and overlaying navigation.
- Show pending status immediately. Do not enforce a minimum loading duration or wait for an animation cycle to end. Cached content should render immediately without an intentional loading flash.
- Replace the loader as soon as React can render ready content. Give content resolving from a displayed fallback a short 170ms opacity-only entry using the existing screen-transition easing. Keep one mounted destination and no exit delay. Coordinate this with `ScreenTransition` so navigation and load resolution never apply two entry animations to the same content.
- Respect `prefers-reduced-motion`: stop ring rotation and dash motion, retaining a static ring and readable status; disable the content fade. Preference changes should apply through CSS.
- Expose one polite `role="status"` text announcement and `aria-busy` on the pending main content region. Hide the decorative ring from assistive technology to avoid duplicate progress announcements. Do not move focus, create focusable placeholders, or announce animation cycles. Clear busy state on success or failure.

## Implementation steps

### 1. Add the reusable presentation and shell layout

- [x] Add `src/app/components/ScreenLoading.tsx` with a small optional status-label prop. Keep loading state, fetching, retries, and navigation outside this component.
- [x] Add a lightweight `AppShell` presentation component, or an equivalent small shared layout, for the learner background, header slot, notices, and growing main region. Keep header spacing and visual appearance unchanged.
- [x] Ensure the shell and loader are statically available to `main.tsx`; they must not import `App`, screen modules, question-bank JSON, rich Markdown, or session/persistence logic.
- [x] Put reduced-motion rules and loader dimensions in the shared component using existing theme/Emotion patterns. Override both MUI indeterminate animations.

### 2. Replace the learner fallback

- [x] Extend `ScreenLoadBoundary` to receive concise destination copy and use `ScreenLoading` as its Suspense fallback. Pass labels from the existing navigation view in `App.tsx`.
- [x] Keep the existing error boundary, reload action, lazy imports, destination key, and parallel screen preloading.
- [x] Reuse the shell in `App.tsx`; preserve the header callback, persistence notices, question-load progress bar, and global dialogs outside pending content.
- [x] Implement content entry at the ready-content boundary so it runs after an actually displayed fallback resolves. Suppress overlapping `ScreenTransition` motion; preserve its current behavior for immediate destination changes. Do not change screen identities or remount ready screens on ordinary updates.
- [x] Preserve current session behavior during chunk waits. This is a presentation change; do not change attempt creation, stopwatch rules, launch cancellation, or persistence.

### 3. Render the learner shell during bootstrap

- [x] Render the themed shell and `ScreenLoading` before awaiting the existing dynamic App import in the normal learner boot path.
- [x] Use the same shell geometry for pending, ready, and boot-failure states. Show only the lightweight shell during bootstrap; the dashboard then renders its existing progressive content and local statistics.
- [x] Keep the bootstrap brand visible with no misleading active navigation control until the session callback exists. After App mounts, retain the current header navigation and quiz/review exit-confirmation behavior.
- [x] Reuse existing boot-failure recovery when the import rejects, stopping the loader and retaining the header. Keep the development `#content-qa` branch behavior intact.
- [x] Keep the rendering claim precise: this shell appears when the entry JavaScript runs; it does not provide a pre-JavaScript HTML loading screen.

### 4. Replace the admin text-only state

- [x] Move the existing admin header outside the snapshot-dependent body, keeping its Admin label and local-export note visible while the snapshot is pending.
- [x] Use `ScreenLoading` only in the pending body. Keep data-dependent Import/Export actions disabled until usable; retain current disabled-production behavior.
- [x] Keep existing load-error handling as a terminal state that replaces the animation, with the static header still present. Do not change gateway or editing behavior.

### 5. Verify and document

- [x] Add focused presentation tests for accessible status, pending busy state, ready replacement, and failure replacement.
- [x] Hold lazy imports pending in boundary/integration tests: verify the header remains visible, ready content replaces the loader, failure still exposes Reload, and navigation away cannot reveal an obsolete destination.
- [x] Verify fast/cached destinations show immediately, load resolution does not double-animate, and subsequent question index, answer, and timer updates preserve mounted screen state.
- [x] Add bootstrap coverage for shell-before-import and import rejection. Add admin coverage for pending header, disabled actions, and loaded/error bodies.
- [x] Retain regression coverage for catalog skeletons, retry waits, question-launch progress, and local progress availability. No new generic loader should appear in those regions.
- [x] Browser-check slow lazy chunks, normal and reduced motion, desktop and narrow mobile layouts, keyboard navigation, header/notice sizing, and failure recovery. Confirm true centering below chrome without overflow or focus movement.
- [x] Run relevant focused tests, `npm test`, `npm run lint`, `npm run format:check`, `npm run build` (includes TypeScript checking), and `git diff --check`. No canonical content changes are planned; run content validation if that scope changes.
- [x] Update `docs/design-system.md`, `docs/architecture.md`, `docs/product.md`, and `docs/testing.md` with the implemented behavior. Record verification here and move this tracker to `docs/work/done` only after implementation and required checks pass.

## Acceptance criteria

The current text-only loading screens show a restrained warm ring and one short label in the center of the available main area. The relevant static header is visible immediately and stays usable wherever its navigation is available. Content replaces loading as soon as it is ready; failures stop loading and retain recovery actions. Reduced-motion users see static status and instant replacement. Existing skeletons, inline loading indicators, quiz state, content, and persistence retain their behavior.

## Implementation and verification record

- Added a shared flex shell and accessible loading presentation for learner startup, lazy learner screens, and the admin question-bank snapshot wait.
- Kept learner and admin headers visible while loading, added concise destination labels, polite status announcements, and main-region `aria-busy` state.
- Added a brief opacity entry after a committed lazy fallback once the existing screen-entry animation has ended, respecting reduced motion.
- Preserved the existing lazy-load and bootstrap reload recovery. Existing catalog skeletons, retries, question-launch progress, and progress persistence were unchanged.
- Updated architecture, design-system, product, and testing documentation.
- Focused loading boundary and screen transition tests passed after the final animation coordination change. `npm test` passed (39 files, 247 tests); `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` passed.
- `npm run test:e2e` passed (5 Chromium tests), including narrow reduced-motion loading and production build smoke paths. The build retains its existing large-chunk warning.

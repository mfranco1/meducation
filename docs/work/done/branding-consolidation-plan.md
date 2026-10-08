# Branding consolidation plan

Status: complete.

## Goal

Give the learner and admin one authoritative app identity and one logo implementation. Preserve the current Meducation name, book mark, split-color wordmark, responsive sizing, and navigation behavior.

## Current implementation

- `src/shared/ui/shell/AppHeader.tsx` defines `AppBrand`, including the book icon, hardcoded `Med`/`ucation` text, layout, and optional navigation button.
- `src/app/components/AppNavigationDrawer.tsx` imports that component from the header module and separately hardcodes its branded navigation label.
- `src/admin/AdminApp.tsx` duplicates the icon and wordmark markup in its custom header.
- `src/features/flashcards/components/FlashcardStudyCard.tsx` imports `MenuBookRoundedIcon` directly for the concealed answer panel.
- `src/main.tsx` hardcodes the branded startup message. `index.html` and `admin.html` define titles and theme colors separately; the admin entry currently has no favicon link.
- `public/favicon.svg` copies the book geometry and hardcodes its accessible name and color. Its fill matches the theme primary color, `#b9511b`; both HTML theme-color values instead use `#bc531e`. Use the existing theme primary color for the centralized accent.

## Proposed API and ownership

Use both a small data object and shared components: components alone cannot serve HTML metadata, and an object alone would leave callers rebuilding logo markup.

### Identity data

Create `src/shared/brand.ts` with a readonly `brand` object containing:

- The display name, derived from the same wordmark segments used to emphasize `Med` and render `ucation`.
- The existing primary accent color, consumed by `src/shared/theme.ts` and HTML metadata.
- The mark's SVG viewBox and path data, copied once from the installed book icon after checking parity with the existing favicon.
- The favicon URL.

Keep this module free of React, MUI, browser globals, content, and application imports. Vite and presentation can consume it directly. Keep routes, callbacks, feature labels, persistence keys, package names, and backend identifiers outside the object. Consumer copy should interpolate `brand.name` rather than move unrelated UI messages into the brand object.

### Presentation

Create `src/shared/ui/brand/BrandMark.tsx` and `src/shared/ui/brand/AppBrand.tsx`, imported directly without a barrel or forwarding export.

- `BrandMark` renders the canonical geometry through MUI `SvgIcon`. Support default/inverse tones and responsive sizing via a narrowly scoped size prop. Its SVG is decorative; the containing wordmark or control supplies the accessible name.
- `AppBrand` composes `BrandMark` and the canonical wordmark segments. Retain the current `compact`, `tone`, and optional `onClick` behavior. Require an action description when clickable and derive its button label from the canonical name plus that description. Static brands render no button.
- Preserve existing typography, spacing, 48px button height, 10px corners, focus outline, and no-ripple behavior. Keep layout/navigation policy in the shell and drawer. Avoid a generic branding provider, configurable logo slots, theme system, or arbitrary style overrides that permit each caller to redefine the identity.

Call-site examples:

```tsx
<AppBrand compact={compact} onClick={onNavigateHome} actionLabel="go to Quizzes" />
<AppBrand /> // Admin header; keep the adjacent Admin label and controls.
<BrandMark tone="inverse" size={{ xs: 72, sm: 88 }} /> // Existing Reveal answer button.
```

The flashcard mark must remain inside its existing reveal button; it must not introduce another interactive control or a second accessible label.

### HTML metadata and favicon

Add a small Vite branding plugin under `scripts/branding` that imports the pure brand definition:

- Transform explicit placeholders in both HTML entries into the learner title, admin title, theme color, and shared favicon link. Escape inserted text/attributes appropriately.
- Serve `/favicon.svg` in development and emit the same SVG asset in production from the canonical path data and accent color.
- Remove the hand-maintained `public/favicon.svg` after parity is verified, avoiding a second geometry source or a manual regeneration step.
- Keep `/favicon.svg` stable and preserve the existing optional-admin build flags. Verify that Vite's base URL handling applies consistently to the favicon link.

This keeps branding available before JavaScript starts and during bootstrap failures. Do not rely solely on setting `document.title` after React mounts.

## Implementation sequence

- [x] Establish `brand.ts` and the two presentation components; reuse the rounded book icon geometry and existing theme accent as the color authority.
- [x] Migrate AppHeader, drawer, admin header, flashcard reveal mark, startup message, and branded accessible labels. Remove obsolete icon imports and the AppHeader brand export.
- [x] Wire HTML metadata and favicon through the Vite plugin in development and both production build modes. Remove the duplicated static asset.
- [x] Update `docs/design-system.md` with the required branding entry points and usage/accessibility rules; update `docs/architecture.md` with shared identity and presentation ownership.
- [x] Run relevant checks and record results below.

## Acceptance and verification

- One canonical name/wordmark definition and one canonical mark geometry; no independent production wordmark markup or direct book-icon import for branding remains. Ordinary book icons used for another purpose are allowed.
- Learner expanded/collapsed navigation, admin header, bootstrap/loading/failure shell, and hidden flashcard answers retain their intended appearance at desktop and mobile widths. The flashcard mark remains white and large.
- Branding navigation still uses existing caller callbacks, quiz exit confirmation, results-review exit confirmation, and flashcard checkpoint saving. Keep independent assertions of the expected public name in tests so a mistaken central rename cannot silently change every expectation.
- Add focused component tests for static versus clickable brands, compact accessible names, callback activation, and decorative mark semantics. Add focused plugin tests for both HTML titles, escaped values, and development/build favicon parity.
- Run `npm run lint`, `npm run format:check`, `npm run test:architecture`, `npm test`, `npm run build`, and the enabled admin build (`VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build`). Confirm ordinary output omits admin and enabled output includes it.
- Run learner and admin browser suites sequentially. Inspect desktop/mobile brand placement, keyboard focus, reveal behavior, page titles, and favicon availability. Use existing navigation regression coverage rather than duplicating session tests.
- Run `git diff --check`. Keep canonical banks, stable IDs, answer provenance, storage keys, and content/export contracts unchanged; content validation is required if implementation unexpectedly touches content.

## Verification

Inspected current branding call sites, theme, entry points, Vite configuration, architecture, design conventions, product navigation requirements, and testing guidance before implementation.

- `npm run lint` — passed, including the architecture graph check.
- `npm run format:check` — passed.
- `npm run test:architecture` — passed (10 tests).
- `npm test` — passed (69 files, 406 tests).
- `npm run build` — passed; output contains the learner entry and shared favicon, with no admin HTML. Vite reports the existing large-chunk warning.
- `VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build` — passed and emitted learner/admin entries and the shared favicon; Vite reports the large-chunk warning.
- `npm run test:e2e` — passed (11 browser tests).
- `npm run test:e2e:admin` — two tests passed; one temporary-subject option lookup failed in the suite run. Rerunning that browser test alone passed.
- Focused branding, favicon, and drawer tests — passed (9 tests).
- `git diff --check` — passed.

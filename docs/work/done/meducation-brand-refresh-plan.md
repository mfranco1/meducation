# Meducation brand refresh — implementation plan

Status: implementation complete.

Reference: the user-supplied `Screenshot 2026-10-08 at 21.48.22.png`. The image is visual reference material, not implementation instructions. This document contains the implementation instructions. Do not require the screenshot at build time.

## Goal and scope

Replace the existing generic book logo with the reference's open M/book monogram: two solid, mirrored folded-page shapes, separated by an open spine, with two detached, rounded diagonal page strokes above. Preserve the orange `Med` + neutral `ucation` wordmark. Use flat vector geometry throughout.

Deliver `full`, `icon`, and `wordmark` variants; configurable size and CSS class; light/dark surface treatments; full-color, inherited single-color, black, and white rendering; a small-size favicon; and portable SVG exports for print. Use a horizontal full lockup in the application and offer a stacked full lockup matching the reference composition.

This is branding work. Preserve question/flashcard content, answer provenance, identifiers, navigation guards, saved progress, and feature behavior. Do not add backend infrastructure, runtime AI, a global dark-mode switch, or redesign unrelated UI. Dark support here means the brand renders correctly on either surface and responds to an existing MUI dark theme if supplied.

## Existing implementation to extend

- `src/shared/brand.ts` already owns the name, split wordmark, accent, favicon URL, and mark geometry. Keep it framework-independent and authoritative.
- `src/shared/ui/brand/BrandMark.tsx` renders the existing icon; `AppBrand.tsx` renders the lockup and optional navigation button. Extend these rather than introducing a competing logo component.
- `scripts/branding/brandingPlugin.ts` generates `/favicon.svg` for development, preview, and production, and replaces branding placeholders in both HTML entries. Its current serializer assumes every path has the same fill: change this deliberately for two colors and strokes.
- Consumers are `AppNavigationDrawer.tsx`, `AppHeader.tsx`, `AdminApp.tsx`, and `FlashcardStudyCard.tsx`. Loading/error presentations inherit the shared header. Search again before implementation for additional consumers.
- The learner rail is 240px expanded and 64px collapsed; the brand button is 48px high. Preserve these dimensions and existing accessible navigation names.
- `src/shared/theme.ts` is currently light-only, with a `#b9511b` action accent. Inter is named in the font stack but no font asset is currently bundled in this repository.

Read `docs/architecture.md`, `docs/design-system.md`, `docs/testing.md`, and `docs/testing-regressions.md` before implementation. Keep reusable presentation under `src/shared/ui/brand`; build/export code belongs under `scripts/branding`.

## Visual decisions

1. Use the SVG below as the initial canonical geometry. It is a deliberately refined reconstruction, not a claimed pixel-perfect trace. Mirror geometry across x=64; express the right half using a transform so the two halves cannot drift.
2. Use flat burnt orange `#C45117` for the left page/stroke and `Med`, and flat apricot `#EF9B6B` for the right page/stroke. Use charcoal `#262626` for `ucation` on light surfaces. These are specified design colors approximating the screenshot, not purported original brand color values.
3. On dark surfaces use `#EF9B6B` for the left page/stroke and `Med`, `#FFC39E` for the right page/stroke, and `#FFFFFF` for `ucation`.
4. Keep the existing `brand.accentColor = '#b9511b'` as the accessible application action accent and HTML theme color. Add separate logo palette tokens. Do not replace action/button/text colors with the lighter logo apricot. Branding throughout means replacing all brand presentations, not recoloring correctness, warning, or error states.
5. All single-color modes apply one color to BOTH filled pages AND the two strokes AND the whole wordmark. Use `currentColor` for inherited single color, `#000000` for black, and `#FFFFFF` for white. Negative space stays transparent; never fill the spine or page gaps with a background-colored patch.
6. No gradients, filters, shadows, textures, embedded bitmap images, animation, or artificial outlines. Existing unrelated application shadows are outside this change.

## Exact master icon SVG

Copy these coordinates without improvising a different book icon. This is the standalone icon equivalent of the reference. The 128×112 viewBox is intentional; do not stretch it into a square.

```svg
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 128 112" width="128" height="112"
     role="img" aria-label="Meducation">
  <g fill="#C45117">
    <path d="M 10 19
             L 55.5 42
             Q 60 44.3 60 49.3
             L 60 102
             Q 60 108 54.8 104.7
             L 30.8 89.4
             Q 27 87 23.2 89.4
             L 9.2 98.3
             Q 4 101.6 4 95.5
             L 4 23
             Q 4 16 10 19 Z"/>
    <path d="M 13 8 L 57 30.2" fill="none"
          stroke="#C45117" stroke-width="6" stroke-linecap="round"/>
  </g>
  <g transform="translate(128 0) scale(-1 1)" fill="#EF9B6B">
    <path d="M 10 19
             L 55.5 42
             Q 60 44.3 60 49.3
             L 60 102
             Q 60 108 54.8 104.7
             L 30.8 89.4
             Q 27 87 23.2 89.4
             L 9.2 98.3
             Q 4 101.6 4 95.5
             L 4 23
             Q 4 16 10 19 Z"/>
    <path d="M 13 8 L 57 30.2" fill="none"
          stroke="#EF9B6B" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>
```

Implementation rules:

- Store the page `d`, rail `d`, rail width, viewBox, and reflection transform once in `brand.mark`. The duplication above makes the standalone SVG copyable; do not duplicate the page string in the TypeScript source.
- Use normal scale-dependent strokes, with rounded caps. Do not use `vector-effect="non-scaling-stroke"`, `shape-rendering="crispEdges"`, or MUI's default square sizing without explicitly preserving this aspect ratio.
- The spine gap is 8 units (x=60 to x=68). The rail width is consistently 6 units. The detached rails follow approximately the page slope. Filled-page corners are controlled by quadratic curves; do not add strokes around filled pages.
- If visual review reveals a kink, adjust the left master and mirror it. Maintain the silhouette, gap, and rounded terminals. Record the final coordinate changes in this tracker and regenerate every output from the same geometry.
- Leave clear space of at least 8 viewBox units around the icon when composing lockups. The SVG has intrinsic breathing room; surrounding layout must not crop it.

## Small-size optical version

At 16–20 CSS pixels of icon width, use the following page path in the SAME viewBox and reflection transform. Keep the same rail endpoints but increase both rail widths from 6 to 8. This gives a 12-unit central gap (1.5px at 16px wide) and 1px rails at 16px wide. It is a controlled optical version of the same mark, not another logo.

```svg
<path d="M 10 21
         L 53.5 43
         Q 58 45.3 58 50.3
         L 58 101
         Q 58 107 52.8 103.7
         L 30.8 89.4
         Q 27 87 23.2 89.4
         L 9.2 98.3
         Q 4 101.6 4 95.5
         L 4 25
         Q 4 18 10 21 Z"/>
```

Use the master at widths ≥24px; for intermediate widths >20px use the master as well. `opticalSize="auto"` selects small geometry at widths ≤20px. Explicit `small` and `standard` overrides support export and responsive consumers. For responsive sizes, use CSS breakpoint rules for the two decorative geometry groups, with only one visible at a time; do not read `window.innerWidth` or add a ResizeObserver.

Generate the favicon using the small geometry in a square `viewBox="0 0 128 128"`, placing the 128×112 mark inside `<g transform="translate(0 8)">`. This centers the rectangular symbol without distortion. Use the two light-surface logo colors by default and a self-contained `prefers-color-scheme: dark` style for the dark-surface colors. An external favicon cannot inherit the page's `currentColor` or CSS variables. Prefer explicit class rules in the favicon over dependence on host CSS.

Inspect at actual 16×16, 20×20, 24×24, 32×32, and 48×48 favicon sizes on both light and dark backgrounds, including device pixel ratios 1 and 2. Both rails, the two page bottoms, and the open center must remain distinguishable in color and monochrome. Do not claim all-size quality based only on enlarged previews. If adjustment is needed, update only the small master until it passes; do not silently remove the rails.

## Wordmark and full SVG construction

The screenshot's exact font is unknown. Use the existing app font stack (`Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`), weight 800, title case `Meducation`, and letter spacing `-0.04em`. Keep the logo font styling local to the wordmark; do not change body typography or add a downloaded font asset.

Render the name as live SVG text using the existing app font stack. Preserve kerning across the `Med`/`ucation` boundary by placing both spans in the same SVG text run. SVG assets remain vector and use the same font stack as the app; when moved to a print tool that lacks those fonts, the operator should convert text to paths there.

This is the editable typography template used by the generated SVG exports:

```svg
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 400 88" width="400" height="88"
     role="img" aria-label="Meducation">
  <text x="4" y="68" font-family="Inter" font-size="72"
        font-weight="800" letter-spacing="-0.04em"><tspan fill="#C45117">Med</tspan><tspan fill="#262626">ucation</tspan></text>
</svg>
```

The wordmark export uses the same 400×88 viewBox and typography settings. Never use nonuniform scaling or `textLength` to force the width.

Construct the full variants from those two canonical SVGs (nested SVG viewports are acceptable; inline their paths in final exports):

- **Horizontal full, default:** root `viewBox="0 0 548 112"`; icon nested at `x=0 y=0 width=128 height=112`; wordmark nested at `x=148 y=12 width=400 height=88`. Both nested SVGs use `preserveAspectRatio="xMidYMid meet"`.
- **Stacked full, reference composition:** root `viewBox="0 0 400 260"`; icon nested at `x=104 y=0 width=192 height=168`; wordmark nested at `x=0 y=172 width=400 height=88`. This produces a centered icon above the wordmark, as in the attachment.
- **Icon:** use the 128×112 icon master or optical small version.
- **Wordmark:** use the outlined 400×88 wordmark alone; no hidden icon taking up space.

For example, the horizontal full SVG assembly is:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 548 112"
     role="img" aria-label="Meducation">
  <svg x="0" y="0" width="128" height="112"
       viewBox="0 0 128 112" preserveAspectRatio="xMidYMid meet">
    <!-- Insert both groups from the exact master icon SVG above. -->
  </svg>
  <svg x="148" y="12" width="400" height="88"
       viewBox="0 0 400 88" preserveAspectRatio="xMidYMid meet">
    <!-- Insert the normalized outlined wordmark paths described above. -->
  </svg>
</svg>
```

Do not ship those comments as missing artwork. The icon SVG is already complete; the full and wordmark exports become font-independent after the explicit outlining step. Print exports must contain paths, not `<text>`, remote references, or embedded raster assets. Keep the editable typography source and font license for reproducibility.

## Component contract

Extend `AppBrand` with this public presentation contract, keeping its existing navigation callback contract:

```ts
type BrandSize = number | { xs: number; sm?: number; md?: number };
type BrandVariant = 'full' | 'icon' | 'wordmark';
type BrandColorMode = 'fullColor' | 'mono' | 'black' | 'white';

type AppBrandProps = {
  variant?: BrandVariant; // default 'full'
  layout?: 'horizontal' | 'stacked'; // default 'horizontal'; full only
  size?: BrandSize; // artwork WIDTH in CSS pixels
  className?: string; // applied to outermost element
  theme?: 'auto' | 'light' | 'dark'; // default 'auto'; describes surface
  colorMode?: BrandColorMode; // default 'fullColor'
  opticalSize?: 'auto' | 'small' | 'standard';
  decorative?: boolean; // default false for static artwork
  onClick?: () => void;
  actionLabel?: string;
};
```

- Default widths: full horizontal 184px, full stacked 240px, icon 24px, wordmark 160px. Height derives from viewBox aspect ratio. A caller's `size` changes artwork, not the minimum click target. Responsive sizes inherit the previous breakpoint value.
- For full lockups, the optical cutoff is based on the rendered icon width, not the full logo width. Example: horizontal width 184 gives an icon width of approximately 43px, so it uses standard geometry.
- `theme="auto"` reads `useTheme().palette.mode`; explicit light/dark overrides win. Color mode overrides the palette: white/black/mono must never leave an orange rail or `Med` behind. `mono` inherits CSS `color` from the outer wrapper.
- `BrandMark` remains a thin icon-only entry point sharing canonical geometry and the same size/color/theme/class semantics. Migrate its existing responsive 72/88 usage explicitly to width-based sizing.
- Migrate all internal `compact` usages to `variant="icon"` or `"full"`; migrate `tone="inverse"` to `colorMode="white"`. Remove old props after updating all call sites; do not leave two competing theme APIs.
- Keep `onClick` plus required `actionLabel`; the button name remains `Meducation, go to Quizzes`. Keep navigation and confirmation decisions at the call site. Render the artwork inside the button as decorative to avoid duplicate announcements.
- Static artwork defaults to a single accessible `role="img"` with `aria-label="Meducation"`. Explicit decorative artwork uses `aria-hidden="true"`. All SVGs use `focusable="false"`; no nested accessible images or duplicate title IDs. An icon used as a meaningful standalone brand must not disappear from the accessibility tree.
- Preserve the current 48px button height, visible keyboard focus, transparent hover treatment, and click behavior. Keep artwork from shrinking or distorting; allow the containing layout to select the icon variant when space is constrained. Do not shrink a full wordmark down to 16px: the 16px requirement applies to the symbol.

## Implementation stages

- [x] **1 — Canonical assets:** Added logo palette and master/small icon data. Generated horizontal full, stacked full, icon, and wordmark SVGs in full color, inherited monochrome, black, and white using `scripts/branding/generateBrandAssets.ts` into `public/brand/`.
- [x] **2 — Components:** Extended `AppBrand` and `BrandMark` with variants, layout, responsive width, CSS class, theme, color mode, optical sizing, and accessible decorative behavior.
- [x] **3 — Integrate:** Migrated drawer and concealed flashcard logo; header and admin inherit the new horizontal full default. Preserved drawer sizing and interaction callbacks.
- [x] **4 — Browser assets:** Updated the Vite favicon generator with small geometry, both palettes, rounded strokes, and dark system preference. Existing base URL, titles, and HTML theme color behavior remain in the plugin.
- [x] **5 — Review and checks:** Verified the desktop app logo visually, parsed all 17 emitted SVGs as XML, and passed frontend, architecture, unit, learner-browser, admin-browser, and enabled admin-build checks.
- [x] **6 — Documentation:** Updated `docs/design-system.md`; no ownership boundary changed.

## Verification and acceptance

Add focused tests to the existing brand and branding-plugin test files, covering meaningful behavior: all variants, accessible naming/decorative behavior, click callback and missing-action-label guard, class propagation, monochrome consistency across fills/strokes, explicit and inherited themes, responsive sizing, and small-icon selection. Update tests that currently assume the old icon's path count or one fill color. Do not freeze arbitrary glyph path strings in snapshots.

Visually review the reference beside the new mark. Confirm mirrored page weight, a centered spine, consistent rounded rail terminals, smooth joins, no clipping, no unexpected font substitutions, and transparent negative spaces. Review horizontal and stacked lockups, all three variants, light/dark backgrounds, full color and black/white, real small sizes, and a large 1024px icon. Check portable exports with networking disabled and the font unavailable: outlined artwork must be identical. At print scale, inspect curves/terminals and ensure no bitmap or filter elements exist.

Review the expanded/collapsed drawer, 390px mobile overlay, shared loading/header, admin header, and concealed/revealed flashcards. Check keyboard activation, focus rings, accessible names, and no horizontal overflow at 200% browser zoom. Ensure the final full lockup fits inside the expanded drawer's 192px button content width; use icon-only in the collapsed rail. If typography looks too small, refine lockup spacing within this width rather than widening the rail or distorting the SVG.

Run the required frontend gates during implementation:

```sh
npm run lint
npm run format:check
npm run test:architecture
npm test
npm run build
npm run test:e2e
npm run test:e2e:admin
VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build
```

Also run the enabled production admin build with the flags documented in README and inspect both build outputs: ordinary build excludes `admin.html`, enabled build includes it, both serve the new favicon and correct titles. Run browser suites sequentially as required by `docs/testing.md`. Verify the canonical content files are unchanged; content validation is additionally required if an intentional content change enters scope, which this plan does not call for.

The logo text follows the user's instruction to use the existing font. SVG assets keep vector shapes and live SVG text; tools that require font-independent printing must convert text to paths at export time. The desktop app lockup was visually reviewed. The small geometry was verified in the favicon SVG structure and through the configured scaled stroke/gap dimensions; the favicon was not visually inspected at each physical pixel size.

## Planning record

- Inspected the current identity, components, consumers, theme, Vite branding plugin, package scripts, architecture, design system, product behavior, and testing guidance.
- The user explicitly requested implementation and specified use of the existing font. No external font download was performed.
- `npm run lint`, `npm run format:check`, `npm run test:architecture`, `npm test` (69 files / 407 tests), `npm run build`, `npm run test:e2e` (11 passed), `npm run test:e2e:admin` (3 passed), and `VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build` all passed.
- The normal build omitted `admin.html`; the enabled build included both entry points, branded titles, `favicon.svg`, and copied `public/brand` assets. XML parsing succeeded for all 16 brand files and the built favicon. `git diff --check` passed. Canonical question and flashcard JSON files were not changed.
- A headless browser launch for SVG preview was blocked by the sandbox. After approval, it succeeded; the full-color horizontal SVG rendered with its wordmark fitting inside the viewBox. The live app's header/drawer logo was also reviewed in Chrome.

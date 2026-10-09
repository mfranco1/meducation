# Playing-card flashcard appearance and motion

Status: complete; implementation and relevant regression checks passed.

## Scope and reference

Restyle only the flipping answer panel in `src/features/flashcards/components/FlashcardStudyCard.tsx`. Keep the prompt, flag, surrounding white study container, header, navigator, and footer in their current positions. Both concealed and revealed faces become one physical-looking card. Preserve all study, keyboard, focus, rich-content, and persistence behavior.

Visual reference: `/Users/noodle.zip/Desktop/Screenshot 2026-10-08 at 22.40.21.png` (attached to the request). It shows a landscape cream card, an orange inset with four inward-curved corner cutouts, a fine cream inset outline, and a centered white Meducation book mark. The following numbers are implementation targets estimated from the reference, not sampled measurements.

Do not add suits, ranks, text labels, grain, photographic assets, animation libraries, or pointer-following tilt. Use the existing `BrandMark`; do not redraw the logo. No content-bank, domain, persistence, or backend changes.

## 1. Exact visual specification

Use explicit CSS pixel strings in MUI `sx` for the geometry below: numeric `borderRadius` and spacing values are theme multipliers, not pixels.

- The answer card fills the panel's existing available width. Set `minHeight: { xs: '220px', sm: '280px' }`; height remains intrinsic and grows for long answers. Do not enforce a fixed height or aspect ratio. The reference's roughly 1.6:1 silhouette is inspiration; readable answers and the existing screen layout take precedence.
- Outer silhouette: `borderRadius: { xs: '22px', sm: '28px' }`, `boxSizing: 'border-box'`, `border: '1px solid'` using the closest existing `theme.palette.background` paper/default tokens. Prefer `background.paper` as the card base and use a subtle CSS gradient between existing paper/default tokens only if it remains visibly warm. Do not introduce new cream hex values when the theme already supplies suitable ones. This is the answer card's perimeter, independent of the unchanged surrounding study container.
- Orange field: inset `12px` at xs and `16px` at sm and up on all four sides. Fill with `theme.palette.primary.main` (currently `#b9511b`). Keep the fill the same on hover. Use flat ink rather than a strong glossy gradient.
- Each orange-field corner has a concave quarter-circle cutout with radius `18px` at xs and `26px` at sm and up. The cream paper shows through. These corners curve **inward into the orange**, unlike an ordinary rounded rectangle. The outer cream silhouette still has ordinary convex rounded corners.
- Draw one fine white line following all four straight edges and concave corners of the orange field. Use a `1.5px` line. Derive its inset as `28.125%` of the orange field's outer margin, so it scales with the responsive `12px`/`16px` field inset. Keep it clearly visible on the primary orange while preserving a fine printed look.
- Concealed face: center the existing `<BrandMark colorMode="white" decorative />` horizontally and vertically. Use size `{ xs: 72, sm: 104 }` CSS pixels. No visible wordmark or reveal label. Preserve the accessible name `Reveal answer`.
- Revealed face: use exactly the same cream perimeter, orange field, and single outline. Replace the central logo with the existing bold centered answer and source. Keep the existing typography and Markdown renderer; keep sources smaller/subordinate as currently rendered. Text and links remain white. Reserve face padding `{ xs: '40px 32px', sm: '52px 48px' }` so content cannot collide with the corner ornament or outline. Do not shrink long answers to fit.
- Both faces use the same grid cell and stretch to the tallest face. Keep the hidden answer in layout; do not use `display: none` or absolute-position the content. Preserve bounded scrolling for wide math/tables, responsive images, and `minWidth: 0` on relevant grid/content items.

### Drawing the frame without distorting its corners

Create a small feature-local `FlashcardFaceDecoration.tsx` helper beside `FlashcardStudyCard.tsx`. Render one decorative SVG per face, absolutely filling the face behind its content, with `aria-hidden="true"`, `focusable="false"`, and `pointerEvents: 'none'`. Keep content in a positioned layer above it. Do not clip the content to the decorative path.

Use the untransformed face border-box width/height to build pixel-coordinate SVG paths. A single `ResizeObserver` on one face can supply dimensions to both decorations; use its border-box dimensions, not a transformed `getBoundingClientRect()` during the flip. Initialize from `offsetWidth/offsetHeight` in a layout effect, disconnect on cleanup, and update only when dimensions change. Observation is solely for artwork, never for assigning the card's height. Derive the responsive frame dimensions from the same breakpoint as the face styles. Avoid scaled fixed-viewBox artwork: that stretches circles and line spacing on tall answers.

For an orange field with bounds `(L,T,R,B)` and corner radius `r`, the clockwise path is:

```text
M L+r,T
H R-r
A r,r 0 0 0 R,T+r
V B-r
A r,r 0 0 0 R-r,B
H L+r
A r,r 0 0 0 L,B-r
V T+r
A r,r 0 0 0 L+r,T
Z
```

The arc sweep is **0**; using 1 makes conventional rounded corners and does not match the reference. Fill this path orange.

Draw the orange field path once using the concave quarter-circle geometry above. Draw one unfilled white outline path. Set the frame margin and corner radius as responsive CSS variables, define the line inset as `calc(var(--flashcard-frame-margin) * 0.28125)`, and define the line radius as `calc(var(--flashcard-frame-radius) + var(--flashcard-line-inset))`; use the same arithmetic for the numeric SVG path. Keep the circle centers at the original orange-field corners. For outline inset d and enlarged radius r, compute the edge intersection reach as sqrt(r*r - d*d). The top-left arc endpoints are (L+reach,T+d) and (L+d,T+reach); mirror these coordinates for the other corners. This keeps the outline equally spaced from the straight edges and concave arcs. Do not pass inset bounds to the ordinary frame builder: that moves the circle centers. Render a `1.5px` white stroke with opacity `0.95`. Never let the SVG participate in intrinsic sizing or intercept clicks.

## 2. Subtle physical thickness

Apply this shadow to **each face**, so it rotates with the card. Do not add offset background rectangles that look like a deck of several cards:

```css
box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.9),
  0 1px 0 rgba(118, 106, 99, 0.06),
  0 3px 8px rgba(57, 38, 22, 0.045),
  0 8px 16px rgba(57, 38, 22, 0.04);
```

The exterior layers stay soft along the sides and bottom, without a hard paper edge. Treat these taupe values as visual targets: prefer existing theme neutrals when their contrast against the cream card is clear, and adjust opacity before introducing new palette hex values. Keep scene/lift/rotator overflow visible. Avoid a shadow on the whole white study container. Avoid animating shadows initially: the lift and rotation provide the motion while this fixed shadow stays inexpensive.

## 3. Simple, smooth motion

Use three distinct wrappers to avoid competing transforms:

1. **Scene:** existing full-width answer-panel wrapper, `perspective: '1200px'`, `perspectiveOrigin: '50% 50%'`. Keep its layout and pointer area stationary.
2. **Lift wrapper:** new child, `transformStyle: 'preserve-3d'`, rest `translateY(0)`, transition `transform 180ms cubic-bezier(0.2, 0, 0, 1)`. Under `@media (hover: hover) and (pointer: fine)`, scene hover applies `translateY(-3px)`. No scale or tilt. Touch devices stay at rest. Focus alone shows the existing focus ring without lifting.
3. **Rotator:** preserve the existing overlaid grid and `key={card.id}`. Use `rotateY(0deg)` concealed and `rotateY(180deg)` revealed, `transformOrigin: '50% 50%'`, `transformStyle: 'preserve-3d'`, and `transition: 'transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1)'`.

Keep the concealed face at 0 degrees and the revealed face at 180 degrees. Both require `backfaceVisibility: 'hidden'` and `WebkitBackfaceVisibility: 'hidden'`. Keep the frame inside each face so it rotates with the paper. Disable the reveal ButtonBase ripple to retain the quiet printed appearance. Preserve its keyboard focus outline.

Do not add opacity, filters, clipping, or paint containment to the preserve-3d wrappers; those can flatten the two faces. No bounce, overshoot, automatic flipping, timers, delayed answer state, input lock, or animation queue. A second click reverses the CSS transition from its current position. Card navigation mounts the destination concealed immediately via the existing key, without a reverse flip of the previous answer.

Under `prefers-reduced-motion: reduce`, disable both transitions and all hover translation, and remove scene perspective. Keep the end-state face rotations and backface hiding so only the correct face is visible immediately. Confirm this visually rather than relying on transition declarations alone.

## 4. Interaction and accessibility constraints

- Preserve current focus transfer between the reveal button and revealed answer group. Keep inactive faces `aria-hidden`, inactive controls outside the tab order, and hidden answer content `inert`.
- Keep rich answer content in its existing group, never inside a button. Preserve link clicks and text selection without hiding the answer.
- Preserve Space reveal/advance, bounded Left/Right navigation, flag behavior, opened-card state, and explicit Finish. Do not rewrite `FlashcardStudyScreen.tsx` interaction handlers.
- Keep focus outlines outside the card and visible through the cream edge/shadow. Decoration must never appear in the accessibility tree.

## 5. Implementation order and verification

- [x] Inspect implementation, reference, brand API, design/product guidance, and test obligations.
- [x] Record explicit visual and motion values in this plan.
- [x] Implement the feature-local decorative frame and shared face styles; both faces use matching border geometry and allow intrinsic growth for long answers.
- [x] Add per-face thickness shadows, then the separate lift wrapper and updated flip timing.
- [x] Preserve behavioral tests in `FlashcardStudyScreen.test.tsx`; the 13-test flashcard screen suite passes and now checks Space focus suppression and Tab restoration.
- [x] Extend learner browser coverage in `e2e/learner-smoke.spec.ts`: verify both face bounds, continuous shared frame paths, reduced-motion styles, Space/Tab focus behavior, and no horizontal overflow at 320px and 390px. The updated flashcard flow passes; the full learner browser suite also passed before adding these focused assertions.
- [x] Inspect the rendered card in Chromium and the captured 390px mobile browser flow. The outline uses one inset concave path; its inset radius is calculated from the outer radius in CSS and its corner joins stay continuous. Safari/WebKit and 200% zoom were not separately tested.
- [x] Run `npm run lint`, `npm run format:check`, `npm run test:architecture`, `npm test`, `npm run validate:content`, and `npm run build` (includes TypeScript checking). `npm run test:e2e` passed all 11 learner tests; `npm run test:e2e:admin` passed all 3 admin tests; the updated flashcard browser flow passed separately after adding the frame/focus assertions. `VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build` passed.
- [x] Update the flashcard paragraph in `docs/design-system.md` with the paper rim, concave orange frame, thickness, and motion conventions. Update `docs/product.md` only if needed to clarify appearance; behavior remains unchanged.
- [x] Run `git diff --check` and record verification.

Verification run: all required unit, content, lint, architecture, format, build, learner browser, admin browser, and optional admin build checks passed. Focused flashcard UI coverage passes 13 tests; the full unit suite passes 407 tests across 69 files. Content validation emitted existing answer-review warnings but passed. Vite reported the existing large-chunk advisory. One sandboxed Playwright retry could not bind the fixture server; rerunning the focused browser test with local-server permission passed. Cross-browser Safari/WebKit and 200% zoom were not separately tested.

Acceptance: the concealed answer unmistakably resembles the attached cream-and-orange playing card; both faces feel like opposite sides of the same thin object; the lift is subtle, the flip takes 420ms without bounce, rich content fits, and existing study behavior remains intact.

### Visual refinement follow-up (2026-10-09)

Final corner correction: the cutouts are concave circles centered at the orange field's outer bounds, so their inset outline radius must increase by the inset. The earlier subtraction rule moved the white line toward the paper cutouts. The corrected path retains those original circle centers and computes intersections with the inset straight edges using `sqrt(radius² - inset²)`. A browser regression samples 201 points around the white path and measures their nearest distance to 4001 orange-edge points: the gap stays within 0.1px of its target at desktop and mobile sizes. Both card faces now use the brand-orange keyboard focus ring; Space suppression remains intact. The focused browser flow, 13 flashcard unit tests, TypeScript/build, lint, formatting, and diff whitespace checks pass after this correction.

Responded to browser feedback by softening the side/bottom shadow, reducing the frame to one clearly visible 1.5px white outline, and deriving the outline inset from the responsive orange-field margin. The outline radius is `calc(frame radius + derived inset)`, and its SVG path intersects the inset straight edges with the enlarged circles centered on the original orange corners. Browser coverage verifies one stroked path and matching desktop/mobile radii. The focused flashcard browser flow passes. Unit tests pass (407 tests) and lint, build, formatting, and `git diff --check` pass. A full learner e2e run passed 10 of 11 tests; the unrelated API-backed quiz test timed out waiting for its “Additional context for the question” heading, both in the full run and on isolated retry.

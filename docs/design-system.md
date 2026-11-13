# Design system

Visual and interaction conventions. Tokens live in `src/shared/theme.ts` (palette, typography, radius, shadow, focus) and `src/shared/ui/motion.ts`; read them for values. Lint rejects literal colors, font sizes and weights, radii, shadows and outline offsets outside the theme. Preserve canonical wording and formatting when changing presentation. Behavior is in [product](product.md).

## Foundations

- Warm, light palette, light theme only. The primary accent marks actions, the brand and the current item; the logo's own oranges stay inside the logo.
- Spacing uses multiples of 4px. Closer means more related:
  - 4px: a value and its caption
  - 8px: an icon and its label, items within a group
  - 12px: rows in a list, such as answer choices
  - 16px: between groups
  - 20 to 24px: card padding
  - 32px and up: between sections

  Exceptions: padding inside a control follows the control's height, and 1 to 2px nudges are allowed to align text with icons optically.
- Gold (`reward` token) is reserved for streak and perfect-score rewards and the flashcard momentum glow.
- Icon backgrounds are pale rounded squares, never circles. Topics without their own icon show their subject icon.
- Correctness combines written feedback, an icon and color. Green, red and warning tones (`feedback` tokens) are reserved for correctness, errors and warnings; primary action buttons use the primary color. Do not repeat answer summaries that the highlighted choices already show.
- Layouts must not overflow horizontally at 320, 390, 1048 or 1440px; enlarged text must stay usable.

## Meducation Icon Design Specification

Subject and topic artwork is one curated duotone family. Any allowed source, or an original drawing, is equally valid: pick whatever gives the best result.

### Brand rules

Every icon must hold these.

- 24-unit viewBox, normally with 2 units of clear space around the artwork.
- Foreground `currentColor` plus at most one tint layer at about 0.16 opacity.
- Rounded caps and joins. 1.5-unit strokes (the shared wrapper default; don't override it per icon) and comparable weight for filled contours.
- No gradients, shadows or extra colors.
- The badge background stays outside the SVG: primary orange at 7% opacity, 12px rounded square, centered glyph. Keep text labels beside decorative icons.

### Craft guidance

Judgment calls, not gates.

- One focal subject with meaningful negative space.
- Recognizable anatomical landmarks. A cardiac icon needs an anatomical heart. A specific structure such as a nephron needs its own drawing.
- Adjust optical size for narrow or irregular shapes instead of stretching them to identical bounds.
- Stay legible at 20 to 24px.

Review at 20 and 24px for topic rows, 46px in an 80px card badge, and 64px in an 88px header badge. Check contours, clipping, alignment, negative space and visual weight together.

Sourcing, the icon studio (`npm run icons`), review and integration follow the [icon skill](../.agents/skills/meducation-icons/SKILL.md). The app glyph definitions (`SubjectIcon`, `TopicIcon`) and `public/icon-licenses.txt` are the maintained copies.

## Typography

One family, Plus Jakarta Sans Variable. Pick a theme variant instead of setting size, weight, line height or tracking in `sx`. For emphasis inside text use the `fontWeight` token: `semibold` for labels, row names and buttons, `heading` for titles. Code and JSON fields use `monoFontFamily`.

| Variant | Use |
| --- | --- |
| `display`, `lede` | landing hero headline and lede |
| `h1` | screen titles |
| `h2` | landing section headings, results score |
| `h3` | subject header name |
| `h4` | dialog hero titles |
| `h5` | panel titles |
| `h6` | section headings, dialog titles |
| `subtitle1`, `subtitle2` | row names, labels |
| `body1`, `body2`, `caption`, `overline` | reading text, secondary text, captions, eyebrows |
| `stem` | question stems and flashcard fronts |
| `stat` | large numbers |

Colors follow the same rule: use palette tokens or `alpha()` of one. Artwork (logo, glyphs, drawn illustrations) is exempt.

## Shape and depth

Never pass a number to `borderRadius` in `sx`: it multiplies the theme radius.

| Radius token | Use |
| --- | --- |
| `inline` | inline code |
| `control` | buttons, toggles, inputs, nav items, list rows, answer choices, navigator tiles, bordered groups inside a card |
| `badge` | pale square behind an icon |
| `card` | cards, panels, dialogs, toasts, images, tables (theme default) |
| `feature` | Continue Studying card, large empty-state badge |
| `pill` | progress bars, segmented filters |

Circles (`'50%'`) are for dots, rings and round buttons only.

- Borders: `divider` for card edges, separators and rules; `feedback.choiceBorder` for interactive outlines such as unselected choices and tiles; `primary.main` for selected and current; feedback tones for correctness. Hairlines are 1px, emphasis rules (pearls, blockquotes) 3px on the left.
- Shadows: `shadow.card` for resting cards, `shadow.raised` for toasts and carousel arrows, `shadow.overlay` for bars over content, `shadow.currentRing` for the current item.
- Focus: spread `focusRing` into the focus-visible rule; use `focusRingInset` where the parent clips overflow.
- Deliberate exceptions: flashcard faces (`radius.flashcard`, with a layered thickness shadow and the gold momentum glow), celebration cards, the results score ring, and the landing page's rules-not-cards layout.

## Motion

Motion confirms an action, shows where something went, or marks an achievement. It never decorates idle UI or delays input.

- Durations: 120–180ms for fades and presses, 200–260ms for in-screen entries and slides, 350–550ms for moves, fills and staged reveal layers, up to about 1.2s for a one-shot data reveal. A whole sequence stays under about 3.2s, and each layer can be skipped by tap, Space or Enter.
- Easing: `easing.standard` for moves and screen entry, `easing.out` for things arriving or filling. Entries travel 6–14px; scale changes stay within 0.98–1.04.
- Sequence related content in reading order with 100–150ms staggers. Hide not-yet-revealed content with `visibility` so it is not focusable.
- One-shot flourishes play once per event, use the element's own color and fade to nothing.
- In-screen swaps: moving to a neighbor slides; replacing unrelated content crossfades; content added below the learner's action rises; updates that repeat while typing or holding a key stay instant. Use `ScreenTransition`, `SwapTransition` and `CatalogPageTransition` rather than new keyframes.
- Under reduced motion every animation is removed or shown in its final state, and sequences reveal everything at once.
- Landing page exceptions: sections after the hero fade and rise once on first entering the viewport, and Start studying on desktop zooms into the laptop screen in the hero photo (`screenZoom.ts`). Neither runs under reduced motion.
- Dialogs, menus and the drawer use MUI defaults. Search filtering, counters, the timer, error alerts and breakpoint changes are instant.

## Brand

`src/shared/brand.ts` owns name, accent and logo geometry. Use `AppBrand` or `BrandMark` for every wordmark or mark. Static uses expose one accessible name; decorative uses set `decorative`.

## Rich content

`MarkdownContent` is the one renderer for stems, rationales, card faces, choices, pearls and sources. Display math and tables scroll within their own area on narrow screens. Images need alt text, lazy loading, natural aspect ratio and bounded width. Never rewrite authored source for presentation.

## Learner screens

- Quiz, Browse, Review and flashcard study share the progress header and a right-aligned Previous/Next footer. The quiz or deck name is the screen's h1.
- Dashboard layout uses container queries on the content width, not viewport breakpoints, because the rail changes the available width.
- Collapsed rail items keep accessible names and tooltips. Decorative progress tracks have a visible percentage as their accessible equivalent.
- Empty states are transparent and borderless: one concise heading and the logo on a pale rounded square, with a single action only when it resolves the state.
- Loading keeps the header and layout visible and shows placeholders shaped like the real rows, `aria-busy` and outside the focus order.
- Failures use a recovery banner with Retry, a small in-region note, or a persistent toast with a keyboard-accessible close. Error copy is learner-safe.
- Dialogs have a scrollable body and a reachable footer, go full screen on small phones, and return focus to the entry action.
- A subject's Continue Studying photo comes from `public/assets/illustrations`. To add one, keep the 1672x941 source art outside Git, run `npm run hero:image -- <source.png> <name>-hero` and map the subject ID in `StudyCardIllustration.tsx`.

## Landing page

- A frame around unmodified product components; the samples behave like the real study screens, including keyboard shortcuts.
- Rules, not cards, group page content: 1px hairlines between sections and inside grids. 12-column grid at `md` and up, a single column below. Buttons are flat.
- Orange marks actions, the brand and the current tile.
- FAQ answers shared with the Help dialog come from `faqs` in `HelpDialog.tsx`.

## Admin

- Reuses the shared theme: a navigator beside a flexible editor on desktop, stacked on narrow screens.
- Omit subtitles that repeat headings. Keep empty and no-result messages, counts, validation and destination context.
- Lists scroll within a bounded area; pickers, actions and pagination stay outside the scroll. Parent actions live in labelled menus.
- Review dialogs focus the cancel action first and go full screen on narrow displays. Discard confirmations focus Keep editing.
- Forms keep IDs and relationships read-only, show explicit presence controls for optional fields, and keep invalid JSON editable. Labels stay fully visible above outlined fields.

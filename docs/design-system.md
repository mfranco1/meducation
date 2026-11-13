# Design system

Visual and interaction conventions. Use the MUI theme in `src/shared/theme.ts`, semantic lists, responsive spacing and visible native focus. Preserve canonical wording and formatting when changing presentation. Behavior is in [product](product.md).

## Foundations

- Warm, light palette (light theme only): primary accent `#b9511b` (the logo's own oranges stay inside the logo), off-white surfaces, soft borders (see [Shape and depth](#shape-and-depth)). Type follows [Typography](#typography). `info` (slate) and `warning` (amber) are set in the theme so alerts never show MUI's stock colors.
- Spacing uses multiples of 4px (theme spacing in steps of 0.5). Closer means more related:
  - 4px: a value and its caption
  - 8px: an icon and its label, items within a group
  - 12px: rows in a list, such as answer choices
  - 16px: between groups
  - 20 to 24px: card padding
  - 32px and up: between sections

  Exceptions: padding inside a control (button, chip, toggle) follows the control's height, and 1 to 2px nudges are allowed to align text with icons optically.
- Gold (`reward` token) is reserved for streak and perfect-score rewards and the flashcard momentum glow.
- Icon backgrounds are pale rounded squares (`radius.badge`, `radius.feature` for the large empty-state badge), never circles. Completion rings have rounded arc ends (theme `MuiCircularProgress` override). Subject and topic glyphs ([spec below](#meducation-icon-design-specification)) are defined in `SubjectIcon` and `TopicIcon`; topic icons are mapped by topic ID and shared by topics on the same concept. Topics without one (Practice Tests, new topics) show their subject icon. Topic rows show the icon at the name's line height; the topic header has no icon.
- Correctness combines written feedback, an icon and color. Semantic green, red and warning tones are reserved for correctness, errors and warnings; primary action buttons (Finish, Submit, Save) use the primary color.
- Feedback tones for correct, incorrect and unanswered or unavailable answers come from theme tokens (`feedback.correct`, `incorrect`, `review`); one pearl, chosen at random when a question has several, sits below the explanation with a left rule in the same tone's border color and a lightbulb icon in the status color. Collapsible sources come last. Immediate feedback is a compact tinted header over a neutral reading surface with generous line height and constrained measure. Do not repeat answer summaries that the highlighted choices already show.
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

Sourcing, the icon studio (`npm run icons`), review and integration follow the [icon skill](../.agents/skills/meducation-icons/SKILL.md). The app glyph definitions and `public/icon-licenses.txt` (the license of every adapted icon set) are the maintained copies.

## Typography

One family, DM Sans Variable with optical sizing, self-hosted from `@fontsource-variable/dm-sans` and imported by each entry point. The build preloads only the Latin upright file (`fontPreloadPlugin`) and fails if it cannot find it. Sizes, weights, line heights and tracking live in the theme's typography variants; pick a variant instead of setting them in `sx`. Lint rejects literal font weights, rem or px font sizes, letter spacing and font families outside the theme (numeric font sizes are for icons). For emphasis inside text, use the `fontWeight` token: `semibold` (600) for labels, row names and buttons, `heading` (650) for titles. Code and JSON fields use `monoFontFamily`.

| Variant | Use |
| --- | --- |
| `display` | landing hero headline |
| `h1` | screen titles |
| `h2` | landing section headings, closing call to action, results score |
| `h3` | subject header name |
| `h4` | dialog hero titles |
| `h5` | panel titles |
| `h6` | section headings, dialog titles (MUI default) |
| `subtitle1`, `subtitle2` | row names, labels |
| `body1`, `body2`, `caption`, `overline` | reading text, secondary text, captions, eyebrows |
| `lede` | landing lede |
| `stem` | question stems and flashcard fronts |
| `stat` | large numbers (tabular figures) |

Colors follow the same rule: lint rejects hex and rgba literals in text, background, fill and stroke outside the theme. Use palette tokens or `alpha()` of one. Artwork (logo, subject and topic glyphs, drawn illustrations) is exempt.

## Shape and depth

Radii, shadows, border colors and focus rings come from tokens in `src/shared/theme.ts`. Lint rejects raw radius values, raw colors in shadows, borders and outlines, and literal outline offsets. Never pass a number to `borderRadius` in `sx`: it multiplies the theme radius.

| Radius token | Value | Use |
| --- | --- | --- |
| `inline` | 6px | inline code |
| `control` | 10px | buttons, toggles, inputs, nav items, list rows, answer choices, navigator tiles, bordered groups inside a card |
| `badge` | 12px | pale square behind an icon |
| `card` | 14px | cards, panels, dialogs, toasts, images, tables, the landing header (theme default) |
| `feature` | 22px | Continue Studying card, large empty-state badge |
| `pill` | 999px | progress bars, segmented filters |

Circles (`'50%'`) are for dots, rings and round buttons only.

- Borders: `divider` (warm hairline) for card edges, separators and rules; `feedback.choiceBorder` for interactive outlines such as unselected choices and tiles; `primary.main` for selected and current; feedback tones for correctness. Hairlines are 1px, emphasis rules (pearls, blockquotes) 3px on the left, the selected topic row 2px.
- Shadows: `shadow.card` for resting cards (the `MuiCard` default), `shadow.raised` for toasts and carousel arrows, `shadow.overlay` for bars over content, `shadow.currentRing` for the current item.
- Focus: spread `focusRing` (2px primary, 2px offset) into the focus-visible rule; use `focusRingInset` where the parent clips overflow.
- Deliberate exceptions: flashcard faces (`radius.flashcard`, 22 to 28px, with a layered thickness shadow and the gold momentum glow), celebration cards, the results score ring and its glow, and the landing page's rules-not-cards layout. Effect shadows are built from palette colors.

## Motion

Motion confirms an action, shows where something went, or marks an achievement; it never decorates idle UI or delays input. Shared tokens and the reduced-motion hook live in `src/shared/ui/motion.ts`.

- Durations: 120–180ms for fades and presses, 200–260ms for in-screen entries and slides, 350–550ms for moves, fills and staged reveal layers, up to ~1.2s for a one-shot data reveal (score count-up). A whole sequence stays under ~3.2s, and each layer of it can be skipped by tap, Space or Enter.
- Easing: `easing.standard` for moves and screen entry, `easing.out` for things arriving or filling. Entries travel 6–14px; scale changes stay within 0.98–1.04 except a deliberate hero move and the Continue Studying peeks (85%, driven by scroll position).
- Sequence related content in reading order with 100–150ms staggers instead of animating everything at once; hide not-yet-revealed content with `visibility` so it is not focusable.
- One-shot flourishes (glint, pulse, echo, particles, flutter) play once per event, use the element's own color, and fade to nothing.
- The landing page is the exception: sections after the hero fade and rise once (14px, 600ms) on first entering the viewport, hidden with opacity only so they stay focusable; none under reduced motion. Start studying from `md` up, while most of the hero photo is in view, is the deliberate hero move: a 1.3s camera push into the laptop screen (`screenZoom.ts`). The screen squares up to fill the viewport and the live dashboard, mapped onto it, fades in and becomes the app. The app and the dashboard's content load in the background while the landing page is open; the push starts once the dashboard has painted (at most 1s after the click), and the landing page holds still while it plays. Any start ignores further presses; a pressed Start studying button shows a spinner in its own color if the wait passes 400ms. Phones, reduced motion and clicks with the photo out of view switch instantly.
- Under reduced motion every animation is removed or shown in its final state, and sequences reveal everything at once.
- In-screen swaps: moving to a neighbor (next or previous, opening a topic, returning to the list) slides 14px over 220ms; replacing unrelated content (a jump, another topic, search results) crossfades over 150ms; content added below the learner's action rises 8px over 200ms; updates that repeat while typing or holding a key stay instant. Use `ScreenTransition` for screens, `SwapTransition` for in-screen swaps and `CatalogPageTransition` for dashboard pagination; new screens reuse them rather than writing their own keyframes.

Notable one-offs: the progress bar's completion glint and quarter-mark pulses; Fast Feedback particle bursts; streak cards that grow across milestones (halo, edge, embers and milestone pips), the Perfect Test card, and score-ring finishes at 75%+, 90%+ and 100% (the gold ring's crackling sparks are the one idle animation); the flashcard momentum glow, which flips with the card and gains sparks (static under reduced motion); flag flutter; and the layered results reveal (score ring count-up, counts, stat cards, topic card, actions). Celebration cards start their effects together after a rendering opportunity and dismiss when the card animation finishes. Dialogs, menus and the drawer use MUI defaults. Search filtering, counters, the timer, error alerts and breakpoint changes are instant.

## Brand

`src/shared/brand.ts` owns name, accent and logo geometry; use `AppBrand` or `BrandMark` for every wordmark or mark (variants full, icon, wordmark; light and dark; full-color or monochrome). Logo colors: `#C45117`, `#EF9B6B`, `#262626` on light; `#EF9B6B`, `#FFC39E`, white on dark. The Vite branding plugin derives page titles, theme color and favicon from the same data. Static uses expose one accessible name; decorative uses set `decorative`.

## Rich content

One shared renderer (`MarkdownContent`) presents stems, rationales and card faces as sanitized Markdown, HTML, images and KaTeX, and choices, pearls and sources as Markdown and KaTeX without HTML or images. Inline math aligns with text; display math and tables scroll within their own area on narrow screens. Math fonts are local. Images need alt text, lazy loading, natural aspect ratio and bounded width. Never rewrite authored source for presentation.

## Learner shell and screens

- Left rail: 240px expanded, 64px collapsed, brand first, then destinations, with Progress and Help at the bottom below a partial separator; collapsed items keep accessible names and tooltips. An edge toggle shows an arrow on hover or focus (always on touch) and an orange hover line. Narrow screens reserve the rail and open a labelled overlay.
- Quiz, Browse, Review and flashcard study share the progress header and a right-aligned Previous/Next footer. The header's first row is the back button and the quiz or deck name (the screen's h1) in `subtitle2` secondary text, wrapping rather than truncating. Review and Browse render radio indicators as decoration, mark the submitted choice, highlight the correct one in green, and show explicit text when a key or explanation is unavailable.
- Flashcard answer panel: a centered front prompt above an orange panel that flips on a 420ms Y-axis rotation (reduced motion: immediate). Both faces share the intrinsic height of the answer, and the concealed side shows the icon-only logo.
- Dashboards share the frame, a 1 to 3 column subject grid of icon-and-title cards (title never truncated, optional description in secondary text), stat cards and the Continue Studying card. The Continue Studying card shows a subject's photographic hero from `public/assets/illustrations` when one exists (WebP at 600w and 1192w, masked into the card from the left), otherwise the drawn study stack. To add one, keep the 1672x941 source art outside Git, run `npm run hero:image -- <source.png> <name>-hero` and map the subject ID to that name in `StudyCardIllustration.tsx` (add a vertical focus override there if the wide crop cuts off the subject). Subject cards have a decorative progress track (quiz latest score, flashcard decks completed) with the visible percentage as its accessible equivalent; Continue Studying cards reuse it beside their completed count. In the Continue Studying carousel, peeking cards sit at 85% scale, tucked behind and tilted away from the selected card, with their outer edges faded into the page, and grow into place as the carousel scrolls (driven by scroll position, so reduced motion jumps without a tween). Only the centered card is interactive; peeking cards are inert and a click brings them to the center. Lists shorter than five are rendered as repeated copies so the loop never has to move a visible card. Horizontal wheel gestures over the carousel are cancelled so they cannot trigger the browser's swipe-back. Arrows sit over the peeks when the carousel is at least 600px wide and below it, with a position count, when narrower. The All and In progress subject filter is a small segmented pill whose tinted active blob slides between the two options (instant under reduced motion). Dashboard layout uses container queries on the content width, not viewport breakpoints, because the rail changes the available width.
- Subject screens (`SubjectBrowseLayout`, `TopicSetBrowser`): a header that blends into the page with a fading peach wash and translucent curved ribbons with softly highlighted edges, an 88px subject badge with a 64px glyph, name, optional description and progress ring (including its caption and loading placeholder, omitted below `sm`). Quizzes and Flashcards tabs sit between the header and Topics/content panels; tab changes swap only the panels, without animation. The progress area reserves its space while loading, empty or unavailable. On `lg` and up, a Topics card sits beside one content card and only their lists scroll; below `lg` they drill down. Topic rows are buttons with `aria-current`; the selected row has a pale orange fill and a 2px orange border; item rows have a status icon, chips, an in-progress bar and one primary action. Search sits under the Topics heading; results group matching items by topic, and no match offers a primary Clear button.
- Empty states are transparent and borderless: one concise heading and the regular logo on a pale rounded square, with a single action only when it resolves the state.
- Loading keeps the header visible and centers the logo, a 6px indeterminate bar and one status line; sections are `aria-busy` with accessible labels and placeholders outside the focus order. Catalog skeletons use the warm wave shimmer. Subject screens keep the Topics card, search field and section headings while loading and show placeholder rows shaped like the real rows. Failures use a recovery banner with Retry (below the tabs on subject screens), a small in-region note, or a persistent bottom-right toast. Error copy is learner-safe.
- Toasts use semantic severity, stack by viewport position above content and below modals, can be global or screen-scoped, and persistent errors have a keyboard-accessible close.
- The Progress dialog uses a plain title with a close button, a divided scrollable body and a reachable footer with text secondary actions. It has polite status and alert errors; dismissal is disabled during commit. Reset is a quiet section that opens a confirmation view. Focus returns to the entry action.
- The Help dialog shows contact instructions above expandable FAQs (one open at a time, the content-mistake answer links to Telegram), with a scrollable body and a Close action in the footer. It is full screen on small phones. Escape closes it and focus returns to Help.

## Landing page

- A frame around unmodified product components (`QuestionCard`, `FlashcardStudyCard`, `StudyNavigatorTile`, `StudyNavigationFooter`, `CelebrationOverlay`, `SubjectIcon`). Both samples share a header with a sample title, subject and navigator tiles. The streak celebration centers vertically in the viewport and horizontally in the sample quiz section. Numbered lists use circled numbers joined by a line; completed quiz steps show green checks.
- 12-column grid at `md` and up, a single column below. Rules, not cards, group page content: 1px choice-border hairlines between sections, internal rules in the subjects grid and between the privacy columns. Sections use 64px vertical padding below `md` and 128px above. Landing buttons are flat (`disableElevation`).
- The header is sticky. At the top of the page it is transparent; once the page scrolls it becomes an inset bar with a translucent, blurred paper background, a hairline border, 14px corners and a soft shadow. The logo scrolls back to the top without a hover or press effect. Centered Quizzes, Flashcards and Subjects links jump to their sections (`md` and up), with Start studying on the right. Anchored sections keep a scroll margin so the header does not cover them. On phones the header shows Start studying only while the hero and closing buttons are both out of view.
- Orange marks actions, the brand and the current case tile. Hint buttons use secondary text color.
- The sample section covering the viewport's vertical midpoint takes the same keys as its study screen (1-4 or A-D, Space, Enter, arrows), without a click. Shortcuts stop when that section leaves the midpoint; only one sample is active at a time. Native editing and focused widget keys remain available. Answering scrolls the feedback header into view on short screens.
- The hero shows the title, a one-line lede, Start studying with a quiet Try a question link, and a numbers strip. From `md` the whole study photo sits right of the copy at its own aspect ratio, fading into the background on every edge (most on the left, under the copy). Below `md` the copy is centered and the photo follows at full width with 14px corners, fading at its top. The photo is responsive WebP (640w, 960w, 1440w) from `public/assets/illustrations`, loads eagerly with high fetch priority and reserves its aspect ratio.
- Separate quiz and flashcard sections follow the hero. Beside each sample: a heading, one sentence and numbered steps. On narrow screens this copy comes before the sample. The steps beside the quiz turn green with one pulse as the visitor answers a sample question, reads the rationale (4 seconds) or moves on, and reaches a 3-in-a-row streak.
- Subjects: a centered head over a 2, 3 or 4 column grid of subjects (pale icon square and name), separated by internal 1px rules only. Progress: a centered head over three columns divided by hairlines, with a caption about clearing browser data. FAQ: flat accordions between hairlines, one open at a time as in the Help dialog; shared answers come from `faqs` in `HelpDialog.tsx`. The closing call to action follows a hairline.
- Flashcard steps complete independently when a full question is visible in the viewport or its answer is revealed, an answer is revealed and a different card is selected. Checks stay complete while visiting other sample cards.
- A question-mark button beside “Reveal the answer” shows the reveal hint on hover, focus or click.
- Sample headers reserve space for every item's subject and topic or deck. Navigator tiles share the text row when all details fit, otherwise they stay below it for every item.

## Admin

- Reuses the shared theme. Tabs for Quizzes and Flashcards with unsaved indicators; a 320px navigator beside a flexible editor on desktop, stacked on narrow screens. Each panel owns its width constants (`AdminNavigatorPanel`, `AdminEditorFrame`).
- Omit subtitles that repeat headings. Keep empty and no-result messages, counts, validation, stale-preview feedback and destination context.
- Lists show 25 records per page in canonical order with search and a bounded scroll area; pickers, actions and pagination stay outside the scroll. Parent actions live in labelled menus; the header groups Review & publish, More and Account.
- Review dialogs focus the cancel action first, go full-screen on narrow displays, and show server counts and paged affected IDs. Discard confirmations focus Keep editing. Canceled reviews report neutral feedback; failures report errors.
- Forms keep IDs and relationships read-only, show explicit presence controls for optional fields, and keep invalid JSON editable. Labels stay fully visible above outlined fields, including multiline.

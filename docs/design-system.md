# Design system

Visual and interaction conventions. Use the MUI theme in `src/shared/theme.ts`, semantic lists, responsive spacing and visible native focus. Preserve canonical wording and formatting when changing presentation. Behavior is in [product](product.md).

## Foundations

- Warm, light palette: primary accent `#b9511b`, off-white surfaces, soft borders, 14px card radius (10px for rows and nav buttons), strong type hierarchy: panel titles h5, section headings h6, row names bold.
- Icon backgrounds are pale rounded squares (10–12px radius, 20px for the large empty-state badge), never circles.
- Correctness combines written feedback, an icon and color. Semantic green, red and warning tones are reserved for correctness, errors and warnings; primary action buttons (Finish, Submit, Save) use the primary color.
- Feedback tones for correct, incorrect and answer-under-review come from theme tokens; pearls use `primary.light`. Immediate feedback is a compact tinted header over a neutral reading surface with generous line height and constrained measure. Do not repeat answer summaries that the highlighted choices already show.
- Layouts must not overflow horizontally at 320, 390, 1048 or 1440px; enlarged text must stay usable.

## Motion

Motion confirms an action, shows where something went, or marks an achievement; it never decorates idle UI or delays input. Shared tokens and the reduced-motion hook live in `src/shared/ui/motion.ts`.

- Durations: 120–180ms for fades and presses, 200–260ms for in-screen entries and slides, 350–550ms for moves, fills and staged reveal layers, up to ~1.2s for a one-shot data reveal (score count-up). A whole sequence stays under ~3.2s, and each layer of it can be skipped by tap, Space or Enter.
- Easing: `easing.standard` for moves and screen entry, `easing.out` for things arriving or filling. Entries travel 6–14px; scale changes stay within 0.98–1.04 except a deliberate hero move.
- Sequence related content in reading order with 100–150ms staggers instead of animating everything at once; hide not-yet-revealed content with `visibility` so it is not focusable.
- One-shot flourishes (glint, pulse, echo, particles, flutter) play once per event, use the element's own color, and fade to nothing.
- Under reduced motion every animation is removed or shown in its final state, and sequences reveal everything at once.

Current uses:

- Screen entry is a 170ms fade with a 6px settle; in-screen updates are immediate except dashboard pagination, which slides, and the study card: Next/Previous slide it 14px over 220ms (outgoing card exits the other way) and jumps crossfade over 150ms, while the header, timer and navigator stay still.
- The study progress bar fills with a 450ms ease-out; in quizzes and flashcard study a solid fill counts answered questions or revealed cards over a lighter band for the current position, a glint crosses the leading edge when an item completes, and the edge pulses at 25, 50, 75 and 100%.
- Toasts fade in 180ms and out 140ms. Quiz choices depress to 0.985 scale when pressed or chosen and their radio dot fills with a slight overshoot; a correct Fast Feedback choice bursts particles above and below it. Flagging an item flutters its flag icon and the flag on its navigator tile.
- Results reveal (~2.6–3.2s): the score ring counts up alone, large and centered, with a glowing rounded leading edge (600–1200ms by score); on settling the glow fades, the ring pulses once with an outward echo and moves up to its place; then the counts, the three stat cards (120ms stagger), the topic card and the actions rise in, one layer at a time. A tap, Space or Enter advances one layer (the first finishes the count-up). A perfect-score celebration follows the last layer.

## Brand

`src/shared/brand.ts` owns name, accent and logo geometry; use `AppBrand` or `BrandMark` for every wordmark or mark (variants full, icon, wordmark; light and dark; full-color or monochrome). Logo colors: `#C45117`, `#EF9B6B`, `#262626` on light; `#EF9B6B`, `#FFC39E`, white on dark. The Vite branding plugin derives page titles, theme color and favicon from the same data. Static uses expose one accessible name; decorative uses set `decorative`.

## Rich content

One shared renderer (`MarkdownContent`) presents stems, rationales, card faces and sources as sanitized Markdown, HTML, images and KaTeX. Inline math aligns with text; display math and tables scroll within their own area on narrow screens. Math fonts are local. Images need alt text, lazy loading, natural aspect ratio and bounded width. Never rewrite authored source for presentation.

## Learner shell and screens

- Left rail: 240px expanded, 64px collapsed, brand first, then destinations, with Progress Backup at the bottom below a partial separator; collapsed items keep accessible names and tooltips. An edge toggle shows an arrow on hover or focus (always on touch) and an orange hover line. Narrow screens reserve the rail and open a labelled overlay.
- Quiz, Browse, Review and flashcard study share the progress header and a right-aligned Previous/Next footer. Review and Browse render radio indicators as decoration, mark the submitted choice, highlight the correct one in green, and show explicit text when a key or explanation is unavailable.
- Flashcard answer panel: a centered front prompt above an orange panel that flips on a 420ms Y-axis rotation (reduced motion: immediate). Both faces share the intrinsic height of the answer, and the concealed side shows the icon-only logo.
- Dashboards share the frame, subject grid (1, 2 or 3 columns), icon-and-title cards (1.25rem title, fixed rounded-square icon badge, never truncated), stat cards and Continue Studying card. Quiz cards have a decorative score track with the visible score as its accessible equivalent; flashcard cards have none.
- Subject screens (`SubjectBrowseLayout`, `TopicSetBrowser`) have a header with the subject badge, name and progress ring. On `lg` and up, a Topics card sits beside one content card (topic summary, separator, Quizzes or Decks list); both are height-bounded and only their lists scroll. Below `lg` they drill down: the Topics list, then the selected topic's content with an All topics back button. Topic rows are buttons with `aria-current`, bold wrapped names, a thin progress bar and a chevron; item rows have a status icon (green check when completed), a green completion chip, score chips, a progress bar of answered questions or reviewed cards when in progress, and one primary action.
- Empty states are transparent and borderless: one concise heading and the regular logo on a pale rounded square, with a single action only when it resolves the state.
- Loading keeps the header visible and centers the logo, a 6px indeterminate bar and one status line; sections are `aria-busy` with accessible labels and placeholders outside the focus order. Catalog skeletons use the warm wave shimmer. Failures use a full-width recovery banner below the header (with Retry), a small in-region note, or a persistent bottom-right toast. Error copy is learner-safe.
- Toasts use semantic severity, stack by viewport position above content and below modals, can be global or screen-scoped, and persistent errors have a keyboard-accessible close.
- Progress Backup is a labelled dialog with a rounded-square icon header, two outlined cards (save, restore) that stack on narrow screens, a file-versus-browser comparison table and one adaptive warning alert; it has a scrollable body, reachable footer, polite status and alert errors; Escape and Cancel work before commit and are disabled during commit. Focus returns to the entry action.

## Admin

- Reuses the shared theme. Tabs for Quizzes and Flashcards with unsaved indicators; a 320px navigator beside a flexible editor on desktop, stacked on narrow screens. Each panel owns its width constants (`AdminNavigatorPanel`, `AdminEditorFrame`, `AdminStatusPanel`).
- Omit subtitles that repeat headings. Keep empty and no-result messages, counts, validation, stale-preview feedback and destination context.
- Lists show 25 records per page in canonical order with search and a bounded scroll area; pickers, actions and pagination stay outside the scroll. Parent actions live in labelled menus; the header groups Review & publish, More and Account.
- Review dialogs focus the cancel action first, go full-screen on narrow displays, and show server counts and paged affected IDs. Discard confirmations focus Keep editing. Canceled reviews report neutral feedback; failures report errors.
- Forms keep IDs and relationships read-only, show explicit presence controls for optional fields, and keep invalid JSON editable. Labels stay fully visible above outlined fields, including multiline.

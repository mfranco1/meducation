# Design system

Visual and interaction conventions. Use the MUI theme in `src/shared/theme.ts`, semantic lists, responsive spacing and visible native focus. Preserve canonical wording and formatting when changing presentation. Behavior is in [product](product.md).

## Foundations

- Warm, light palette: primary accent `#b9511b`, off-white surfaces, soft borders, 14px card radius (10px for rows and nav buttons), strong type hierarchy: panel titles h5, section headings h6, row names bold.
- Gold (`reward` token) is reserved for streak and perfect-score rewards and the flashcard momentum glow.
- Icon backgrounds are pale rounded squares (10–12px radius, 20px for the large empty-state badge), never circles. Completion rings have rounded arc ends (theme `MuiCircularProgress` override). Subject icons are duotone glyphs on a 24-unit grid (solid or stroked line art with a soft tint), mostly adapted from Health Icons (MIT), all defined in `SubjectIcon`. The licenses of every adapted icon set ship in `public/icon-licenses.txt`; add any new source set there. Topic icons use the same style and are defined in `TopicIcon`, mapped by topic ID and shared by topics on the same concept. Topics without one (Practice Tests, new topics) show their subject icon. Topic rows show the icon at the name's line height; the topic header has no icon.
- Correctness combines written feedback, an icon and color. Semantic green, red and warning tones are reserved for correctness, errors and warnings; primary action buttons (Finish, Submit, Save) use the primary color.
- Feedback tones for correct, incorrect and unanswered or unavailable answers come from theme tokens (`feedback.correct`, `incorrect`, `review`); one pearl, chosen at random when a question has several, sits below the explanation with a left rule in the same tone's border color and a lightbulb icon in the status color. Immediate feedback is a compact tinted header over a neutral reading surface with generous line height and constrained measure. Do not repeat answer summaries that the highlighted choices already show.
- Layouts must not overflow horizontally at 320, 390, 1048 or 1440px; enlarged text must stay usable.

## Motion

Motion confirms an action, shows where something went, or marks an achievement; it never decorates idle UI or delays input. Shared tokens and the reduced-motion hook live in `src/shared/ui/motion.ts`.

- Durations: 120–180ms for fades and presses, 200–260ms for in-screen entries and slides, 350–550ms for moves, fills and staged reveal layers, up to ~1.2s for a one-shot data reveal (score count-up). A whole sequence stays under ~3.2s, and each layer of it can be skipped by tap, Space or Enter.
- Easing: `easing.standard` for moves and screen entry, `easing.out` for things arriving or filling. Entries travel 6–14px; scale changes stay within 0.98–1.04 except a deliberate hero move.
- Sequence related content in reading order with 100–150ms staggers instead of animating everything at once; hide not-yet-revealed content with `visibility` so it is not focusable.
- One-shot flourishes (glint, pulse, echo, particles, flutter) play once per event, use the element's own color, and fade to nothing.
- Under reduced motion every animation is removed or shown in its final state, and sequences reveal everything at once.
- In-screen swaps: moving to a neighbour (next or previous, opening a topic, returning to the list) slides 14px over 220ms; replacing unrelated content (a jump, another topic, search results) crossfades over 150ms; content added below the learner's action rises 8px over 200ms; updates that repeat while typing or holding a key stay instant. Use `ScreenTransition` for screens, `SwapTransition` for in-screen swaps and `CatalogPageTransition` for dashboard pagination; new screens reuse them rather than writing their own keyframes.

Notable one-offs: the study progress bar fills over a solid answered band and a lighter position band, with a glint on completion and pulses at quarter marks; correct Fast Feedback choices burst particles; streak celebrations show a flame and a gold burst that grow across the 3, 5, 10, 25 and 50 milestones (the 50 card's title sizzles; a perfect Fast Feedback quiz shows a top-tier Perfect Test card with a laurel trophy, a return shine and a sizzling gold border and title; any perfect score turns the settled results ring gold with two soft shockwaves, a strong glow and a large gold burst, and sparks keep crackling around the ring while the results are shown, the one idle animation); the flashcard momentum glow builds around the card with each distinct card revealed in a sitting, flips with it, and later starts to flicker with sparks crackling outside the card edge (static glow only under reduced motion); flags flutter; the results screen reveals the score ring count-up first, then counts, stat cards, topic card and actions one layer at a time. Dialogs, menus and the drawer use MUI defaults. Search filtering, counters, the timer, error alerts and breakpoint changes are instant.

## Brand

`src/shared/brand.ts` owns name, accent and logo geometry; use `AppBrand` or `BrandMark` for every wordmark or mark (variants full, icon, wordmark; light and dark; full-color or monochrome). Logo colors: `#C45117`, `#EF9B6B`, `#262626` on light; `#EF9B6B`, `#FFC39E`, white on dark. The Vite branding plugin derives page titles, theme color and favicon from the same data. Static uses expose one accessible name; decorative uses set `decorative`.

## Rich content

One shared renderer (`MarkdownContent`) presents stems, rationales, card faces and sources as sanitized Markdown, HTML, images and KaTeX. Inline math aligns with text; display math and tables scroll within their own area on narrow screens. Math fonts are local. Images need alt text, lazy loading, natural aspect ratio and bounded width. Never rewrite authored source for presentation.

## Learner shell and screens

- Left rail: 240px expanded, 64px collapsed, brand first, then destinations, with Progress at the bottom below a partial separator; collapsed items keep accessible names and tooltips. An edge toggle shows an arrow on hover or focus (always on touch) and an orange hover line. Narrow screens reserve the rail and open a labelled overlay.
- Quiz, Browse, Review and flashcard study share the progress header and a right-aligned Previous/Next footer. Review and Browse render radio indicators as decoration, mark the submitted choice, highlight the correct one in green, and show explicit text when a key or explanation is unavailable.
- Flashcard answer panel: a centered front prompt above an orange panel that flips on a 420ms Y-axis rotation (reduced motion: immediate). Both faces share the intrinsic height of the answer, and the concealed side shows the icon-only logo.
- Dashboards share the frame, a 1 to 3 column subject grid of icon-and-title cards (title never truncated, optional description in secondary text), stat cards and the Continue Studying card. The Continue Studying card shows a subject's photographic hero from `public/assets/illustrations` when one exists (WebP at 600w and 1192w, masked into the card from the left), otherwise the drawn study stack. To add one, keep the 1672x941 source art outside Git, run `npm run hero:image -- <source.png> <name>-hero` and map the subject ID to that name in `StudyCardIllustration.tsx` (add a vertical focus override there if the wide crop cuts off the subject). Subject cards have a decorative progress track (quiz latest score, flashcard decks completed) with the visible percentage as its accessible equivalent.
- Subject screens (`SubjectBrowseLayout`, `TopicSetBrowser`): a header with subject badge, name, optional description and progress ring. On `lg` and up, a Topics card sits beside one content card and only their lists scroll; below `lg` they drill down, with browser Back returning to the Topics list. Topic rows are buttons with `aria-current`; item rows have a status icon, chips, an in-progress bar and one primary action. Search sits under the Topics heading; results group matching items by topic, and no match offers a primary Clear button.
- Empty states are transparent and borderless: one concise heading and the regular logo on a pale rounded square, with a single action only when it resolves the state.
- Loading keeps the header visible and centers the logo, a 6px indeterminate bar and one status line; sections are `aria-busy` with accessible labels and placeholders outside the focus order. Catalog skeletons use the warm wave shimmer. Subject screens keep the Topics card, search field and section headings while loading and show placeholder rows shaped like the real rows. Failures use a full-width recovery banner below the header (with Retry), a small in-region note, or a persistent bottom-right toast. Error copy is learner-safe.
- Dialog titles are weight 700 (theme default).
- Toasts use semantic severity, stack by viewport position above content and below modals, can be global or screen-scoped, and persistent errors have a keyboard-accessible close.
- The Progress dialog has a scrollable body and reachable footer, polite status and alert errors; Escape and Cancel work before commit and are disabled during it. Reset is a quiet section that opens a confirmation view. Focus returns to the entry action.

## Landing page

- A frame around unmodified product components (`QuestionCard`, `FlashcardStudyCard`, `StudyNavigatorTile`, `StudyNavigationFooter`, `CelebrationOverlay`, `SubjectIcon`). Its type scale lives in `src/app/landing/typography.ts` and uses the theme's sans and heading weights. Both samples share the study header (position, subject, navigator tiles), and the streak celebration centers on the question card. Numbered lists use circled numbers joined by a line.
- 12-column grid at `md` and up, a single column below. Rules, not cards, group page content: a 2px dark rule under the masthead and above the closing call to action, 1px choice-border hairlines between sections.
- Orange marks only the **Start studying** buttons, the brand and the current case tile. On phones a sticky Start studying bar appears once the hero button scrolls away.
- Each sample takes the same keys as its study screen (1-4 or A-D, Space, Enter, arrows) once the visitor clicks or focuses inside it, until they click or focus elsewhere or scroll it away. Answering scrolls the feedback header into view on short screens.
- The hero steps turn green with one pulse as the visitor answers a sample question, reads the rationale (4 seconds) or moves on, and reaches a 3-in-a-row streak.

## Admin

- Reuses the shared theme. Tabs for Quizzes and Flashcards with unsaved indicators; a 320px navigator beside a flexible editor on desktop, stacked on narrow screens. Each panel owns its width constants (`AdminNavigatorPanel`, `AdminEditorFrame`).
- Omit subtitles that repeat headings. Keep empty and no-result messages, counts, validation, stale-preview feedback and destination context.
- Lists show 25 records per page in canonical order with search and a bounded scroll area; pickers, actions and pagination stay outside the scroll. Parent actions live in labelled menus; the header groups Review & publish, More and Account.
- Review dialogs focus the cancel action first, go full-screen on narrow displays, and show server counts and paged affected IDs. Discard confirmations focus Keep editing. Canceled reviews report neutral feedback; failures report errors.
- Forms keep IDs and relationships read-only, show explicit presence controls for optional fields, and keep invalid JSON editable. Labels stay fully visible above outlined fields, including multiline.

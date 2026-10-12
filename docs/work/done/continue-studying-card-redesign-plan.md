# Continue Studying illustrated cards

Status: implementation complete; required checks passed.

## Request and scope

Redesign Continue Studying on **both Quizzes and Flashcards dashboards** to follow the supplied reference: a wide pale cream card, left-aligned label/title/activity/Continue action, and a cropped orange-and-cream stack of illustrated study cards on the right. Keep user-controlled carousel navigation, with exactly one complete card visible at every available width. Never show a second card or a peek at rest.

**Scope update (2026-10-12):** the original request allowed one or two cards depending on available width. The user subsequently changed this to a strict maximum of one card at a time. This update supersedes every earlier threshold/half-width rule below; retain the carousel for navigation, but size each Continue Studying slide to 100% at all widths.

Reference: `/Users/noodle.zip/Desktop/Screenshot 2026-10-12 at 10.42.34.png` (752 × 282 image; the card occupies approximately 728 × 256). The vector below is a prescribed recreation of its composition, not extracted original artwork or a claim of pixel-identical tracing. Use it as written; do not replace it with emoji, stock artwork, a screenshot, image generation, or a different illustration.

This is a presentation change. Continue opens the selected subject using the existing callback; it does not select or immediately resume an arbitrary quiz/deck. Preserve active-subject filtering, recency ordering, canonical-order tie breaking, saved attempts/checkpoints, recovery behavior, dashboard statistics, and All Subjects cards. No changes to content banks, IDs, domain rules, persistence, dependencies, or backend infrastructure.

## Existing implementation to edit

- `src/shared/ui/catalog/StudyItemCarousel.tsx`: already uses Embla, keyed items, native side-arrow buttons, reduced-motion support, and overflow-driven controls. Its viewport-based slide widths currently become three columns at `md`; replace that sizing for the new opt-in layout.
- `src/features/quizzes/components/ActiveSubjectCarousel.tsx`: replace its `QuizSubjectCard` renderer with the new card, retaining the selector input and callback.
- `src/features/quizzes/screens/DashboardScreen.tsx`: retain `activeSubjectStats(subjectStats)` and existing loading/recovery branches; replace the 122px active-subject placeholder with the new skeleton.
- `src/features/flashcards/screens/FlashcardsDashboardScreen.tsx`: replace only the carousel's inline `SubjectCard`/Chip renderer. Leave its All Subjects renderer and dashboard state alone; remove Chip/Stack imports only if no longer used.
- `src/shared/ui/catalog/icons/SubjectIcon.tsx`: reuse its stable-ID registry, including `s6` for Obstetrics & Gynecology and its unknown-ID fallback. Do not introduce a second registry or title-based subject matching.
- Read `docs/architecture.md`, `docs/design-system.md`, `docs/product.md`, `docs/testing.md`, and `docs/testing-regressions.md` before implementation. Their current statement that Continue Studying retains compact cards will need updating.

## Component contracts and ownership

Add three presentation-only components under `src/shared/ui/catalog/`; shared code must not import feature modules, app navigation, storage, selectors, or banks.

```tsx
type ContinueStudyCardProps = {
  title: string;
  activityLabel: string;
  onContinue: () => void;
  actionLabel?: string; // default: 'Continue'
  accessibleLabel: string; // dashboard adapters pass `Continue studying ${title}`
  eyebrow?: string; // default: 'Continue Studying'
  illustration: React.ReactNode; // decorative, noninteractive slot
  sx?: SxProps<Theme>; // outer surface customization only
};

type StudyCardIllustrationProps = {
  subjectId: string;
};

type ContinueStudyCardSkeletonProps = {
  sx?: SxProps<Theme>;
};
```

`ContinueStudyCard.tsx` owns layout, typography, focus, and action styling. It does not know what a quiz/deck/subject record is. `StudyCardIllustration.tsx` owns the exact SVG below and composes the existing SubjectIcon. `ContinueStudyCardSkeleton.tsx` reuses the same root dimensions/container rules and the existing LoadingSkeleton; extract shared sizing styles into a small colocated `continueStudyCardStyles.ts` only where needed to avoid skeleton drift. Do not build a general card framework or a collection of one-line wrappers.

Keep the existing generic carousel API and add `layout?: 'standard' | 'continueStudy'` (default `standard`) and `headingVisibility?: 'visible' | 'srOnly'` (default `visible`). Both dashboard call sites opt into `continueStudy` and `srOnly`. Keep `title="Continue Studying"` for the labelled section. Render its heading as `h2`; use MUI's `visuallyHidden` utility in srOnly mode. The repeated text inside each card is a paragraph, not an additional section heading. No visible heading above the reference-style cards.

The root card is a `Box` surface with a full-size MUI `CardActionArea component="button" type="button"`. Its accessible name is `accessibleLabel`; attach the activity paragraph through a unique `aria-describedby` ID. The orange Continue treatment is a **noninteractive span** inside that button, with a decorative arrow. Do not nest Button, anchor, or another action inside CardActionArea. This retains whole-card click/tap and one keyboard stop per card. Use ordinary text/spans for content inside the button; the outer region provides the semantic heading. Keep Enter/Space activation native.

Merge `sx` correctly for object/function/array inputs: `[baseStyles, ...(Array.isArray(sx) ? sx : [sx])]`, omitting undefined as needed. Do not spread an `SxProps` value as an object. Defaults remain local; do not change the global MUI Card or Button theme to style this component.

## Exact layout and appearance

Use these defaults, with dimensions in CSS pixels. They are deliberate responsive decisions, not values to re-infer from the image.

- Surface: `position: relative`, `isolation: isolate`, `overflow: hidden`, `min-width: 0`, `height: 100%`, `border-radius: 22px`, `border: 1px solid #f4ebe5`, background `linear-gradient(110deg, #fcf7f3 0%, #fff8f2 58%, #ffe5d3 100%)`. No lift transform or heavy surface shadow.
- Give the surface `container-type: inline-size; container-name: continue-card`. Descendant action/content/art respond to this card's width, not the browser viewport. Container queries use the content box; because the surface has a 1px border on both sides, use query thresholds 298px, 478px, and 638px to implement outer card thresholds 300px, 480px, and 640px. Use `box-sizing: border-box` throughout. Use `min-height`, never a fixed height or fixed aspect ratio that could clip wrapped copy.
- At card width >=640px: action min-height 256px; padding 34px 38px; copy width 55%; art width 48%, height 100%, pinned top/right, `z-index: 0`; copy `position: relative; z-index: 1`. Eyebrow 18px/1.4 weight 600; title 24px/1.3 weight 750; activity 16px/1.5. Gaps: eyebrow→title 8px, title→activity 6px, activity→CTA 22px.
- At card width 480–639px: action min-height 244px; padding 26px; copy width 58%; art width 44%; eyebrow 16px; title 22px; activity 15px; activity→CTA 20px. Allow title wrapping at word boundaries, with `overflow-wrap: anywhere` as a fallback. Never ellipsize or clamp titles.
- At card width <480px: action min-height 232px; padding 22px; copy width 100%; title 21px, eyebrow/activity 15px; art becomes a bottom-right decorative accent, width 145px, height 150px, opacity .22. Give the copy column a 14px rounded, translucent cream fade: `background: linear-gradient(90deg, rgba(252,247,243,.84) 0%, rgba(252,247,243,.72) 72%, rgba(252,247,243,.3) 100%)`. This keeps the illustration from reducing text contrast without leaving a hard rectangular panel. Keep the full title and CTA; do not squeeze copy into a narrow left column. Below 300px card width use padding 16px. At zoom/large fonts, height grows naturally.
- All text uses the existing theme font. Title/eyebrow use `text.primary`; activity uses `#62564f`. Use real DOM text, not SVG text. The right-hand page in the illustration uses decorative lines, not fake medical copy.
- CTA span: inline-flex, align-items center, gap 10px, min-height 48px, padding `0 22px`, width fit-content, radius 14px, background `linear-gradient(180deg, #c45117 0%, #b9511b 100%)`, color white, font 16px/1.25 weight 700. Use `ArrowForwardRounded` at 20px, aria-hidden/focusable=false. This keeps the established action accent and readable white text while echoing the reference.
- Action hover: slightly deepen the CTA only (`filter: brightness(.96)`); retain a stable layout. Focus-visible: inset 3px `primary.main` outline around the whole action with -3px offset, radius inherited. Make outline visible above art and within the clipped surface. No transform animation. Transitions, if used for the CTA, are disabled by reduced motion.
- The art wrapper is `position: absolute; pointer-events: none; aria-hidden=true`, contains no tab stops, and clips at the card boundary. SVG occupies its wrapper at width/height 100% with `preserveAspectRatio="xMidYMid slice"`.

## Exact SVG implementation

Create `src/shared/ui/catalog/StudyCardIllustration.tsx` with this implementation. JSX attribute casing and local fragment references are intentional. `useId` prevents gradients/shadows on one card from binding to a different instance. Do not use shared literal IDs, random values, or a module-global counter. The registry icon is drawn in its existing 24×24 coordinates on the front card, so each subject gets the appropriate symbol. The book geometry, gradients, page lines, and transforms remain identical across subjects and both dashboards.

```tsx
import { useId } from 'react';
import { SubjectIcon } from './icons/SubjectIcon';

export function StudyCardIllustration({ subjectId }: { subjectId: string }) {
  const id = useId().replace(/:/g, '');
  const paper = `${id}-paper`;
  const orange = `${id}-orange`;
  const edge = `${id}-edge`;
  const glow = `${id}-glow`;
  const shadow = `${id}-shadow`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 360 270"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      style={{ clipPath: 'inset(0)', contain: 'paint', display: 'block', overflow: 'clip' }}
    >
      <defs>
        <linearGradient id={paper} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffdfa" />
          <stop offset="0.62" stopColor="#fff6ed" />
          <stop offset="1" stopColor="#ffe8d5" />
        </linearGradient>
        <linearGradient id={orange} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#f58b4d" />
          <stop offset="0.52" stopColor="#e3652d" />
          <stop offset="1" stopColor="#bc431a" />
        </linearGradient>
        <linearGradient id={edge} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffdfbf" />
          <stop offset="1" stopColor="#efa375" />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="#f6aa74" stopOpacity=".52" />
          <stop offset="1" stopColor="#f6aa74" stopOpacity="0" />
        </radialGradient>
        <filter id={shadow} x="-40%" y="-35%" width="190%" height="200%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="13" stdDeviation="10" floodColor="#ad4b23" floodOpacity=".22" />
        </filter>
      </defs>

      <ellipse cx="174" cy="199" rx="180" ry="110" fill={`url(#${glow})`} />
      <path d="M159 -18 H378 V291 H137 L115 160 Z" fill={`url(#${orange})`} />
      <path d="M176 36 Q180 27 189 31" fill="none" stroke="#ffb270" strokeWidth="3" opacity=".65" />

      {/* Cropped rear study sheet. */}
      <g transform="translate(185 23) rotate(19)">
        <rect x="0" y="8" width="158" height="228" rx="15" fill="#ebc5ac" />
        <rect width="158" height="228" rx="15" fill={`url(#${paper})`} />
        <rect x="22" y="35" width="83" height="7" rx="3.5" fill="#82604c" opacity=".48" />
        <rect x="22" y="59" width="102" height="9" rx="3" fill="#dfcfc2" />
        <rect x="22" y="78" width="77" height="6" rx="3" fill="#e7d8cc" />
        <rect x="22" y="133" width="113" height="8" rx="3" fill="#dfcfc2" />
        <rect x="22" y="154" width="103" height="8" rx="3" fill="#e7d8cc" />
        <rect x="22" y="175" width="116" height="8" rx="3" fill="#dfcfc2" />
      </g>

      {/* The front stack tilts counterclockwise as one rigid object. */}
      <g transform="translate(18 62) rotate(-24 106 102)">
        <rect x="-8" y="32" width="208" height="213" rx="19" fill={`url(#${orange})`} />
        <rect x="-4" y="23" width="208" height="213" rx="18" fill="#ffc994" />
        <rect x="0" y="13" width="208" height="213" rx="17" fill={`url(#${edge})`} />
        <path d="M12 216 H194" stroke="#fff1de" strokeWidth="3" strokeLinecap="round" opacity=".7" />
        <rect width="208" height="213" rx="17" fill={`url(#${paper})`} filter={`url(#${shadow})`} />
        <rect x="1" y="1" width="206" height="211" rx="16" fill="none" stroke="#fffaf4" />
        <g transform="translate(58 56) scale(3.8)" color="#dd6b38">
          <SubjectIcon subjectId={subjectId} x={0} y={0} width={24} height={24} sx={{ width: 24, height: 24, color: 'inherit' }} />
        </g>
      </g>
    </svg>
  );
}
```

For the reference's Obstetrics & Gynecology card, the nested SubjectIcon resolves to the existing UterusIcon. Its exact current geometry is recorded below for reference only; **do not duplicate these paths into the new component**:

```svg
<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 7c1-2 2.4-2.5 4-2.5S15 5 16 7c.7 2-.2 4-1.6 5.5-.9 1-1.4 2.1-1.4 3.5v4h-2v-4c0-1.4-.5-2.5-1.4-3.5C8.2 11 7.3 9 8 7Z" />
  <path d="M8 7C6 4 2 4.5 2 7.5 2 9 3 10 4.5 10M16 7c2-3 6-2.5 6 .5 0 1.5-1 2.5-2.5 2.5" />
  <ellipse cx="5" cy="11" rx="1.3" ry="2" />
  <ellipse cx="19" cy="11" rx="1.3" ry="2" />
</g>
```

## Carousel sizing and interaction: implement literally

For the `continueStudy` layout, use a flex track with `gap: 16px`, `align-items: stretch`, and no slide padding or negative margins. Each slide is always `flex: 0 0 100%; min-width: 0; box-sizing: border-box`, independent of viewport and carousel-container width. Do not add a wider-screen breakpoint that reduces slide width. This guarantees exactly one complete card at rest, with the next card clipped beyond the Embla viewport and reached by carousel navigation. Do not retain the old `md` thirds rule or old per-slide right padding in this layout. Existing standard layout retains its defaults.

Keep overflow hidden on the Embla viewport and the existing vertical focus clearance. A 100% slide basis prevents a next-card teaser at rest. Intermediate partial cards during dragging/animation are expected. Never insert cloned DOM slides or stretch fewer active subjects into fake duplicates.

Keep Embla (`align: 'start'`, `slidesToScroll: 1`, `loop: true`, duration 25), drag/swipe, previous/next labels, and reduced-motion jump arguments. It can disable looping when there are too few slides for its loop geometry. Ensure manual controls still wrap in that case: Next calls `scrollNext(jump)` when `canScrollNext()`, otherwise `scrollTo(0, jump)`; Previous calls `scrollPrev(jump)` when `canScrollPrev()`, otherwise `scrollTo(scrollSnapList().length - 1, jump)`. Do not recreate Embla's drag physics or force duplicate cards to obtain a loop.

Show controls only when more than one reachable snap exists (`scrollSnapList().length > 1`), recalculated on `reInit` and item changes. Listen/unsubscribe symmetrically. Embla's resize handling must cover drawer expansion and viewport resizing; verify this in a real browser. Retain the selected subject by stable item key across resizing/reinitialization when it still exists; otherwise clamp to the nearest surviving snap. Do not reset on every parent render.

For this layout, place 40px arrow controls inside the viewport edges (`left: 4px`, `right: 4px`) at vertical center with the existing paper background and a restrained shadow. They are siblings of the viewport, not descendants of any card button. Avoid the current -24px offsets on narrow screens; reserve 28px extra inline space inside the card content when controls are present so arrows cannot obscure text or CTA. Expose this as a carousel CSS custom property `--study-carousel-control-gutter: 28px` (0px when controls are absent), consumed by the card action's inline padding using `calc(base padding + var(--study-carousel-control-gutter, 0px))`.

Use Embla's default focus-to-slide behavior: tabbing to an offscreen card must bring it fully into view. Do not put `aria-hidden` on focusable slides or use visibility rules that strand keyboard focus. Arrow activation retains focus on the arrow; no autoplay, timer, new global keyboard listener, position badge, or live announcements on every drag.

## Feature wiring

Quiz renderer (inside the existing ActiveSubjectCarousel):

```tsx
<ContinueStudyCard
  title={stat.subject.name}
  activityLabel={`${stat.activeQuizCount} ${stat.activeQuizCount === 1 ? 'quiz' : 'quizzes'} in progress`}
  accessibleLabel={`Continue studying ${stat.subject.name}`}
  onContinue={() => onSelectSubject(stat.subject)}
  illustration={<StudyCardIllustration subjectId={stat.subject.id} />}
/>
```

Flashcard renderer (inside the existing dashboard carousel):

```tsx
<ContinueStudyCard
  title={item.subject.name}
  activityLabel={`${item.activeDeckCount} ${item.activeDeckCount === 1 ? 'deck' : 'decks'} in progress`}
  accessibleLabel={`Continue studying ${item.subject.name}`}
  onContinue={() => onSelectSubject(item.subject)}
  illustration={<StudyCardIllustration subjectId={item.subject.id} />}
/>
```

Both carousel instances pass `layout="continueStudy" headingVisibility="srOnly"`. Keep their existing `id`, `itemKey`, and ordered input arrays. Do not show latest scores/trends, score tracks, completion counts, or chips in these cards. Those remain in their existing All Subjects locations.

The quiz active placeholder remains under the exact existing activeAttempts/loading/retry/error condition. Show one full-width new-card skeleton because active subject count is not yet known. Keep its existing status label and busy semantics. Do not invent unknown activity counts or add a Continue button while loading. Flashcards retain their current behavior of hiding Continue Studying while loading or failed. Empty active arrays render no region/heading/controls.

## Ordered execution checklist

- [x] Rechecked the working tree and repository instructions; preserved existing unrelated files and changes.
- [x] Implemented the shared ContinueStudyCard, exact prescribed SVG illustration, fallback icon composition, and matching noninteractive loading skeleton.
- [x] Added opt-in single-card carousel sizing at every width, hidden accessible heading, responsive resize/selection handling, and controls while retaining standard carousel behavior.
- [x] Wired both dashboards, preserved their selection/session boundaries, and updated the quiz loading placeholder.
- [x] Added component, adapter, carousel, dashboard, and browser coverage; updated learner smoke selectors for the labelled region.
- [x] Reviewed rendered wide/mobile card captures during browser iteration; adjusted artwork clipping and mobile copy backing for fit and contrast. The browser suite attaches wide, 976px single-card, 390px, and 320px captures for both dashboards as test artifacts.
- [x] Updated `docs/design-system.md`, `docs/product.md`, and `docs/testing-regressions.md` for the card, Continue behavior, and single-card carousel rule. All Subjects retains its existing responsive grid.
- [x] Ran required checks; results are recorded below. Moved this completed tracker to `docs/work/done/`.

## Tests and acceptance criteria

### Component and integration tests

Add colocated `ContinueStudyCard.test.tsx`, `StudyCardIllustration.test.tsx`, and `StudyItemCarousel.test.tsx`. Use small synthetic fixtures; no production bank imports or authored-record counts.

- Card: full title/activity render; exactly one actionable button; accessible name/description; click, Enter, and Space each invoke callback once; custom eyebrow/action label and illustration slot work; no nested buttons, no SVG accessible name, no image network request. Verify sx customization through a small consumer example without asserting serialized Emotion class names.
- Illustration: multiple instances have distinct IDs and each `url(#...)` resolves within its own SVG; known and unknown subject IDs use the existing registry/fallback; all SVGs remain decorative. Do not snapshot all SVG coordinates or repeat registry tests already owned by SubjectIcon.
- Carousel: empty items render nothing; single item has no controls; overflow controls call the intended Embla APIs and wrap fallback; reduced motion passes `true` for jump; reInit updates overflow; subscriptions are cleaned up. Use a local Embla API mock for these behaviors. Do not claim jsdom proves layout/overflow or infer visual visibility from `toBeVisible()` on clipped slides.
- Update `ActiveSubjectCarousel.test.tsx` to assert `Continue studying Biochemistry` and singular/plural quiz counts, selected subject payload, empty region absence, and keyboard behavior. Fix its current case-sensitive empty-region assertion to the actual `Continue Studying` name.
- Update `DashboardScreen.test.tsx` and `FlashcardsDashboardScreen.test.tsx`: correct quiz/deck wording, selector order, full subject callback, no quiz scores in flashcard carousel, and no score metadata in either Continue card. Scope assertions to the region so duplicate subject titles in All Subjects do not mask regressions. Preserve existing recovery/empty/filter/stat tests and verify the redesigned quiz placeholder is noninteractive.
- Keep existing selector/persistence tests; do not add redundant domain tests for unchanged logic.

### Browser layout, navigation, and visual checks

Add `e2e/continue-studying.spec.ts`; follow the fixture/request setup patterns in `e2e/subject-cards.spec.ts` and `e2e/learner-smoke.spec.ts`. Seed through existing fixture/progress helpers or normal save flows; do not invent production localStorage keys. Use at least four synthetic active subjects plus inactive subjects, including a long title and an unknown icon ID. If extending shared fixture files is necessary, assess dependent fixture expectations and run their required gates.

- On both dashboards verify exactly one complete card remains at rest for narrow and wide available widths, including multiple active subjects. Assert the next slide is outside the viewport, not visible as a partial peek.
- Exercise representative narrow and wide viewport widths and an injected wide carousel width; verify the sole visible slide remains 100% width and the following slide stays clipped beyond the carousel viewport. The single-card rule must not depend on the navigation rail or a breakpoint.
- Test next/previous through both ends, swipe on mobile, keyboard Tab onto offscreen cards, Enter/Space navigation, and resizing after moving to a later slide. Include multiple items where Embla may fall back from loop. Arrow buttons must remain usable with no page overflow and no covered copy/CTA.
- Confirm clicking Continue or any part of its card opens the correct subject, and the existing Resume action still restores the saved quiz/deck position. Keep All Subjects Open buttons unchanged. Update existing learner-smoke heading checks to assert the labelled region is visible and the hidden h2 exists; do not require that h2 to be visually visible. Avoid `.last()` to distinguish a Continue card from an All Subjects card; scope explicitly.
- Test long subject titles, 200% text/zoom equivalent, focus outline visibility, and reduced motion. Ensure document scrollWidth is <= innerWidth + 1 and content/button bounds stay within the card. No truncated title, text/art overlap that impairs reading, or clipped CTA.
- Capture and attach screenshots for both dashboards: one wide card, one at 976px carousel width, 390px, and 320px. Include s6 for the reference art comparison using a synthetic subject fixture. Inspect cream surface, orange layered paper, counterclockwise front card, right-edge crop, correct subject symbol, and reference-style left hierarchy. Keep screenshots as test artifacts; do not bless unexplained changes or add brittle whole-page snapshots.
- Confirm All Subjects still uses its existing one/two/three columns, filters, pagination, icons, score metadata, and saved activity behavior.

### Verification commands for the implementer

During iteration, run the new/changed colocated tests by exact file path, then the focused browser spec. Before handoff, the documented shared-UI gates are:

```sh
npm run lint
npm run format:check
npm run test:architecture
npm test
npm run validate:content
npm run build
npm run test:e2e
npm run build:admin
npm run test:e2e:admin
git diff --check
```

`npm run build` includes typechecking. `npm run test:e2e` builds a fresh learner bundle first; finish learner browser tests before the admin build because they share dist. The admin build must include its enabled editor and the ordinary learner build must omit admin.html. No backend code is expected to change; if shared fixture/contracts do change, apply the additional backend gates in `docs/testing.md`. `npm run verify:full` is the existing complete sequential alternative when its environment is available.

## Implementation verification record

- Inspected the two dashboard implementations, shared carousel/card/icon/layout/theme code, current carousel tests, browser-test locations, architecture boundaries, and repository testing/design/product guidance.
- `npm run lint` — passed; architecture check reports 237 modules and 1,032 imports with no forbidden edges or runtime cycles.
- `npm run format:check` — passed.
- `npm run test:architecture` — passed, 10/10 tests.
- `npm test` — passed, 79 files and 464 tests. An earlier concurrent run hit timeouts under resource contention; isolated reruns and the final serial run passed.
- `npm run validate:content` — passed; 11,687 questions, 1,712 flashcards, and 13 subjects validated. Existing reviewed-answer warnings remain unchanged.
- `npm run build` — passed, including TypeScript typecheck. Vite reports the existing large-chunk warning.
- `npm run test:e2e` — passed before the follow-up single-card change, 16/16 learner browser tests. The latest follow-up verification is recorded below.
- `npm run build:admin` — passed.
- `npm run test:e2e:admin` — passed, 3/3 tests.
- `git diff --check` — passed.
- `e2e/continue-studying.spec.ts` captures and attaches screenshots for wide, one card at 976px, 390px, and 320px viewports on both dashboards during its Playwright run. The browser fixture uses a synthetic subject icon ID; the existing `s6` registry and unknown-ID fallback are covered by the illustration component tests, not a separate browser fixture. No screenshot assets are checked in.

## Follow-up: one-card limit and implementation audit

The requested follow-up removes the former 976px half-width carousel rule. Continue Studying slides now stay at 100% of the viewport at every width, while the generic carousel's standard layout keeps its existing responsive behavior. Text sizing responds to the card container width. The two-dashboard browser test constrains the carousel to 320, 975, 976, and 1280px, checks the first slide remains full-width, and verifies a following slide begins outside the viewport.

The audit found an edge case in carousel selection preservation when the active item list becomes empty: a stale selected key could lead to a negative target index. The carousel now skips restoring a selection for an empty list and clears its stored key; the carousel unit test covers that transition. The review also replaced ambiguous `.last()` dashboard selectors with explicit All Subjects scoping and removed a duplicate assertion.

Follow-up verification:

- Full unit suite — passed, 79 files and 464 tests; after the final empty-list guard, all six focused card/carousel/dashboard test files passed, 36 tests total.
- Full learner browser suite — passed, 16/16 after the single-card behavior change; the focused Continue Studying browser suite passed 2/2 again after the final carousel guard.
- Learner build/typecheck — passed after the final guard.
- Admin build and admin browser suite — passed, 3/3; the admin build was repeated after the final guard.
- Lint, Prettier, architecture tests (10/10), content validation, and `git diff HEAD --check` — passed.
- Visually inspected the generated 976px single-card and narrow-screen captures for both dashboards. The card remains full-width at the wide constraint; title wrapping and the CTA fit at 320px. The s6 icon is still verified by the illustration component test rather than a separate browser screenshot.
- The pre-existing Vite large-chunk warning remains; this task does not change bundle organization.

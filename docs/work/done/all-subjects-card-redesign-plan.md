# All Subjects card redesign — staged implementation plan

Status: implementation and verification complete.

## Request and scope

Restyle the **All Subjects** grids on the quiz and flashcard dashboards using the supplied screenshot as visual reference. The user's written instructions take precedence over the screenshot: place the icon and subject title beside one another, and place the in-progress indicator below the quiz score bar. Preserve the existing increased/decreased score triangles and unchanged-score line.

Reference: `Screenshot 2026-10-12 at 10.35.37.png`, supplied in chat, originally at `/Users/noodle.zip/Desktop/Screenshot 2026-10-12 at 10.35.37.png`. This plan describes the required design so implementation does not depend on that local file being available.

Implementation was authorized for the complete plan. Stages and verification are recorded below.

### Explicit design decisions

- Soft warm-white cards, subtle borders/shadows, pale orange icon badges, dark bold titles, slim rounded orange score bars, and restrained orange status text.
- Header is always one horizontal icon/title row. At narrow widths, a long title may wrap **inside its text column**, with its first line aligned to the icon; never move the entire title beneath the icon, truncate the name, or reduce it to unreadable text. This resolves “same line” without breaking mobile layouts.
- Quiz grid card order: header → flexible space → latest-score text and existing trend → score bar → in-progress text. Missing score: empty decorative track, no numeric score or trend. Missing active attempts: no status text.
- Flashcards have no score/accuracy metric in their current data contract. Use the same card/header/badge styling and bottom status placement, but **omit the score label and score bar**. Do not manufacture a score, use quiz scores, or convert active decks into a completion percentage. This follows the current design-system distinction between quiz and flashcard cards.
- All subject cards, including Combined, use the same grid geometry. Do not copy the screenshot's smaller Combined tile, add a “View all” control, change catalog order, or copy its example numbers.
- Keep the Continue Studying carousels' existing presentation and behavior. New grid styling must be opt-in because both carousels currently reuse these card components.
- No canonical content, IDs, domain types, selectors, storage contracts, API calls, dependencies, or backend changes are required.

## Repository facts and boundaries

Read `AGENTS.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/product.md`, `docs/testing.md`, and `docs/testing-regressions.md` before implementation. Check for new directory-specific instructions.

- `src/shared/ui/catalog/SubjectCard.tsx`: current clickable card shell; currently title plus children, no icon.
- `src/shared/ui/catalog/SubjectGrid.tsx`: shared CSS grid, currently `repeat(auto-fit,minmax(230px,1fr))` with 16px gaps.
- `src/shared/ui/catalog/StudyDashboardLayout.tsx`: common dashboard frame and All Subjects heading.
- `src/features/quizzes/components/QuizSubjectCard.tsx`: currently active chip before latest score; used by both the grid and `ActiveSubjectCarousel.tsx`.
- `src/features/quizzes/components/ScoreTrendIndicator.tsx`: already implements accessible green up triangle, red down triangle, and unchanged line. Reuse it unchanged.
- `src/features/quizzes/screens/DashboardScreen.tsx`: quiz grid plus loading/retry/failure placeholders.
- `src/features/flashcards/screens/FlashcardsDashboardScreen.tsx`: currently duplicates card/status markup between grid and carousel.
- `src/features/flashcards/selectors/flashcards.ts`: `FlashcardDashboardSubject` has `subject`, `deckCount`, `activeDeckCount`, and optional `latestActiveAt`; no score.
- `src/shared/theme.ts`: warm colors, 14px card radius, subtle card border/shadow already exist. Reuse them; do not globally restyle every card.
- Installed `@mui/icons-material` supplies the nine exact modules listed below. Use direct module imports; no new package or icon CDN.

Shared components may depend on shared/domain/content/analytics modules but **must not import features**. Features must not import sibling features. In particular, pass score/trend content into the shared card through children; never move a quiz import into shared UI. Keep the icon registry in presentation code rather than adding icon metadata to the canonical banks.

## Stage 0 — establish baseline

- [ ] Inspect git status and preserve unrelated work.
- [ ] Re-read the files listed above and their existing tests. Confirm their contracts still match this plan before editing.
- [ ] Record baseline results for `npm run lint`, `npm test`, and `npm run build`. Record existing failures separately; do not claim success while affected gates fail.
- [ ] Capture both existing dashboards at desktop and 390px mobile width. Include a subject with an active attempt/deck so duplicate grid/carousel cards are visible.

Gate: verified call sites, baseline evidence recorded, and no content changes.

## Stage 1 — reusable subject icon set

Create `src/shared/ui/catalog/icons/` (currently absent). Keep direct exports in individual files; do not add a broad barrel.

### Stable presentation mapping

Create `SubjectIcon.tsx` in that directory. Export `SubjectIcon({ subjectId, ...svgProps }: SvgIconProps & { subjectId: string })`. Internally map IDs to components with `Record<string, ComponentType<SvgIconProps>>`; unknown IDs use `GridViewOutlined`. Do not match by subject name, array index, substring, or translated label. Icons are decorative here: enforce `aria-hidden="true"`, `focusable="false"`, and no `titleAccess` after spreading caller props. The card button already has its full accessible name.

Use these exact mappings (canonical IDs inspected on 2026-10-12):

- `s1`, Anatomy & Histology: custom `BoneIcon`.
- `s2`, Biochemistry: `@mui/icons-material/DeviceHubOutlined` (molecular connections).
- `s3`, Legal Medicine: `@mui/icons-material/BalanceOutlined`.
- `s4`, Internal Medicine: `@mui/icons-material/FavoriteBorderOutlined`.
- `s5`, Microbiology & Parasitology: `@mui/icons-material/CoronavirusOutlined`.
- `s6`, Obstetrics & Gynecology: custom `UterusIcon`.
- `s7`, Pathology: `@mui/icons-material/BiotechOutlined` (microscope).
- `s8`, Pediatrics: `@mui/icons-material/ChildCareOutlined`.
- `s9`, Pharmacology: custom `CapsuleIcon` (closer to reference than the installed medication bottle).
- `s10`, Physiology: `@mui/icons-material/MonitorHeartOutlined`.
- `s11`, Preventive Medicine: `@mui/icons-material/HealthAndSafetyOutlined`.
- `s12`, Surgery: custom `ScalpelIcon`.
- `s13`, Combined, and unknown IDs: `@mui/icons-material/GridViewOutlined`.

### Exact custom SVG instructions

Use MUI `SvgIcon`, `viewBox="0 0 24 24"`, and the JSX below. Each function belongs in its own correspondingly named `.tsx` file and imports `SvgIcon` and `type SvgIconProps` from `@mui/material`. Paths are original simple line artwork, not medical diagrams. Keep geometry separate from the circular badge. Do not add raster assets, emoji, external URLs, fonts, scripts, filters, hardcoded orange, IDs, or nested `<svg>` roots.

Set stroke attributes on the inner `<g>` so MUI's default SVG fill cannot turn the line art into a silhouette. Preserve `currentColor`, rounded caps/joins, and the 1.7-unit stroke. Do not apply these stroke overrides to the library icons; their filled paths already draw outlined forms correctly.

```tsx
import { SvgIcon, type SvgIconProps } from '@mui/material';

export function BoneIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.4 16.9 16.9 8.4c1.1.5 2.3.3 3-.5 1-1 .9-2.5-.1-3.4-.6-.5-1.3-.7-2-.6.1-.7-.1-1.4-.6-2-.9-1-2.4-1.1-3.4-.1-.8.7-1 1.9-.5 3L4.8 13.3c-1.1-.5-2.3-.3-3 .5-1 1-.9 2.5.1 3.4.6.5 1.3.7 2 .6-.1.7.1 1.4.6 2 .9 1 2.4 1.1 3.4.1.8-.7 1-1.9.5-3Z"
          transform="translate(1 1) scale(.92)" />
      </g>
    </SvgIcon>
  );
}
```

```tsx
import { SvgIcon, type SvgIconProps } from '@mui/material';

export function UterusIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 7c1-2 2.4-2.5 4-2.5S15 5 16 7c.7 2-.2 4-1.6 5.5-.9 1-1.4 2.1-1.4 3.5v4h-2v-4c0-1.4-.5-2.5-1.4-3.5C8.2 11 7.3 9 8 7Z" />
        <path d="M8 7C6 4 2 4.5 2 7.5 2 9 3 10 4.5 10M16 7c2-3 6-2.5 6 .5 0 1.5-1 2.5-2.5 2.5" />
        <ellipse cx="5" cy="11" rx="1.3" ry="2" />
        <ellipse cx="19" cy="11" rx="1.3" ry="2" />
      </g>
    </SvgIcon>
  );
}
```

```tsx
import { SvgIcon, type SvgIconProps } from '@mui/material';

export function CapsuleIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.2 3.8a4.25 4.25 0 0 1 6 6L9.8 20.2a4.25 4.25 0 0 1-6-6Z" />
        <path d="m8.8 9.2 6 6" />
      </g>
    </SvgIcon>
  );
}
```

```tsx
import { SvgIcon, type SvgIconProps } from '@mui/material';

export function ScalpelIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 12 9-9a1.8 1.8 0 0 1 2.5 2.5l-9 9Z" />
        <path d="m9 12-5 5-1 4 4-1 4.5-5.5M3 21h18M13 9l2 2" />
      </g>
    </SvgIcon>
  );
}
```

Create `SubjectIconBadge.tsx` beside these icons: accepts `subjectId: string`; renders a non-shrinking 40×40px circular MUI Box, `bgcolor: alpha(theme.palette.primary.main, 0.07)`, `color: 'primary.main'`, and a centered 24px `SubjectIcon`. Keep the badge decorative. Do not use semantic success/error colors for subject identities.

Gate: all 13 mappings and the fallback render; inspect artwork at 24px and enlarged 96px on the actual warm background. Check bone lobes, capsule seam, uterus symmetry, and scalpel outline for clipping or excessive density. These exact paths are the starting implementation; any visual correction must be deliberate, documented, and re-inspected rather than replaced by an unrelated symbol.

## Stage 2 — shared grid-card composition

Modify existing primitives rather than introducing a second card/button implementation.

1. Extend `SubjectCard` with `appearance?: 'standard' | 'dashboardGrid'`, default `'standard'`. Keep the standard branch equivalent to today's carousel layout. Keep subject and callback types unchanged.
2. For `dashboardGrid`, use the current Card → CardActionArea → CardContent structure. Preserve `aria-label={`Open ${subject.name}`}`, a single native button, callback receiving the same subject object, and existing hover/reduced-motion behavior. No nested buttons or links.
3. Grid card content: `p: 2.5` and override `&:last-child` to the same padding, `boxSizing: 'border-box'`, `width: '100%'`, `minWidth: 0`, `minHeight: 172`, `height: '100%'`, column flex. The 172px value is a minimum, never a fixed height; content must grow with wrapping and text zoom. Use theme paper/background, existing 14px radius, border, and shadow. Keep global theme unchanged.
4. Header: row flex, gap 1.25 (10px), align-items flex-start, no row wrapping. Badge first; `Typography component="h3"` with 16px size, weight 700, line-height 1.35, `minWidth: 0`, `overflowWrap: 'anywhere'`, `pt: 1` (first line visually aligns to the badge). Use the full `subject.name`.
5. Wrap children in a bottom content Box with `mt: 'auto'`, `pt: 2`, `minWidth: 0`. The wrapper should only exist when children are present. This keeps scored and unscored cards balanced without fixed clipping heights.
6. Keep a clear keyboard outline on the grid CardActionArea's `.Mui-focusVisible` state: 2px primary-colored outline inset 2px. Do not rely solely on a faint border color to indicate focus.
7. Harden `SubjectGrid` to `repeat(auto-fit, minmax(min(100%, 260px), 1fr))`, preserve 16px gaps, and set `minWidth: 0`. This permits a single narrow card without forcing 230px overflow, and generally yields three columns at the existing desktop container width. Do not hardcode exactly three columns at every viewport.
8. Add shared `SubjectActivityLabel.tsx` under `catalog`: `{ count: number }`, returns null at zero, otherwise `Typography component="span" variant="caption"` with `display: 'block'`, `mt: 1`, `color: 'primary.dark'`, `fontWeight: 700`, text `${count} in progress`. This is static status text, not a live region or clickable chip. Use it only for the new grids.
9. Add shared `SubjectCardSkeleton.tsx` under `catalog` using existing `LoadingSkeleton`: same 172px minimum and 20px padding, a circular 40px placeholder beside title lines, plus a lower short line/track placeholder. Decorative, non-focusable, and reduced-motion behavior inherited from LoadingSkeleton. This is shared because both dashboards need it.

Gate: one accessible card action, readable long names at 320/390px and enlarged text, shared imports follow architecture, and standard/carousel styling remains intact.

## Stage 3 — quiz score bar and grid integration

Create `src/features/quizzes/components/SubjectScoreSummary.tsx`; keep it feature-owned because flashcards have no scores. Props: `{ score?: number; trend?: ScoreTrend }`, importing `ScoreTrend` as a type from `src/analytics/analytics.ts` through the appropriate relative path.

1. For finite numbers in [0,100], render the existing exact text `Latest Score ${score}%` in a row with `ScoreTrendIndicator` when trend exists. Use 14px text, weight 700, `primary.dark`; retain indicator labels and colors unchanged. Do not round differently from the existing selector. Crucially, `0` is a real score, not missing data.
2. Under that row, with 8px gap, render a 6px-high, full-width pill-shaped track in `alpha(theme.palette.text.primary, 0.06)`, and primary-colored fill with width `${score}%`. Use overflow hidden and fully rounded ends. Prefer simple Box elements: this is a static score visualization, not task progress. Mark the whole visual track `aria-hidden="true"`; the visible score text is the accessible equivalent. Do not add a misleading `role="progressbar"` or duplicate announcements.
3. With undefined, nonfinite, or out-of-range input, omit score text and trend and render only the empty decorative track. Do not turn unavailable values into a displayed 0%. Keep validation local to this presentation component; do not alter score aggregation. Do not animate the fill.
4. Add the same `appearance` prop to `QuizSubjectCard`, default `'standard'`. Leave its standard branch's chip/score markup unchanged. For `dashboardGrid`, compose `SubjectCard appearance="dashboardGrid"` with `SubjectScoreSummary` followed by `SubjectActivityLabel`. A count is shown only when positive, and always after the track in DOM and visual order.
5. Pass `appearance="dashboardGrid"` **only** in `DashboardScreen`'s All Subjects `.map()`. `ActiveSubjectCarousel` retains the default. Do not duplicate trend logic or migrate the carousel to the new design.
6. Replace grid placeholders inside `SubjectPlaceholders` with `SubjectCardSkeleton`. Adapt the existing dashed failure variant to the same footprint without doubling padding or changing its Retry behavior. Do not change the separate active-carousel skeleton.

Gate: score and fill agree for 0, 67, and 100%; unknown score is visually empty; all three trend states survive; `1 in progress` and plural counts appear below the track; carousel remains unchanged.

## Stage 4 — flashcard grid integration

1. In `FlashcardsDashboardScreen`'s All Subjects `.map()`, pass `appearance="dashboardGrid"` to `SubjectCard` and replace its Box/Chip status with `SubjectActivityLabel count={item.activeDeckCount}`.
2. Leave carousel markup on standard SubjectCard and its current Chip. Chip/Stack imports therefore still have consumers; remove only imports proven unused.
3. Replace this dashboard's grid loading placeholders with the same `SubjectCardSkeleton`. Preserve error banners, activeSubjects filtering, callbacks, counts, and progress-error handling.
4. Do not add a FlashcardSubjectCard wrapper solely to forward two props; the existing shared card plus activity primitive is sufficient composition.

Gate: identical shared icon/header/card geometry on both dashboards, correct deck count, no quiz score/trend/percentage on flashcard cards, and loading/failure/empty states still work.

## Stage 5 — meaningful regression tests and visual review

Use small hand-authored fixtures; do not import the production bank to assert its record count or names. Tests may include explicit IDs such as `s1` to exercise this presentation registry. Unknown fixture IDs must work via fallback.

### Colocated component tests

- `icons/SubjectIcon.test.tsx`: table-driven mapping tests for the 13 IDs and unknown ID; verify correct chosen component using scoped MUI icon test IDs or explicit semantic `data-subject-icon` keys. Avoid full SVG/path snapshots. Verify decorative semantics and forwarded sizing/color props. Assert custom components have one SVG root with viewBox 0 0 24 24 and no focus target; visual tests, not DOM tests, judge artwork quality.
- `SubjectCard.test.tsx`: dashboard header includes full long title and badge; button name remains `Open …`; activation returns the exact subject once; children render; default appearance retains existing structure. Avoid brittle Emotion class-name/style snapshots. Browser tests below cover physical alignment and keyboard action.
- `SubjectActivityLabel.test.tsx`: zero omitted, one and several counts use exact text.
- `SubjectScoreSummary.test.tsx`: undefined/NaN/Infinity/out-of-range omit score/trend; 0/67/100 produce correct text and fill; up/down/unchanged accessible labels are preserved; absent trend omitted; track is decorative, never a loading progressbar. Checking fill width here is meaningful because the displayed score must match its visualization.
- `QuizSubjectCard.test.tsx`: render with latest score and active count together; assert DOM order score → track → count via `compareDocumentPosition` (a stable `data-testid="subject-score-track"` is acceptable on the decorative track). Also cover active-without-score, score-without-active, and standard appearance.
- Update both existing dashboard tests to scope grid assertions separately from carousel assertions; do not merely assert there are two identical labels anywhere. Add stable `data-testid="all-subjects-grid"` to SubjectGrid's root (all its current uses are All Subjects content/placeholders), or use a named section if one is added with a correctly associated heading. Preserve existing heading hierarchy/labels.
- Quiz dashboard: up/down/unchanged and no-prior-score tests must continue passing. Update the misleading test description “beside the quiz count” to “below the score bar in All Subjects.” Verify subject selection payload and source order.
- Flashcard dashboard: use one active and one inactive subject; verify status only on active, no score text/bar/trend, selection still works, and loading/error placeholders never expose fake zero progress. Retain existing dashboard-stat tests.

### Browser tests

Add `e2e/subject-cards.spec.ts` using the existing Playwright config and fixture API. Use actual fixture study/finish/save flows where possible to obtain saved scores and counts; if additional subject names/IDs are needed for visual cases, intercept the subject catalog with a contract-valid copy of the existing fixture response and change only display names/IDs consistently. Never replace authored canonical files or construct an incompatible localStorage envelope. Scope card locators to All Subjects so Continue Studying duplicates do not make tests pass accidentally.

- At 1280×900 and 390×844, open both dashboards, assert full subject titles and one card action per subject. Include long `Microbiology & Parasitology` and `Obstetrics & Gynecology` titles, using fixture response name overrides if needed.
- Compare DOM bounding boxes: title lies to the right of the badge; its first line starts within badge vertical extent; scored quiz card's status top is at or below track bottom; neither header nor footer overlaps. Do not use jsdom for geometry.
- At 320px width and with enlarged text (200% root font-size test or documented manual browser zoom), confirm no document/card horizontal overflow or clipped text. If testing enlarged text reveals the fixed 16px rule does not scale, use the equivalent `1rem` title and `0.875rem` score sizes in Stage 2/3; do not solve clipping with ellipsis.
- Use Tab then Enter, and separately Space, to open a card exactly once; check focus outline before activation. Icons and status are not extra tab stops.
- Test reduced motion using Playwright `emulateMedia({ reducedMotion: 'reduce' })`: cards/skeletons do not animate; selection and content remain usable.
- Verify nonzero quiz score bar and trend plus active status together; verify flashcard grid has no score bars and still opens the subject. Verify carousel controls/ordering and status continue working using existing regression tests.
- Capture both dashboards and close-ups of all 13 icons (24px and 96px if custom geometry is unclear). Save evidence as Playwright attachments/output, not committed generated screenshots unless the repository intentionally adopts baselines. Human/agent visual inspection is required: screenshot capture alone is not a passing visual check.

Gate: behavioral assertions pass, screenshot inspection confirms soft card styling and readable icons, and no regressions in selection, carousels, scores, or loading/retry behavior.

## Stage 6 — final checks and documentation

Run from repository root, sequentially where servers/build output could conflict:

```sh
npm run lint
npm run format:check
npm run test:architecture
npm test
npm run validate:content
npm run build
npm run test:e2e
npm run test:e2e:admin
VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build
git diff --check
```

`npm run build` includes TypeScript checking; there is no separate typecheck script. The learner E2E npm pretest builds its own production output. Verify the ordinary build excludes admin.html and the opt-in build includes it. The admin browser/build checks are required by the repository's shared-UI guidance even though this change targets learners. Content validation here is a preservation check; no content editing is authorized. Python checks are unnecessary unless scope unexpectedly touches backend/contracts.

- [x] Update `docs/design-system.md` with the All Subjects opt-in layout, icon ownership, bar semantics, flashcard exception, and preserved carousel appearance.
- [x] Update `docs/testing-regressions.md` with grid layout, icon fallback, score/status ordering, and responsive/keyboard coverage.
- [x] Record exact commands, outcomes, visual evidence locations, and any unresolved limitations below. Do not mark implementation complete if relevant checks fail.
- [x] Inspect final diff for canonical data, lockfile, storage, domain, and unrelated changes; none were introduced.
- [x] Move this completed tracker to `docs/work/done/all-subjects-card-redesign-plan.md`.

## Execution log

- 2026-10-12: implemented reusable ID-mapped subject icons, including four local SVGs, and the opt-in dashboard grid card appearance. Added quiz score summaries and decorative bars, activity labels, shared loading skeletons, and focused unit/browser regressions. Existing carousel cards retain their standard presentation.
- Verification passed: npm run lint, npm run format:check, npm run test:architecture, npm test (73 files / 439 tests), npm run validate:content, npm run build, full npm run test:e2e (13 tests), npm run test:e2e:admin (3 tests), opt-in admin build, and git diff --check. The first full learner browser run had one unrelated timeout in the existing API quiz flow; that case passed alone and the full suite passed on rerun.
- After the full suite, the focused subject-card browser spec was extended to verify visible keyboard focus and Space activation; both subject-card browser tests pass with that coverage.
- Visual review: inspected /private/tmp/meducation-quiz-subject-grid-desktop.png, /private/tmp/meducation-quiz-subject-grid-mobile.png, and /private/tmp/meducation-flashcard-subject-grid-mobile.png. Card title stays beside its icon and wraps within its column at 320px without horizontal overflow. The supplied reference's multi-card composition was not available from the one-subject browser fixture, so the multi-column live appearance was verified through responsive CSS and component coverage.
- Content validation reports existing answer-under-review advisories; validation succeeds with 11,687 questions, 1,712 flashcards, and 13 shared subjects. Builds retain the existing large-chunk advisory.
- Stage 0 was completed by inspecting the worktree and current implementation; pre-change test results and screenshots were not captured before implementation began.

# Results score counter and ring

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

## Status

Complete.

## Goal

Replace the green check at the top of Results with a hollow score ring surrounding both “QUIZ COMPLETE” and the percentage. Count the percentage upward from zero while the orange arc fills clockwise to the same score, using one animation timeline.

## Proposed visual specification

- Remove only the Results hero's `CheckCircleRoundedIcon`; retain existing perfect-test celebration behavior.
- Center a circular ring around the existing completion label and percentage. Keep correct/incorrect/unanswered counts below and outside the ring.
- Begin with a complete neutral track using `theme.palette.grey[300]` and no visible orange arc. Fill the achieved portion using `theme.palette.primary.main` (`#b9511b`). The remaining portion stays gray.
- Start the orange arc at 12 o’clock and advance clockwise. A score of 67% fills 67% of the circumference; 0% leaves the entire ring gray and 100% fills it completely.
- Initial sizing: approximately 200px diameter on mobile and 220px on larger screens, with an 8px stroke. Adjust after browser inspection so the label and a three-digit score fit comfortably.
- Animate for approximately 600ms with restrained ease-out timing. Start when the Results hero mounts; the existing 170ms screen-entry animation can overlap it without an added wait.
- Keep the percentage width stable with tabular numerals and sufficient space for `100%`. Avoid layout shifts as the number gains digits.
- Keep the result actions usable throughout the animation.
- Reduced motion shows the final percentage and ring immediately.

## Stage 1 — Build the static Results hero

- [ ] Introduce `src/app/components/results/ResultsScoreHero.tsx` to own the ring and its centered label/percentage, using existing MUI styling and theme colors.
- [ ] Render the ring as an SVG with two circles: a full gray track and an orange score arc. Use a normalized circumference (`pathLength="100"`) with a dash length of 100 and offset of `100 - displayedPercentage`.
- [ ] Rotate the ring geometry by -90 degrees to start at the top; keep center text upright. Use a plain stroke cap for an accurate arc extent and explicitly hide the orange stroke at 0% to avoid a stray dot.
- [ ] Integrate the hero in `ResultsScreen.tsx`, remove the check-icon import/render, and preserve the current counts, statistics, topic breakdown, back action, and perfect-test overlay.
- [ ] Use the authoritative stored `attempt.score.percentage` for the final display and arc. Do not recalculate scoring or change the exact-count rule used for perfect-test celebrations.
- [ ] Give the hero one stable accessible label containing the final score. Mark the decorative SVG and changing visual digits as hidden from assistive technology to avoid announcing each animation frame. Keep the completion heading available as ordinary text. Treat the ring as a score graphic rather than an ongoing task progress bar.

## Stage 2 — Add one synchronized animation

- [ ] Drive both ring fill and percentage from one numeric animation value; do not run a separate CSS transition on the arc.
- [ ] Use `requestAnimationFrame`, elapsed time, and one easing function to derive `displayedPercentage = finalPercentage * easedProgress`.
- [ ] Render the counter as a rounded whole percentage, matching the existing format, while the ring uses the unrounded animation value for smooth motion. Both reach the exact stored final value on the same frame.
- [ ] Animate once per mounted result attempt, keyed by `attempt.id`. Ordinary rerenders and perfect-celebration dismissal must not restart it.
- [ ] Reuse the existing reduced-motion detection pattern, extracting a shared hook only if needed to avoid depending on celebration presentation code. If reduced motion becomes enabled mid-animation, cancel it and show the final state immediately.
- [ ] Cancel pending frames on unmount or attempt replacement. Make setup/cleanup safe under React Strict Mode. Returning from a background tab should resolve to the elapsed-time final state rather than replaying missed frames.
- [ ] Special-case 0% to remain at zero without an unnecessary frame loop. Verify 100% produces a full ring without a gap or overshoot.

## Stage 3 — Test and inspect

- [ ] Add deterministic animation tests with a controlled animation-frame clock: initial zero state, intermediate synchronized number/arc, final score, and frame cleanup on unmount.
- [ ] Cover 0%, a representative partial score such as 67%, and 100%; confirm rerenders do not restart the animation and replacing the attempt starts a new one.
- [ ] Cover initial reduced-motion preference and switching it on during the animation. Assert the final result becomes immediately available without further frames.
- [ ] Extend Results integration coverage for the replacement hero, count/statistic preservation, and Back to quizzes behavior. Retain tests distinguishing an exact perfect score from a rounded 100% and a zero-question attempt.
- [ ] Inspect actual Results navigation on desktop and mobile, including 0%, partial, and full rings. Check label fit, tabular number stability, the 12 o’clock clockwise fill, and the interaction with screen entry and the perfect-test overlay.
- [ ] Check keyboard navigation and assistive output: final score is exposed once, without a stream of changing announcements.
- [ ] Run focused Results/animation tests, `npm test`, `npm run build` (includes TypeScript checking), and `git diff --check`. Investigate any failures and distinguish pre-existing issues from regressions. The previous screen-transition run reported a canonical bank-count assertion expecting 108 quizzes while the bank exposed 110; verify its current status rather than assuming it is resolved.

## Stage 4 — Document and complete

- [ ] Add the ring geometry, theme colors, animation duration, synchronization rule, and reduced-motion behavior to `docs/design-system.md`.
- [ ] Record relevant Results/animation coverage in `docs/testing.md`.
- [ ] Record implementation choices and verification results here, then move the tracker to `docs/work/done` when the work is complete.

## Acceptance criteria

Results no longer shows the green check above its completion label. The label and percentage are centered within a hollow ring that begins gray and fills clockwise in the primary orange. The number and arc share one timeline and stop together at the stored score. Reduced motion renders the final state immediately. Existing Results data, navigation, and exact perfect-score celebration behavior remain correct.

## Implementation and verification record

- Added `ResultsScoreHero` with a theme-colored SVG ring and percentage counter driven from one 600ms eased requestAnimationFrame value. It starts at 12 o’clock, keeps 0% empty, and handles 100% as a complete ring.
- Removed the green check from the Results header. Preserved result counts, statistics, topic breakdown, navigation, and exact-count perfect-test celebrations.
- The visible counter is hidden from assistive technology; the final score is exposed as stable screen-reader text. Reduced-motion preference shows the final value and cancels an active animation.
- The centered text area fills the ring's available inner width, with centered text alignment and tabular numerals, so digit-width changes from `0%` through `100%` do not shift the score off center.
- Following browser review, increased both SVG circle radii from 45 to 47 viewBox units while retaining the 4-unit stroke and outer sizing. A focused regression assertion checks the radius.
- Added deterministic tests for 0%, 67%, 100%, intermediate synchronization, unchanged rerenders, reduced-motion changes, and frame cancellation. Added Results integration coverage for the score hero, result summary, navigation, and existing celebration rules.
- Updated `docs/design-system.md`, `docs/architecture.md`, and `docs/testing.md`.
- Focused Results tests passed (2 files, 7 tests).
- `npm test` passed (25 files, 131 tests).
- `npm run build` passed; Vite reported the existing large validation chunk warning.
- `git diff --check` passed.
- Automated rendering, accessibility markup, responsive sizing rules, and motion behavior are covered. Manual visual inspection at desktop/mobile viewport sizes was not performed.
- After the score-centering refinement, focused Results tests passed again (2 files, 7 tests), the production build passed, and the in-app browser showed the 5% score centered in its ring.
- After the radius adjustment, focused Results tests passed again (2 files, 7 tests), the production build passed, and the in-app browser showed the enlarged ring with the score centered.
- Added an 8px top margin to the score summary beneath the ring. Focused Results tests passed (2 files, 7 tests), the build passed, and the browser showed the added breathing room.

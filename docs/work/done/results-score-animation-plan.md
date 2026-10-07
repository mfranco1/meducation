# Results score animation refinement

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

## Status

Implementation complete.

## Current implementation

`src/app/components/results/ResultsScoreHero.tsx` drives the counter and SVG arc from one `requestAnimationFrame` value over 600 ms, using cubic ease-out. `Math.round` can show the final integer before the ring finishes. The arc currently uses the primary orange throughout. The component already handles zero, reduced motion, stable accessible final-score text, and frame cleanup. `ResultsScreen` keys the hero by attempt ID.

## Intended behavior

The counter and ring advance quickly through the start and middle, then visibly decelerate into the exact final score. Ring color follows the currently animated percentage, so a high score travels through red, yellow, light green, and green during the sweep. Low scores receive a proportionately shorter animation with the same relative settling phase.

Interpret the requested overlapping ranges as red through 60%, yellow above 60% through 75%, light green above 75% through 90%, and green above 90%. Colors blend around those boundaries instead of switching abruptly. These colors are decorative score cues, not new pass/fail rules.

## 1. Animation timing and synchronization

- [ ] Keep one animation timeline and one continuous score value for arc length, counter, and color. Keep elapsed-time-based animation so slow or skipped frames do not change the outcome.
- [ ] Replace the current cubic ease-out with a continuous two-part monotonic curve: cover approximately 85% of the target during the first 65% of the duration, and use the remaining 35% to settle the final 15%.
- [ ] Use cubic Hermite interpolation for both segments, matching position and velocity at the join. Initial tuning: normalized velocity 1.4 at the start, 0.7 at the join, and zero at completion. This keeps the early sweep fast while avoiding a sudden braking point, overshoot, or bounce.
- [ ] Scale duration with target size rather than applying a long fixed wait to tiny scores. Initial candidate: `450 + 850 * sqrt(target / 100)` milliseconds for positive scores, giving approximately 535 ms at 1%, 719 ms at 10%, and 1,300 ms at 100%. Tune these values after browser inspection.
- [ ] For the existing integer scores, display `floor(animatedScore)` while running and the exact target at completion. This prevents early final-value display without breaking the shared timeline. The arc stays continuous between integer counter updates.
- [ ] Explicitly assign the exact final value when elapsed progress reaches 1, then stop scheduling frames. Keep animations stable across ordinary rerenders and cancel pending work when the target changes, reduced motion becomes enabled, or the component unmounts.

## 2. Low-score and boundary handling

- [ ] At 0%, render the final zero immediately, with a gray track and no score arc or scheduled animation.
- [ ] At 1–5%, retain smooth arc motion and the shorter duration. Expect few digit changes; do not invent decimal digits, overshoot, or a minimum arc size to make these scores seem larger.
- [ ] Apply the settling curve to a fraction of the target, not an absolute last 10–15 percentage points. Even a low result therefore has both a fast sweep and a settling phase.
- [ ] At 100%, finish with a fully closed green ring and exactly `100%`, with no residual gap.
- [ ] Keep presentation clamped to 0–100 and guard non-finite input before animation calculations; valid stored scores remain authoritative. The defensive fallback should render zero without animation.
- [ ] With reduced motion, show the final number, arc extent, and final color immediately, including when the preference changes during animation. Preserve stable screen-reader text and tabular numerals.

## 3. Smooth score colors

- [ ] Define Results-specific score color tokens in `src/app/theme.ts`: red, yellow, light green, and green. Reuse the existing error red (`#b73b32`) and success green (`#2f7a55`) as endpoint candidates; start with `#c69a16` for yellow and `#8ab85a` for light green. Confirm all four are distinguishable against the warm page and gray track in the browser.
- [ ] Keep red below the first blend region, yellow between the first and second, light green between the second and third, and green above the third.
- [ ] Start with narrow transition windows around each boundary: 58–63% for red to yellow, 73–78% for yellow to light green, and 88–93% for light green to green. Smoothstep the interpolation fraction within each window so color changes begin and end gently. Exact boundary scores will intentionally show a blended shade.
- [ ] Interpolate RGB channels from the theme tokens using the continuous animated score. A small local pure helper is sufficient; no animation or color dependency is needed.
- [ ] Compute the stroke color directly on each animation frame. Avoid a separate CSS stroke transition that could trail the arc, continue after completion, or animate despite reduced motion.
- [ ] Keep the remaining track gray. Preserve the existing percentage and completion-label typography colors; color is supplementary to the numeric result.

## 4. Implementation scope

- [ ] Add small pure timing/color helpers beside `ResultsScoreHero` if extracting them makes monotonicity and boundary tests clearer. Keep this presentation logic out of domain scoring and persistence.
- [ ] Update `ResultsScoreHero.tsx` to use those calculations without changing the ring geometry, responsive dimensions, result summary, navigation, or perfect-test celebration rule.
- [ ] Update `docs/design-system.md` with the approved timing, blend windows, and reduced-motion behavior; update `docs/testing.md` with the new coverage.
- [ ] Leave canonical question content, stored percentages, IDs, and answer provenance untouched.

## 5. Verification and acceptance

- [ ] Extend `ResultsScoreHero.test.tsx` to verify shared intermediate values, the settling phase, exact completion, color progression, zero and perfect scores, reduced motion on load and mid-animation, rerenders, target changes, and cancellation.
- [ ] Test the curve's monotonicity, bounded output, matched velocity at the join, and slowing tail with representative elapsed times. Verify color continuity on both sides of every blend endpoint and score threshold.
- [ ] Exercise scores 0, 1, 2, 5, 10, 60, 61, 75, 76, 90, 91, 99, and 100. Cover a delayed final frame and defensive invalid input. Require the integer counter to remain below its target until completion.
- [ ] Run existing Results screen integration coverage to preserve summaries, navigation, and exact-count perfect-test celebration behavior.
- [ ] Inspect actual animation in a browser at mobile and desktop widths, including reduced motion. Confirm the fast sweep and final settle feel continuous, small arcs remain faithful to the score, colors do not flash at boundaries, and actions stay usable throughout. Tune duration, join velocity, and colors together before finalizing documentation.
- [ ] Run `npm test`, `npm run lint`, `npm run format:check`, and `npm run build` (which includes TypeScript checking). Run `npm run test:e2e` for the existing browser smoke path. Content validation is unnecessary for this UI-only change unless implementation touches canonical content.
- [ ] Move this tracker to `docs/work/done` only after implementation and relevant checks pass.

Verification note: the full unit suite (236 tests), lint, formatter, and production build pass. The Playwright smoke suite could not start because its configured API address at `127.0.0.1:8000` is already in use; that existing service was left untouched. A manual browser inspection remains outstanding.

## Acceptance criteria

The ring and counter settle on the exact stored result together; speed decreases smoothly during the final phase; low scores complete promptly without fabricated visual progress; colors blend according to the animated score; zero remains empty; 100% closes the ring; and reduced motion immediately renders the final state. Browser inspection determines the final feel rather than relying on timing assertions alone.

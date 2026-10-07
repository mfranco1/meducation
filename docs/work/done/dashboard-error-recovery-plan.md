# Dashboard error recovery implementation plan

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

Status: implemented and verified with focused tests, lint, formatting, and TypeScript build checks.

## Goal

Keep the dashboard's layout intact when content cannot load. Show one top banner for a shared failure, with a real Retry button and an accurate automatic-retry countdown. Use errors inside the affected cards/subject region when only part of the dashboard fails. Treat the supplied screenshots as behavioral examples; retain Meducation's theme, typography, spacing, and MUI icon family.

## Existing implementation and scope

- `src/app/screens/DashboardScreen.tsx` replaces Average and Lowest with one `ContentLoadFailure`, then renders another failure in All Subjects. Both receive the same error and retry callback.
- `src/app/App.tsx` derives subjects and both scores from the single subject-membership catalog. Completed quizzes comes from local progress and remains available independently. There are currently no independent statistics requests; a catalog outage is a shared failure even though the local completed count still works.
- `src/content/contentTransport.ts` already owns bounded retries, jitter, Retry-After, and a 15-second per-attempt timeout. `RuntimeQuestionBank` exposes retry state and attempt number, but drops the retry delay and does not distinguish a backoff wait from the next active request.
- `StatCard` is also used outside the dashboard. `ContentLoadFailure` and `LoadingSkeleton` are shared. Keep dashboard-specific behavior opt-in to avoid changing other screens accidentally.
- No API endpoints, dependencies, content edits, score calculation changes, or persistence changes are needed.

## 1. Define a coherent dashboard presentation state

- [ ] Replace the loosely related dashboard loading/error booleans with typed presentation inputs for statistics and subjects, plus optional shared failure/retry metadata. Keep request ownership in the runtime layer and composition in `App.tsx`.
- [ ] Identify shared failures by their originating resource/operation, not matching error strings. The existing catalog maps to both dependent regions and therefore produces exactly one shared message.
- [ ] Support region-specific error inputs for partial failures without splitting the existing catalog request or inventing new fetches. Test those presentation paths directly; the current live catalog failure will use the shared path.
- [ ] Define transitions: initial load → success; initial load → retry wait → retry request → success or terminal failure; terminal failure → manual retry. Keep the banner visible after the first shared failure through recovery attempts, clearing it on success.
- [ ] Preserve available successful values and cards. Never substitute zero or a successful empty state for unavailable data. Show no-score dashes and “No subjects” only after successful loading.

Acceptance: one catalog failure cannot render two independent alerts; locally available completed quizzes stays visible in every state.

## 2. Expose the real retry schedule and implement Retry now

- [ ] Extend transport progress notifications to expose the safe failure category, the next retry deadline, and when a new HTTP attempt starts. Store catalog retry metadata in `runtimeQuestionBank.ts` and publish it through the existing external-store subscription.
- [ ] Derive the displayed seconds from the deadline (`ceil((retryAt - now) / 1000)`, clamped at zero). Use a small UI timer only while waiting; it must not schedule requests or mutate the runtime snapshot every second.
- [ ] Add an operation-scoped way to advance a pending transport backoff immediately. Retry now consumes the already scheduled next attempt and keeps the same budget; it must not start a second catalog operation. Deduplicate rapid clicks and retain generation guards. Do not bypass a server's Retry-After minimum: disable the action during that mandatory wait and explain it briefly.
- [ ] During an active HTTP attempt, disable the action and show “Retrying…” with no countdown. At exhaustion, clear the deadline and offer enabled manual Retry, which starts a fresh bounded operation. Do not imply another automatic attempt is scheduled after the budget ends.
- [ ] Preserve the existing retry classifications, timeout, jitter, and default maximum of three retries. No perpetual polling loop. Clear metadata on success, terminal failure, cancellation, and reconfiguration; clean up the UI timer on unmount.
- [ ] Treat offline detection as a copy hint, not proof of why a request failed. Do not claim the server is down. Do not add an independent online-event retry loop.

Acceptance: countdown matches the actual next attempt; manual and automatic actions never overlap. Zero-retry configuration has a manual action but no countdown.

## 3. Keep statistic card shells mounted

- [ ] Always render Completed quizzes, Average, and Lowest in the existing responsive stack.
- [ ] Add an optional dashboard error/footer presentation to `StatCard`, or a thin dashboard wrapper, keeping Results behavior unchanged.
- [ ] Reserve consistent dashboard value/footer space across loading, success, and failure so error notes and buttons do not resize the row. Account for wrapped labels/badges and mobile layouts rather than fixing text to a clipped height.
- [ ] For shared failure, show static neutral-gray value placeholders in affected cards, retaining their labels and suppressing local error copy/actions.
- [ ] For a statistics-only failure, show “—”, a small MUI error-outline icon and “Couldn't load” note, and an outlined Retry button inside each affected card. If Average and Lowest share a source, their controls invoke the same deduplicated retry.
- [ ] Do not display the Lowest subject badge while its data is unavailable. Retain existing score calculation and successful empty-score behavior.

Acceptance: Average and Lowest remain mounted and occupy consistent space across transitions; error actions are visibly buttons, not text links.

## 4. Add the shared dashboard banner

- [ ] Add a dashboard-specific banner at the top of the existing content container, above statistics. Use MUI Alert/Stack primitives, semantic warning styling, the existing rounded icon family, and an outlined Retry action with a refresh icon.
- [ ] Use concise safe copy: “We can't load your stats and subjects right now.” Add “Trying again in Ns…” during backoff, “Retrying…” during a request, or a manual-retry instruction once automatic retries stop. Use offline-specific wording only when browser connectivity indicates offline.
- [ ] Keep one message for shared non-network errors too, but choose accurate copy. Invalid responses must not look like connectivity failures; revision conflicts must retain “Reload content” behavior and invoke the appropriate reload rather than an ineffective ordinary retry.
- [ ] Suppress all duplicate statistics and subject failure messages/actions while the banner owns recovery. Keep Completed quizzes and any genuinely available content visible.
- [ ] Let the banner enter normal document flow once when failure is detected; keep its slot stable through retry countdown/request transitions. Avoid overlays on navigation or repeated layout changes as the timer ticks.

Acceptance: a shared outage has exactly one recovery message and one visible recovery action. Banner copy never exposes HTTP codes, raw exceptions, or backend instructions.

## 5. Preserve the subject-grid footprint

- [ ] Extract/reuse a subject placeholder grid with the existing responsive columns, gap, and card geometry. Retain the current six-placeholder fallback, not the mockup's assumed twelve subjects. Use a known prior count when legitimately available.
- [ ] Initial loading may keep the existing warm wave animation. Shared failure and backoff use quiet static gray placeholders. Add an explicit opt-in skeleton tone/static mode that does not override reduced-motion behavior or change other screens.
- [ ] For a subjects-only failure, render dashed placeholder cards and one centered inline message with an outlined or contained Retry button. Keep that message within the section layout, without modal semantics, focus trapping, floating shadows, or content overlap on small screens.
- [ ] Reserve the existing active-subject pending area when local progress indicates unfinished tests. Keep its placeholder during a catalog outage so the section does not disappear at failure; populate the carousel only when its data is available.
- [ ] Retain successful subjects and the active carousel when only statistics are unavailable. Do not turn placeholder cards into clickable subjects.

Acceptance: failing requests do not collapse the subjects region, remove successful sections, or introduce horizontal overflow.

## 6. Accessibility and theme integration

- [ ] Reuse theme spacing, 14px card radii, soft borders, off-white surfaces, warm primary accent, and `@mui/icons-material` rounded icons. Use neutral palette tokens for quiet placeholders; no copied mockup colors, typography, or new icon dependency.
- [ ] Use native MUI buttons with visible boundaries, keyboard focus, and at least the existing 44px touch target. Distinguish repeated statistic Retry controls with accessible names such as “Retry average statistics.”
- [ ] Announce a shared failure once. Hide decorative skeletons/icons from assistive technology; announce partial statistics failure once rather than once per duplicated metric note. Provide separate announcements only for genuinely independent affected regions.
- [ ] Do not announce the countdown every second. Announce meaningful transitions politely; mark regions busy only while a request/retry is actually pending, not after terminal failure.
- [ ] Do not steal focus when failures appear; keep retry controls stable through attempts. Check focus when recovery removes a focused recovery control, and provide a predictable nearby destination if needed.

## 7. Verify behavior and document the change

- [ ] Update `DashboardScreen.test.tsx`: remove assertions requiring disappearing cards, duplicated errors, and shimmer-only retry presentation. Cover initial loading, shared failure, countdown, active retry, exhaustion, statistics-only and subjects-only errors, success, empty results, and recovery.
- [ ] Extend runtime/transport tests with fake timers and deterministic randomness: retry deadlines, attempt-start notifications, manual advancement, Retry-After protection, rapid-click deduplication, exhaustion, fresh manual budget, stale generations, and cleanup.
- [ ] Add App integration coverage showing one failed catalog operation maps to one banner while completed quizzes persists, then restores all dependent content after recovery. Verify no progress writes occur.
- [ ] Extend `e2e/learner-smoke.spec.ts` for desktop/mobile outages and recovery, keyboard operation, reduced motion, and card/section bounds across error transitions. Existing E2E setup builds with `VITE_CONTENT_MAX_RETRIES=0`; use an additional retry-enabled build/configuration for real countdown coverage rather than expecting a countdown under that fixture.
- [ ] Run `npm test`, `npm run lint`, `npm run format:check`, `npm run build` (includes TypeScript), and relevant browser tests. Content validation is needed only if content changes, which this plan does not require.
- [ ] Update `docs/product.md`, `docs/design-system.md`, `docs/architecture.md`, and `docs/testing.md`. Explicitly replace the dashboard guidance that currently requires unframed text actions and silent shimmer through retries, while retaining unrelated screen behavior.
- [ ] Record validation results and move this tracker to `docs/work/done` after implementation passes its checks.

## Completion criteria

The dashboard retains its statistic shells and subject-region footprint during failures. A shared catalog failure produces one banner with truthful retry timing; partial failures stay inside their affected regions. Retry controls look and behave like buttons, respect the existing retry budget, and cannot create duplicate requests. Successful content, local progress, and Meducation's visual conventions remain intact.

# Flashcard dashboard completion statistics

Status: implemented and verified; one unrelated admin browser test was unstable in this environment.

## Goal and confirmed counting rules

Add three cards above Continue Studying and All Subjects: **Completed decks**, **Average count**, and **Highest count**, matching the quiz dashboard's responsive stat-card layout.

The user confirmed that repeat finishes count and that Average includes every calendar day since the first tracked completion, including today and idle days:

- **Completed decks:** total successful Finish actions, including repeated study runs of the same deck. Sum the existing durable per-deck `completionCounts`; do not count only distinct deck IDs or depend on the loaded content catalog.
- **Average:** an exact running average of completions per calendar day since the first completion recorded with daily tracking, including today and days with zero completions. This is a cumulative average, with constant-size aggregate storage; no sliding window or per-day history is needed.
- **Highest:** the largest completion count reached in any tracked local calendar day, including the unfinished current day. Store one maximum value and update it when today's count exceeds it.
- A day runs from local 00:00 inclusive to the next local 00:00 exclusive, using the browser/device's local timezone at completion time. A deck started before midnight and finished after midnight belongs to the new day.
- Before any daily tracking exists, show Average `0.0` and Highest `0`, with units `decks/day`. Show Completed decks `0` for an empty valid progress store. Existing historic per-deck counts remain in Completed decks, but cannot be assigned to days; daily metrics start at the next successful finish. Add concise footer copy explaining that daily figures are measured since daily tracking began.
- Preserve the existing explicit final-card completion rule, duplicate protection, subject completion pills, and progress recovery behavior.

Example: finishing 3 decks on the first tracked day gives Total 3, Average 3.0, Highest 3. After a second calendar day with no completions, Average is 1.5. Finishing 5 on the third day gives Total 8, Average 2.7, Highest 5. Repeated completions of one deck contribute to these totals.

## Existing implementation and boundaries

- `FlashcardsDashboardScreen` already uses `StudyDashboardLayout`, whose `summary` slot can contain the new stat row.
- The quiz dashboard uses `src/features/quizzes/components/StatCard.tsx` for dashboard and result cards. It is presentation-only but lives in the quiz feature, so flashcards cannot import it directly under checked repository boundaries.
- `FlashcardProgressState` already contains durable per-deck completion counts and active checkpoints in the v2 envelope.
- `LocalFlashcardProgressRepository.completeDeck` increments a deck's count and removes its checkpoint in one commit. Daily aggregate updates must join that same commit.
- Content catalogs load independently from local progress. These statistics should be available even while subject content is loading or its request fails. Unreadable progress must not be represented as a trusted zero.
- Current staged completion-pill changes and the separately modified canonical flashcard bank are existing work. Implementation should build on the former and preserve the latter.

## Stage 1 — Define daily aggregation and calendar rules

Suggested files: `src/domain/flashcardDailyStats.ts` and `src/domain/flashcardStudy.ts`.

- [x] Implement the confirmed repeated-completion and calendar-day denominator rules above, and record them in product documentation.
- [x] Define a compact daily aggregate with five fields: `firstDay`, `currentDay`, `currentDayCount`, `trackedCompletions`, and `highestDailyCount`. Use validated local civil-date keys (`YYYY-MM-DD`), not UTC dates obtained from `toISOString()`.
- [x] Keep pure functions for date-key generation, elapsed calendar days, applying a completion, and deriving dashboard values. Accept a date/clock input so tests can control time.
- [x] Derive elapsed days by converting civil-date components to calendar ordinals. Do not divide elapsed local timestamps by 24 hours; DST days may contain 23 or 25 hours.
- [x] Compute `average = trackedCompletions / inclusiveCalendarDays(firstDay, today)`. Retain integers as the source data and round only for display; do not persist a repeatedly rounded average.
- [x] On the first tracked completion, initialize both dates to the local day, both completion counts to 1, and Highest to 1.
- [x] On another finish in the same day, increment today's count and the tracked total, then update Highest with the new today's count.
- [x] On a later day, replace the current-day bucket with the new day and count 1; increment the tracked total and retain/update Highest. Skipped days contribute to the denominator without storage entries or loops over every skipped day.
- [x] Define a conservative clock/timezone-change policy: past completions keep their recorded local date assignment; do not rebucket history. If the local date moves backward, keep the latest stored day bucket and clamp the elapsed-day calculation so it never becomes negative or zero. Document that this is an approximation during backward clock/timezone changes, since constant-size aggregates cannot reconstruct history.

Stage exit: deterministic daily math covers same-day repeats, midnight rollover, skipped days, leap/month/year boundaries, DST, and empty tracking state with bounded storage.

## Stage 2 — Extend and validate progress storage compatibly

Files: `src/persistence/flashcardProgressCodec.ts`, `src/persistence/localFlashcardProgressRepository.ts`, and affected fixtures.

- [x] Add optional persisted `dailyStats` to the current v2 envelope and normalized progress type. Existing v2 saves without this field remain valid; absence means daily tracking has not begun.
- [x] Validate the aggregate's exact shape, real calendar dates, ordered dates, safe integer bounds, positive totals for initialized tracking, and coherent relationships (`currentDayCount <= highestDailyCount <= trackedCompletions`). Reject invalid data through existing recovery behavior.
- [x] Keep legacy completion counts and checkpoint values intact. Reading old saves must not infer dated history, reset counts, rewrite storage, or consult retired keys.
- [x] Include the daily aggregate in frozen snapshots; preserve stable snapshot identity, subscriptions, corruption protection, and temporary storage recovery.
- [x] Validate that daily tracked completions do not exceed the durable per-deck sum, and guard aggregate increments against integer overflow.

Stage exit: old and new progress round-trip safely, invalid aggregates preserve original stored bytes, and stored data size does not grow with elapsed days.

## Stage 3 — Record daily stats atomically on completion

Files: `src/persistence/localFlashcardProgressRepository.ts`, `src/features/flashcards/session/useFlashcardSession.ts`, and their tests.

- [x] Capture the completion time once per finish operation and pass it to the pure aggregator. Provide a controllable clock seam for tests.
- [x] Update the per-deck count, daily aggregate, and checkpoint removal in the same existing revision-checked commit.
- [x] Increment only when an active checkpoint is successfully completed. Duplicate calls after removal, failed writes, stale writers, save-and-exit, navigation, reveals, and restarts must not increment any metric.
- [x] Keep the study screen and previous visible statistics on save failure, allowing the existing retry path.
- [x] Preserve counts for deleted or unavailable content; historical completion totals are progress data independent from current catalog membership.

Stage exit: one successful finish updates all three metrics once; a failed finish publishes none of those changes. Existing optimistic cross-tab conflict checks remain in effect, with no new claim of locking truly simultaneous writes.

## Stage 4 — Derive stats and refresh across local midnight

Suggested files: `src/features/flashcards/selectors/flashcards.ts`, a focused hook under `src/features/flashcards/session`, and `src/app/App.tsx`.

- [x] Add a pure dashboard-stat selector for total completions, average, and highest using the normalized progress snapshot and current local date.
- [x] Keep Completed decks based on the full durable completion map. Keep Average and Highest based on the dated tracking aggregate, excluding undated legacy counts.
- [x] Refresh the displayed average at the next local midnight while the dashboard stays open. Construct the next local midnight as a calendar boundary, rather than scheduling a fixed 24-hour interval.
- [x] Recheck the local date on window focus and document visibility changes to recover from sleeping devices, throttled timers, or timezone changes. Clean up timers/listeners on unmount and reschedule after refresh.
- [x] Recompute on progress subscription updates as well as date changes. Avoid daily storage writes: idle days alter the derived denominator, while the current-day bucket rolls forward only on a successful completion.
- [x] Pass a compact presentation model and progress-read-error state into the dashboard, without storage reads in UI components or duplicated count state.

Stage exit: an idle dashboard updates after midnight or wake without a completion, refresh preserves values, and only successful study operations write progress.

## Stage 5 — Reuse stat-card presentation and wire the dashboard

Files: `src/features/quizzes/components/StatCard.tsx`, its current consumers, `src/shared/ui/catalog/StatCard.tsx`, and `src/features/flashcards/screens/FlashcardsDashboardScreen.tsx`.

- [x] Move the existing presentation-only StatCard into shared catalog UI and update quiz DashboardScreen/ResultsScreen imports. Preserve its existing props and visual behavior.
- [x] Add the three flashcard cards via `StudyDashboardLayout.summary`, with the same row/column breakpoints, spacing, card geometry, label styling, and numeric hierarchy as quizzes.
- [x] Display labels: Completed decks, Average count, Highest count. Render integer totals/highs and one-decimal Average without secondary descriptions or percentage suffixes.
- [x] Keep locally available stats visible during subject catalog loading or failure. Preserve the existing recovery banner, Continue Studying carousel, and All Subjects grid.
- [x] For corrupt or unavailable progress, render unavailable values (`—`) plus the existing learner-safe persistence error; do not show misleading zeros. Valid empty progress displays zero values.
- [x] Update dashboard and browser expectations that currently prohibit the word Average on flashcards, while retaining checks that quiz scores and quiz analytics never appear there.

Stage exit: three matching cards appear at the top, remain usable independently of content requests, and fit desktop/mobile layouts with clear units and accessible text.

## Stage 6 — Verify, document, and close

- [x] Add meaningful domain tests for local midnight and UTC-date differences, same-day repeats, idle-day denominator growth, multi-day gaps, month/year/leap boundaries, DST, backward clock policy, and zero tracking.
- [x] Extend codec/repository tests for both legacy v2 shapes, invalid aggregates, overflow, snapshot immutability, atomic failure/retry, duplicate finishes, conflicts, and constant-size daily storage over a large gap.
- [x] Add selector/hook tests for old totals plus new daily tracking, timezone-aware date changes, midnight/focus/visibility refresh, no read-side writes, and cleanup.
- [x] Extend dashboard/App/browser coverage for all three values, one-day/two-day examples, repeat completions, refresh persistence, failed finish, subject-loading independence, unreadable storage, and desktop/mobile display.
- [x] Because StatCard becomes shared and the prior browser assertions change, run the affected quiz dashboard/results tests and flashcard tests, then `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check`.
- [x] Follow `docs/testing.md` for shared UI verification: learner and admin browser suites and both normal and enabled-admin production build modes. Use deterministic clock fixtures rather than waiting until real midnight.
- [x] Run `npm run validate:content` as the documented baseline, recording existing warnings without modifying canonical content.
- [x] Update `docs/product.md`, `docs/architecture.md`, `docs/design-system.md`, and `docs/testing-regressions.md` with counting definitions, daily tracking start, midnight refresh, compact storage, and clock-change policy.
- [x] Record verification outcomes here and move this tracker to `docs/work/done` only after relevant checks pass.

## Acceptance criteria

1. The dashboard shows Completed decks, Average count, and Highest count above the existing carousel/grid in the quiz stat-card style, without secondary descriptions.
2. Repeat finishes contribute to Total and daily counts; Average includes elapsed days with zero completions.
3. A finish at local 00:00 belongs to the new day; Average refreshes across midnight without requiring a new finish.
4. Daily data uses constant-size aggregates and one historical maximum, never a day-by-day map or completion-event log.
5. Highest includes today's count, survives later quieter days, and persists across reloads.
6. Old per-deck counts remain in Completed decks; undated history is excluded from Average/Highest.
7. A failed or duplicate finish does not add a completion; storage errors do not appear as trusted zero statistics.
8. Quiz statistics, canonical content, stable IDs, deck completion pills, and saved-position behavior retain their existing semantics.

## Implementation and verification results

- Implemented the five-field daily aggregate and local civil-date calculations, with a documented backward-clock policy and no per-day history.
- Added optional daily stats to the existing v2 progress envelope, preserving legacy snapshots without that field. Completion count, daily aggregate, and checkpoint removal are committed atomically.
- Added dashboard selectors and midnight/focus/visibility refresh behavior. Moved the shared quiz stat-card presentation into shared UI and added the three flashcard dashboard cards.
- Updated product, architecture, design-system, and regression-testing documentation. The separately modified canonical flashcard bank was left untouched.
- `npm test`: passed, 63 files and 376 tests.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run build`: passed.
- `VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build`: passed; Vite reported its existing large-chunk advisory.
- `git diff --check`: passed.
- `npm run validate:content`: passed for 11,687 questions, 1,282 flashcards, 55 decks, and 13 subjects; existing answer-review warnings remain.
- `npm run test:e2e`: passed, all 11 learner flows before the final audit assertion was added. The focused flashcard learner flow was rerun afterward and passed with a fixed date, checking Completed decks `2`, Average `2.0`, and Highest `2` after repeated finishes.
- The daily-stats hook suite covers local midnight, focus, visibility recovery after sleep, and timer cleanup. Focused domain, persistence, dashboard, and hook tests passed (18 tests).
- `npm run test:e2e:admin`: one test passed; the other timed out at its fixed 60-second limit after the browser session closed during the quiz admin flow's Reset both banks check. A focused rerun and an extended CLI-timeout rerun reproduced the same timeout. This path does not touch the shared stat card or flashcard learner dashboard.
- Follow-up UI review renamed the two daily card labels to Average count and Highest count, removed all three card descriptions, and aligned the flashcard Finish action with the primary quiz Finish/Submit color. The shared footer no longer allows a success-color override; unit tests cover both quiz and flashcard action colors.

# Pause stopwatch when leaving a test

## Status

Complete

## Goal

Count only time spent on an active quiz screen. Leaving a test must freeze its stopwatch, and resuming it must begin a new timed session without adding the time spent on the subject page or away from the app.

## Current behavior

`Attempt.startedAt` is the only timing value. The stopwatch and final score both calculate elapsed time as `now - startedAt`, so a saved attempt continues accumulating time after the learner chooses **Leave test**.

## Design

- Keep `startedAt` as immutable attempt provenance.
- Add persisted timing state to active attempts:
  - `elapsedMs`: completed active time accumulated before the current session.
  - `timerStartedAt`: ISO timestamp for the currently active quiz session; absent while paused.
- Add pure timing helpers in `src/domain/quizEngine.ts` to calculate elapsed time, pause an attempt, resume an attempt, and score from the accumulated active duration.
- Start a new attempt with `elapsedMs: 0` and `timerStartedAt` set to creation time.
- On **Leave test**, use the pause helper, save the paused attempt and current question checkpoint, then return to the subject page.
- On **Resume test**, set a new `timerStartedAt` before entering the quiz view and save the resumed attempt.
- On completion, pause first and calculate the score from the frozen elapsed duration. Aborting still clears the active attempt without creating a completed record.
- Add a `pagehide` safeguard that pauses and persists the currently active quiz session before reload, close, or browser navigation. Do not pause merely because a tab becomes hidden; the requested boundary is leaving the test, not switching focus temporarily.

## Compatibility

Existing active attempts lack the new timing fields. On their first resume after this change, preserve the elapsed time already implied by `startedAt`, store it as `elapsedMs`, and begin a new session at the resume time. This prevents future away-time from being added, while avoiding a silent reset of a learner’s previously displayed duration.

## Implementation checklist

- [x] Extend `Attempt` with optional persisted timer state and document its legacy interpretation.
- [x] Implement and unit-test pure pause, resume, elapsed-time, and scoring helpers.
- [x] Update `Stopwatch`, start, resume, leave, finish, and page-exit flows in `src/app/App.tsx`.
- [x] Ensure the local repository persists the new fields through its existing attempt serialization.
- [x] Update `docs/product.md` and `docs/architecture.md` with active-time timer behavior.
- [x] Add regression coverage for legacy active attempts.
- [x] Run `npm test`, `npm run build`, and manually verify leave/resume; cover elapsed-time scoring with unit tests.

## Acceptance criteria

- Time increases only while the quiz view is active.
- Leaving for any length of time does not change the displayed duration or final elapsed time.
- Resuming continues from the frozen duration.
- Reloading or closing while in a quiz preserves the elapsed duration recorded up to page exit.
- Legacy saved attempts remain resumable and retain their prior elapsed value at migration.

## Verification

- `npm test` — passed (20 tests)
- `npm run build` — passed
- Browser verification — leaving a live in-progress test returned to the saved subject page with a resume action; resuming reopened the same question with the stopwatch continuing from its paused duration. Page-exit persistence, completion, and abort behavior are covered by the implementation paths without altering the learner’s existing attempt during manual verification.

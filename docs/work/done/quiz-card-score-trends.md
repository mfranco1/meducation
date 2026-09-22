# Show latest quiz score with trend

## Status

Complete

## Goal

Simplify completed quiz cards on the subject screen by removing the lowest-score pill and placing the quiz's score-trend indicator beside its latest score inside the existing pill-style label.

## Current behavior

- A completed quiz card can show three outlined pills: completion count, latest score, and lowest score when it differs from the latest score.
- `QuizProgress` carries `lowestScore` and `latestScore`, and `App.progressForSubject` reads both summaries from the attempt repository.
- Dashboard subject cards already compare the two most recent completed attempts with the shared `scoreTrend` analytics helper.
- The dashboard renders an accessible green upward triangle for an increase, red downward triangle for a decrease, and primary-colored horizontal line for an unchanged score, but that presentation component is private to `DashboardScreen`.
- The repository keeps completion counts, lowest scores, and latest scores independently from capped completed-attempt history.

## Product and technical decisions

- Keep the **Completed _n_ times** pill unchanged.
- Keep one outlined **Latest score _n_%** pill and render the trend mark within that same pill, immediately after the score text.
- Reuse the dashboard's exact trend semantics and accessible labels: upward green triangle for `increase`, downward red triangle for `decrease`, horizontal line for `unchanged`, and no indicator when fewer than two comparable attempts exist.
- Calculate a quiz trend from that quiz's two most recent completed attempts, using the existing timestamp-based `scoreTrend` helper rather than array order.
- Protect against capped or legacy history: show a trend only when the most recent attempt available in completed history matches the repository's persisted latest score and completion timestamp. Otherwise show the latest score without a trend.
- Remove `lowestScore` from the subject-screen `QuizProgress` view model and stop querying it while building quiz cards.
- Keep `AttemptRepository.lowestScore`, its persisted data, and related analytics/tests intact. This is a presentation change, not a storage migration or data deletion.
- Do not change quiz ordering, attempt persistence, dashboard summary behavior, scoring, or canonical question content.

## Implementation plan

### 1. Share the existing trend presentation

- [x] Move `ScoreTrendIndicator` from `DashboardScreen.tsx` into `src/app/components/ScoreTrendIndicator.tsx`.
- [x] Preserve its `ScoreTrend` input, visual shapes/colors, `role="img"`, and descriptive accessible labels exactly.
- [x] Update `DashboardScreen` to import the shared component with no visible or behavioral change.

### 2. Add per-quiz trend data

- [x] Replace `QuizProgress.lowestScore` with an optional `trend: ScoreTrend` field in `SubjectScreen.tsx`.
- [x] In `App.progressForSubject`, read the persisted latest score once for each quiz.
- [x] Filter `session.completedAttempts` to the current quiz and derive its most recent completed attempt plus `scoreTrend` from the existing analytics helpers.
- [x] Populate `trend` only when the history's most recent score matches the persisted latest score in both percentage and `completedAt`; otherwise leave it undefined.
- [x] Stop calling `attemptRepository.lowestScore` for subject quiz cards, while retaining the repository method and stored summaries.

### 3. Update the quiz-card score pill

- [x] Remove the lowest-score chip from `SubjectScreen`.
- [x] Change the latest-score chip label from plain text to a compact inline layout containing **Latest score _n_%** and the shared trend indicator.
- [x] Keep the indicator inside the outlined chip and vertically centered with restrained spacing.
- [x] Preserve current wrapping and card actions at narrow widths; the completion and latest-score pills may wrap as a unit when space is limited.
- [x] Continue omitting the latest-score pill when no latest score exists, and omit only the indicator when there is no prior comparable attempt.

### 4. Add regression coverage

- [x] Update `SubjectScreen.test.tsx` fixtures to use `trend` instead of `lowestScore`.
- [x] Verify a completed quiz shows its completion-count and latest-score pills but never renders a lowest-score label.
- [x] Add cases for increase, decrease, and unchanged indicators beside the latest score, using the same accessible names as the dashboard.
- [x] Verify no trend indicator appears after only one completion or when trend history is unavailable.
- [x] Keep the existing dashboard trend tests passing after extracting the shared component.
- [x] Rely on the existing `scoreTrend` unit coverage for timestamp ordering and increase/decrease/unchanged calculation.

### 5. Update documentation and verify

- [x] Update `docs/product.md` so subject quiz cards are documented as showing completion count, latest score, and an optional latest-versus-previous trend; remove the separate lowest-score behavior.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
- [x] Browser-check the available completed quiz card: its latest-score pill has the increase indicator and no lowest-score pill. Automated coverage verifies decrease, unchanged, and no-trend states.
- [x] Confirm dashboard trend indicators remain visually and accessibly unchanged through the existing regression tests.
- [x] Record results, mark this tracker complete, and move it to `docs/work/done`.

## Verification

- `npm test` — passed (74 tests)
- `npm run build` — passed
- `git diff --check` — passed
- Browser verification — the subject card showed **Latest score 1%** with the accessible increase indicator and no lowest-score pill.

## Acceptance criteria

- Subject-screen quiz cards never display a lowest-score pill.
- A completed quiz card continues to show **Completed _n_ time/times** and **Latest score _n_%**.
- When two comparable attempts exist, the latest-score pill includes the same accessible trend indicator used on dashboard subject cards.
- Increase, decrease, and unchanged states use the established green triangle, red triangle, and horizontal-line presentation.
- With one completion or incomplete retained history, the latest score appears without a misleading indicator.
- Existing quiz ordering, resume/start/retake actions, dashboard analytics, and stored attempt summaries are unchanged.
- Automated tests and the production build pass, with no canonical content changes.

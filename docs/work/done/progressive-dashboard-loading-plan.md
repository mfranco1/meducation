# Progressive dashboard and subject loading

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

Status: complete. Dashboard statistics, progressive content loading, shimmer, bounded retries, and the simplified failure presentation are implemented and verified.
Created: 2026-10-02.
Updated: 2026-10-02.

## Recommendation and current behavior

Render the app shell immediately, fetch a lightweight subject catalog for the dashboard, fetch a subject's quiz catalog when selected, and fetch questions when a quiz is opened. This reduces startup requests and lets each screen show useful content while its own data loads.

Before the initial implementation, default API startup waited for subjects and every subject's quiz catalog before mounting `App`. The app now mounts before fetching subjects, and quiz catalogs load on subject selection. The subject response includes quiz membership so dashboard statistics update as soon as that one request completes. The client rejects an older, incomplete response rather than waiting for a subject click. The explicit local-content mode imports the full JSON adapter.

The backend loads the canonical JSON and caches its revision once per snapshot. Fetches use a 15-second timeout through response-body reading. Each screen now distinguishes loading from failure, removes skeletons on error, and presents a section-specific retry. Loading placeholders shimmer unless reduced motion is requested.

## Boundaries

- Keep JSON authoritative and preserve content, provenance, IDs, and canonical ordering.
- Keep attempts, scores, timers, history, and activity in browser localStorage behind the existing repository abstraction.
- Keep quiz/scoring rules synchronous and independent from network loading and React presentation.
- Keep the root `.venv` and current backend runtime/dependency setup.
- Preserve API revision checks, explicit local development mode, and the separate QA/admin workflows.
- Do not introduce Postgres, authentication, persistence migration, or speculative prefetching in this change.

## Target loading flow

1. Mount the header, dashboard layout, section headings, and locally available statistics without waiting for HTTP responses.
2. Start one deduplicated `/api/v1/subjects` loading operation. Replace subject skeletons with cards and calculated subject progress when this response arrives. Only transient failures may cause additional HTTP attempts under the bounded retry policy below.
3. On subject selection, navigate immediately. Show the subject title and back navigation while fetching only `/api/v1/subjects/{id}/quizzes`.
4. On start, resume, or Browse Answers, fetch only that quiz's questions, with visible loading feedback before entering the content screen.
5. Reuse successful content in memory for the current bank revision. Revisiting a loaded subject or quiz does not repeat its request.
6. If a request fails transiently or times out, retry automatically with bounded exponential backoff while keeping the affected shimmer skeletons visible. Do not add reconnecting copy. Once retries are exhausted, or the failure is not retryable, replace that resource's placeholders with a simple section-specific message and action. Manual Retry starts a new bounded loading operation; successful sections remain usable.

### Automatic retry policy

Use one content-client policy for subjects, quiz catalogs, and questions. Keep the existing 15-second timeout for each individual HTTP attempt, including response-body reading. Backoff waiting is separate from that timeout.

- Default to **3 automatic retries after the initial attempt**, for at most 4 HTTP attempts per loading operation. Setting the limit to `0` disables automatic retries.
- Configure the policy through `VITE_CONTENT_MAX_RETRIES` (default `3`, integer `0`–`5`), `VITE_CONTENT_RETRY_BASE_DELAY_MS` (default `1000`), and `VITE_CONTENT_RETRY_MAX_DELAY_MS` (default `8000`). Read and validate these once in a typed configuration module. Require positive, finite delay values, base no greater than maximum, and maximum no greater than 30 seconds. Invalid settings use documented defaults and produce a developer log. These are build-time settings; changing them requires restarting Vite or rebuilding.
- For retry number `n`, starting at `1`, calculate `ceiling = min(maxDelayMs, baseDelayMs * 2^(n - 1))`. Wait a random duration between half that ceiling and the ceiling to spread concurrent retries. With default settings, the delay ranges are 0.5–1, 1–2, and 2–4 seconds. Inject timing/randomness for deterministic tests.
- Retry network failures, request timeouts, and HTTP `408`, `429`, `500`, `502`, `503`, and `504`. Do not automatically retry other HTTP failures, malformed or incomplete content, or revision conflicts. Revision conflicts retain the explicit Reload content action.
- Honor a valid `Retry-After` header on `429` or `503`, using the later of the indicated delay and the calculated backoff. If the indicated delay exceeds the configured maximum, stop automatic retries and show the terminal message rather than sending a request too early. Support both seconds and HTTP-date values; invalid values fall back to backoff.
- Keep one shared in-flight operation per resource across requests and backoff waits. Subjects and statistics share one operation and budget. Repeated clicks, subscriptions, and StrictMode must not create independent retry chains.
- Stop on success, exhaustion, a nonretryable failure, or cancellation. Manual Retry creates a fresh budget only after the previous operation settles; it reuses successful caches and never starts an automatic loop after exhaustion.

### Failure presentation

Replace the current failure component's outer Card/CardContent with an unframed, reusable message group. It may appear inside an existing stat or quiz card, or directly within a section. Use a short heading, muted explanatory sentence, and a small text-style action in the theme's primary accent. Use existing typography and spacing; add no error panel background, border, shadow, large illustration, or nested card.

Final messages should identify the affected content: “Unable to load subjects”, “Unable to load statistics”, “Unable to load quizzes”, or “Unable to load questions”. Use calm copy such as “Please try again or come back later.” For network failures, “Check your connection and try again.” is appropriate; for exhausted timeouts, “This is taking longer than expected. Please try again later.” is appropriate. Use Retry for recoverable failures and Reload content for a revision conflict.

During automatic retries, keep the affected shimmer skeletons visible so they communicate that loading is still in progress. Do not add reconnecting copy or flash terminal failure messages between attempts. Keep the local completed count, section titles, and navigation available. Do not show attempt counters or countdowns in the learner UI.

Never render raw `Error.message`, HTTP status codes, exception names, URLs, response bodies, stack traces, or instructions to restart/update the backend. Map typed failure categories to approved user copy. Preserve technical detail in structured developer logs only: resource type, API path without sensitive query values, failure category/status, attempt number, next delay, and whether the retry budget was exhausted. Do not log question content or saved learner data.

### Statistics dependency

Completed count can render immediately from retained local completed attempts. Preserve its existing meaning rather than changing it to a lifetime count.

Average and lowest scores are stored locally, but their current aggregation depends on canonical quiz-to-subject membership. The average is the equal-weighted average of each subject's latest score; lowest-score ties use the most recent completion. Retained history alone is insufficient because durable per-quiz score summaries survive history pruning.

Extend the subject response with derived `quizCount` and `quizIds` for each subject. These small membership lists let the dashboard join existing local summaries accurately without quiz names, question counts, ordered question IDs, or question text. This is an API projection, not a canonical JSON schema change.

Render the stat-card labels and completed count immediately. Show skeletons for average/lowest values and subject labels until the membership response is available. If local summaries prove that there are no scores or active attempts, show the existing no-score state and omit Continue studying immediately. Do not substitute zero for unknown values or infer statistics from incomplete history. Persisting a catalog cache to make every statistic available offline is optional future work, outside this plan.

## Stage 1 — Lightweight dashboard catalog and backend snapshot

- [x] Add response-only subject summary fields `quizCount` and `quizIds`, derived through the JSON repository in canonical quiz order.
- [x] Compute the bank revision once during snapshot loading, preserving the existing deterministic hash and ETag contract.
- [x] Preserve existing subject identity fields and revision validation on later catalog/question requests.
- [x] Refactor dashboard selectors to consume subject summaries and the existing attempt repository, without requiring loaded quiz records.
- [x] Preserve active-subject ordering, latest-score aggregation, lowest-score ties, and history-pruning behavior.

Acceptance: one subject response contains enough information for all dashboard cards and statistics, with no ordered question IDs or full quiz catalogs.

## Stage 2 — Explicit reactive loading state

- [x] Add `ensureSubjects()` and `ensureQuizzes(subjectId)` beside the existing `ensureQuestions(quizId)`.
- [x] Track `idle`, `loading`, `ready`, and `error` separately for the subject catalog and each subject/quiz resource. Distinguish unloaded from a successfully loaded empty list.
- [x] Deduplicate in-flight requests and retain successful data in revision-scoped memory caches. Failed requests remain retryable.
- [x] Make content updates observable by React through a small subscription adapter using `useSyncExternalStore`, with stable immutable snapshots. Keep repository query methods available to domain/session consumers.
- [x] Ensure selector memoization responds to content snapshots, rather than relying on navigation to trigger recalculation.
- [x] Reject mismatched revisions and prevent responses from an obsolete loading generation from overwriting current caches.

Acceptance: content resolves and updates the current screen without navigation, duplicate requests, or false empty states. React StrictMode does not double-fetch a resource.

## Stage 3 — Immediate dashboard rendering

- [x] Mount `App` without awaiting backend content; start subject loading after mount. Download the app module independently of content requests.
- [x] Keep the stationary header, stat-card structure, and All Subjects heading visible while loading.
- [x] Add MUI skeletons that match subject cards and dependent stat values, reserving space to limit layout movement.
- [x] Reserve a Continue studying placeholder only when local active attempts exist and subject membership is unresolved; preserve the existing hide-empty behavior after resolution.
- [x] Show an inline catalog error with Retry in the affected area. Keep the app shell and available local statistics mounted on backend failure.
- [x] Mark loading regions with `aria-busy`, provide a concise accessible loading status, keep decorative skeletons unfocusable, and disable skeleton animation for reduced motion.
- [x] Keep explicit local mode and content QA working without adding canonical JSON to the default API production bundle.

Acceptance: with the subject request deliberately held pending, the header, dashboard structure, and completed count are visible. Dashboard entry makes no quiz-catalog or question requests.

## Stage 4 — Load quiz catalogs on subject selection

- [x] Navigate to the selected subject immediately, retaining its title and back control while quiz cards use skeletons.
- [x] Fetch only the selected subject's catalog with the current revision. Calculate quiz progress and ordering when its catalog arrives.
- [x] Preserve setup-dialog behavior, recent-activity ordering, never-used canonical ordering, and resumed current-question positions.
- [x] Provide subject-scoped error/retry and genuine empty states without replacing the whole app.
- [x] Guard late navigation callbacks: selecting another subject or returning to Dashboard during loading must not redirect the user when the old request completes. A valid response may still populate its cache.

Acceptance: opening one subject fetches one quiz catalog; opening it again uses its cache. Back navigation remains available during loading and failure.

## Stage 5 — Visible quiz loading and revision recovery

- [x] Retain question fetching on start/resume/browse, but expose its pending state and prevent conflicting launches while it is pending.
- [x] Do not create an attempt, run its timer, or enter a question-dependent screen until valid questions are available.
- [x] Ignore a pending launch's navigation action if the user leaves that subject or cancels the action before it finishes.
- [x] Keep Browse Answers free of attempt writes and activity updates, including on loading failure.
- [x] On a revision conflict, offer an explicit content reload that clears incompatible catalog caches and reloads subjects. Do not silently switch an active quiz's content or discard local attempts.

Acceptance: slow or failed question requests have visible feedback, leave local state intact, and cannot navigate the user from a newer selection.

## Stage 6 — Verification and documentation

- [x] Add fixture-based backend coverage for subject counts/membership, canonical order, stable cached revision, ETags, and conflicts.
- [x] Cover subject-first loading, selected-subject catalog loading, in-flight deduplication, question caching, and revision mismatch with frontend tests.
- [x] Verify dashboard statistics before/after loading, legacy browser records, durable summaries after history pruning, removed quiz membership, lowest-score tie handling, and active-subject ordering through focused tests.
- [x] Verify loading failures do not create attempts or alter scores or persisted progress; session tests cover timers and browsing activity, and navigation cancellation tests cover stale question launches.
- [x] Verify loading boundaries with pending-request integration tests and a live desktop browser smoke test against the JSON backend: shell and local count render immediately, dashboard loads subject metadata, and catalogs/questions remain lazy.
- [x] Check responsive layout rules, keyboard-operable semantic buttons and focus styling, reduced-motion skeletons, simulated backend outage/recovery, and explicit local mode through component/runtime tests. Browser and accessibility-tree smoke test confirmed the desktop catalog renders.
- [x] Run `npm test`, `npm run build`, and `npm run validate:content`; run backend pytest, Ruff, and mypy using the root `.venv` per `docs/testing.md`.
- [x] Update architecture, product loading behavior, design-system skeleton guidance, and testing documentation.

The loading flow is covered by controlled pending/failure/recovery tests and a live desktop browser smoke test. This change makes no measured transfer-size claim, so before/after transfer measurement is outside acceptance.

## Stage 7 — Fix automatic dashboard statistics loading

- [x] Reproduce the reported issue on a fresh dashboard visit with saved local progress, without clicking a subject. Inspect the subject API response, runtime summary hydration, repository subscription, and selector dependencies.
- [x] Confirm the running backend supplies `quizCount` and `quizIds` for every subject. Check for an older backend response or missing membership fields; treat these as possible causes until reproduced.
- [x] Ensure dashboard mount automatically requests all metadata needed to calculate dashboard statistics. Prefer the existing lightweight subject summary response; keep detailed quiz catalogs and questions lazy.
- [x] Validate required summary fields at the API boundary. Missing membership must produce a recoverable catalog/statistics error instead of silently displaying empty progress or zero quiz counts.
- [x] Recompute average, lowest score and subject label, subject latest scores, and Continue studying as soon as valid summaries arrive. No card click or navigation event should be required.
- [x] Use durable local per-quiz summaries and canonical membership to preserve aggregation, tie-breaking, removed-quiz filtering, and history-pruning behavior. The API supplies content metadata; scores remain local.
- [x] Keep completed count immediately visible. If summary metadata fails, show a statistics failure state in dependent cards and a subjects failure state in the subject section. Both may share one deduplicated catalog retry.

Acceptance: with local progress across multiple subjects, dashboard statistics resolve for all subjects after the initial summary request, before any subject is selected. The dashboard requests no detailed quiz catalogs or questions. An incomplete response cannot masquerade as an empty study history.

## Stage 8 — Add consistent skeleton shimmer

- [x] Introduce a shared skeleton presentation using MUI `animation="wave"` for dependent stat values, subject cards, Continue studying, and quiz cards.
- [x] Use the warm theme's neutral surfaces and restrained shimmer contrast. Preserve real card dimensions, spacing, and border radii to limit layout movement.
- [x] Respect `prefers-reduced-motion` by disabling shimmer for those users, while keeping static placeholders visible.
- [x] Keep skeletons decorative and unfocusable, with a concise loading status and `aria-busy` on the affected section.
- [x] Render skeletons for `idle`, `loading`, and automatic `retrying` resources. Successful empty data and terminally failed requests have their own presentations.

Acceptance: all loading placeholders use the same shimmer treatment. Reduced-motion users see static placeholders. Shimmer stops when a resource succeeds or fails.

## Stage 9 — Finish timeout and section failure handling

- [x] Centralize the existing 15-second request timeout in the content client and apply it consistently to subject metadata, quiz catalogs, and quiz questions. Keep the timeout active through response-body reading, and clear timeout resources when the operation settles.
- [x] Distinguish timeout, network failure, HTTP error, malformed response, and revision conflict internally. Present understandable section-specific text rather than raw browser exceptions.
- [x] Explicitly handle `idle`, `loading`, `ready`, and `error` in each screen. A timeout transitions to `error`, removes skeletons/progress indicators, and releases in-flight request guards.
- [x] Build the initial reusable failure card and primary Retry button. Stage 12 supersedes this presentation with an unframed message group and text-style action.
- [x] Use headings such as “Failed to load subjects”, “Failed to load statistics”, “Failed to load quizzes”, and “Failed to load questions”. For timeouts, explain “The request took too long. Try again or come back later.”
- [x] Place failures where the missing content belongs: subject grid, dependent stat cards, selected subject's quiz list, or the pending quiz launch area. Keep titles, local completed count, and back/home navigation usable.
- [x] Retry only the failed dependency with a fresh request and timeout. Clear its previous error, restore its loading presentation, deduplicate repeated clicks, and reuse other successful caches. A shared subject/statistics dependency must not produce duplicate requests.
- [x] Keep revision conflicts on the explicit `Reload content` path rather than repeatedly retrying an incompatible revision. Preserve local attempts during recovery.
- [x] Ignore obsolete completions and errors after navigation or a newer request generation. A failed or timed-out question request must not start an attempt, run its timer, update activity, or launch a stale selection.
- [x] Initially avoid automatic retry loops. Stage 11 supersedes this policy with bounded automatic retries; unlimited retry loops remain prohibited.

Initial acceptance: a backend request that never finishes shows the appropriate failure message after 15 seconds, with no remaining skeleton for that resource. Stages 11–13 refine this to a 15-second deadline per attempt, persistent shimmer during bounded retries, and a final failure once the retry budget is exhausted. Failures in one resource do not blank the app or mutate local progress.

## Stage 10 — Follow-up verification and documentation

- [x] Add a dashboard integration case with persisted scores across multiple subjects: hold the summary request pending, resolve it, and verify every statistic without subject clicks or quiz-catalog requests.
- [x] Cover incomplete summary responses, durable scores after history pruning, removed quizzes, and lowest-score ties.
- [x] Use controlled requests and timers to verify subject/statistics, quiz, and question timeouts; assert final failure presentation and fresh retry recovery.
- [x] Cover immediate network/HTTP failures, malformed responses, deduped retry operations, and revision conflicts using the shared failure presentation.
- [x] Verify shimmer with normal motion preferences and static placeholders with reduced motion. Check loading/error announcements and keyboard-operable Retry actions.
- [x] Verify a question request canceled through app navigation cannot create an attempt or enter the quiz after late completion. Direct attempt/timer state remains unchanged because launch callbacks run only after content resolves and the navigation generation still matches.
- [x] Complete the pending-request, live desktop browser smoke, mobile/desktop responsive styling, local-mode, and outage/recovery checks from Stage 6. No transfer-size improvement is claimed, so transfer measurement is not required.
- [x] Run relevant frontend/backend tests, type-check/build, and static checks; update architecture, design, product, and testing documentation to describe the final behavior.
- [x] Move this tracker to `docs/work/done` after the follow-up implementation, new Stages 11–13, and verification are complete.

## Stage 11 — Bounded automatic loading retries

- [x] Add the typed, validated retry configuration described above and document the environment variables in the existing development configuration example.
- [x] Centralize retry classification, exponential backoff with jitter, and Retry-After handling in the content client. Apply them to subjects, quiz catalogs, and questions without changing domain or persistence logic.
- [x] Keep a 15-second deadline per HTTP attempt. Clear each attempt's timeout before scheduling another attempt; make backoff waits cancellable and release timer/request resources when the operation settles.
- [x] Expose an observable retrying phase within the existing resource loading model, including question launches, so React updates during backoff without treating it as a final error or a successful empty result.
- [x] Keep deduplication guards active throughout retries and waiting. Use one catalog operation for both subjects and statistics; manual Retry cannot overlap a pending automatic retry.
- [x] Cancel abandoned question-launch retry chains on navigation. Prevent canceled requests from updating caches or deleting a newer operation's guards.
- [x] Keep quiz attempts, timers, scores, and activity unchanged until valid questions load and the current launch is still selected.
- [x] Log technical failures and retry decisions with sanitized resource paths and no response content.

Acceptance: a transient failure can recover automatically within the configured budget. Defaults allow no more than 4 HTTP attempts per operation; `0` retries performs exactly one attempt. Exhaustion stops all retry timers and exposes manual Retry. Successful cached resources are not fetched again.

## Stage 12 — Simple, professional failure and retry loading states

- [x] Refactor `ContentLoadFailure` into an unframed message group that works inside an existing card or directly in a section. Remove its Card/CardContent wrapper.
- [x] Use the existing warm theme, compact typography, muted supporting text, and a primary text-style Retry/Reload content action with visible keyboard focus and an adequate touch target.
- [x] Keep each affected shimmer skeleton visible during automatic retry waits, with no additional reconnecting copy. Retain section structure and avoid displaying final failures until retries stop.
- [x] Map typed failure categories to approved, section-specific copy. Remove direct rendering of error messages and all learner-facing error codes or backend/development instructions.
- [x] Apply the same treatment to dependent dashboard statistics, the subjects section, the selected subject's quiz list, and question launches. Preserve unrelated successful content and local completed statistics.
- [x] Use an accessible busy/status label on the shimmer region and a concise alert for final failure. Avoid repeated announcements, focus movement, and nested alert regions. Keep Retry keyboard accessible.

Acceptance: all resources use the same restrained message/action treatment, with no added failure cards. A backend response such as HTTP 503 is visible only in developer logs; the learner sees approved copy. Shimmer remains visible through retries without reconnecting text. Navigation remains available during retries and failure.

## Stage 13 — Retry and failure verification

- [x] Use fake timers and injected randomness to verify configured attempt limits, `0` retries, delay doubling/capping/jitter, invalid configuration, and per-attempt timeout/body-reading behavior.
- [x] Verify retryable network/HTTP failures, immediate termination for nonretryable or malformed responses, revision-conflict reload behavior, and Retry-After seconds/date/invalid/excessive values.
- [x] Test recovery during an automatic retry, exhaustion, fresh manual budgets, shared catalog deduplication, and cache reuse. Assert no requests occur after the budget stops.
- [x] Test cancellation during backoff and navigation, then verify an obsolete question response cannot populate the question cache, create an attempt, or navigate into the quiz.
- [x] Add presentation tests for shimmer persistence during retry, final failure replacement, absence of reconnecting copy, simple layout, and consistent Retry/Reload content actions.
- [x] Feed representative HTTP codes, raw exception messages, and backend instructions into the failure flow. Assert details are absent from rendered UI and raw exception details are absent from logs.
- [x] Verify responsive styling, reduced motion, keyboard-operable actions and focus styling, loading announcements, and backend outage/recovery through live desktop smoke coverage plus deterministic component/runtime tests.
- [x] Run relevant frontend tests and production type-check/build; update architecture, product, design, testing, and configuration documentation.

Acceptance: retry behavior is deterministic under tests, bounded in the browser, and free of stale navigation or persistence side effects. Final messages are clean, accessible, and contain no technical diagnostics.

## Implementation references

Verification on 2026-10-02: 174 frontend tests, production type-check/build, question-bank validation, Ruff, mypy, and 4 backend tests passed. The retry tests cover configurable limits, exponential delay and jitter, Retry-After, network/HTTP failures, timeout through body reading, deduplication, exhaustion, manual retry, cancellation, and safe learner-facing copy. Focused tests cover legacy localStorage, history pruning, removed quiz membership, lowest-score ties, reduced motion, local mode, retry shimmer, and no local progress writes after question-loading failure. A live desktop browser smoke test confirmed the API-backed dashboard rendered its subject catalog.

Primary files: `src/main.tsx`, `src/content/runtimeQuestionBank.ts`, `src/app/App.tsx`, `src/app/progress.ts`, dashboard/subject screens and cards, and `backend/src/meducation_api/main.py` plus its JSON repository.

Use the existing MUI Skeleton component for placeholders ([official documentation](https://mui.com/material-ui/react-skeleton/)). Use React's external-store subscription contract for the runtime repository adapter, including stable snapshots ([official documentation](https://react.dev/reference/react/useSyncExternalStore)). Neither requires a new dependency or framework migration.

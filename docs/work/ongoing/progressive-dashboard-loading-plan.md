# Progressive dashboard and subject loading

Status: dashboard statistics, shimmer, and timeout/error recovery implemented. Automated checks and live outage/retry verification passed; remaining browser and accessibility checks are tracked below.
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
2. Request `/api/v1/subjects` once. Replace subject skeletons with cards and calculated subject progress when this response arrives.
3. On subject selection, navigate immediately. Show the subject title and back navigation while fetching only `/api/v1/subjects/{id}/quizzes`.
4. On start, resume, or Browse Answers, fetch only that quiz's questions, with visible loading feedback before entering the content screen.
5. Reuse successful content in memory for the current bank revision. Revisiting a loaded subject or quiz does not repeat its request.
6. If a request fails or times out, replace that resource's placeholders with a section-specific failure state. Retry loads that resource again with a fresh timeout; successful sections remain usable.

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
- [ ] Verify dashboard statistics before/after loading, legacy browser records, durable summaries after history pruning, removed quiz membership, and active-subject ordering. The before/after, durable-summary, removed-quiz, and active-order cases have automated coverage; legacy records remain to check.
- [ ] Verify loading failures do not create attempts or alter scores, timers, browsing activity, or persisted progress.
- [ ] Inspect the real browser under throttled networking: shell before response, one dashboard catalog request, one catalog per newly selected subject, and one question request per newly opened quiz.
- [ ] Check mobile/desktop skeleton dimensions, keyboard navigation, reduced motion, backend unavailable/recovery, and explicit local mode.
- [x] Run `npm test`, `npm run build`, and `npm run validate:content`; run backend pytest, Ruff, and mypy using the root `.venv` per `docs/testing.md`.
- [x] Update architecture, product loading behavior, design-system skeleton guidance, and testing documentation.

Browser throttling, responsive accessibility, backend outage/recovery, legacy summary-pruning behavior, failure side effects, and before/after transfer measurements remain follow-up verification. Move this tracker to `docs/work/done` after those checks are complete.

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
- [x] Render skeletons only for `idle` resources about to be requested and actively `loading` resources. Successful empty data and failed requests have their own presentations.

Acceptance: all loading placeholders use the same shimmer treatment. Reduced-motion users see static placeholders. Shimmer stops when a resource succeeds or fails.

## Stage 9 — Finish timeout and section failure handling

- [x] Centralize the existing 15-second request timeout in the content client and apply it consistently to subject metadata, quiz catalogs, and quiz questions. Keep the timeout active through response-body reading, and clear timeout resources when the operation settles.
- [x] Distinguish timeout, network failure, HTTP error, malformed response, and revision conflict internally. Present understandable section-specific text rather than raw browser exceptions.
- [x] Explicitly handle `idle`, `loading`, `ready`, and `error` in each screen. A timeout transitions to `error`, removes skeletons/progress indicators, and releases in-flight request guards.
- [x] Build one reusable failure presentation using the existing MUI theme: a warm neutral card, clear heading, brief explanation, and a consistently styled primary `Retry` button with visible focus treatment. Avoid custom colors or unrelated retry styles per screen.
- [x] Use headings such as “Failed to load subjects”, “Failed to load statistics”, “Failed to load quizzes”, and “Failed to load questions”. For timeouts, explain “The request took too long. Try again or come back later.”
- [x] Place failures where the missing content belongs: subject grid, dependent stat cards, selected subject's quiz list, or the pending quiz launch area. Keep titles, local completed count, and back/home navigation usable.
- [x] Retry only the failed dependency with a fresh request and timeout. Clear its previous error, restore its loading presentation, deduplicate repeated clicks, and reuse other successful caches. A shared subject/statistics dependency must not produce duplicate requests.
- [x] Keep revision conflicts on the explicit `Reload content` path rather than repeatedly retrying an incompatible revision. Preserve local attempts during recovery.
- [x] Ignore obsolete completions and errors after navigation or a newer request generation. A failed or timed-out question request must not start an attempt, run its timer, update activity, or launch a stale selection.
- [x] Avoid automatic retry loops. Keep Retry available for transient failures and include the option to return later in explanatory text.

Acceptance: a backend request that never finishes shows the appropriate failure message after 15 seconds, with no remaining skeleton for that resource. Retry can recover after the backend becomes available. Failures in one resource do not blank the app or mutate local progress.

## Stage 10 — Follow-up verification and documentation

- [x] Add a dashboard integration case with persisted scores across multiple subjects: hold the summary request pending, resolve it, and verify every statistic without subject clicks or quiz-catalog requests.
- [ ] Cover incomplete summary responses, durable scores after history pruning, removed quizzes, and lowest-score ties.
- [ ] Use controlled requests and timers to verify subject/statistics, quiz, and question timeouts; assert placeholders disappear, appropriate failure text appears, and Retry sends one fresh request and recovers.
- [ ] Cover immediate network/HTTP failures, malformed responses, repeated retry clicks, and revision conflicts using the same failure presentation.
- [ ] Verify shimmer with normal motion preferences and static placeholders with reduced motion. Check loading/error announcements and keyboard access to Retry.
- [ ] Verify pending question requests cannot create or change attempts on failure, timeout, cancellation through navigation, or late completion.
- [ ] Complete the outstanding throttled-browser, mobile/desktop, local-mode, and outage/recovery checks from Stage 6. Record request counts and transfer measurements before claiming a performance improvement.
- [x] Run relevant frontend/backend tests, type-check/build, and static checks; update architecture, design, product, and testing documentation to describe the final behavior.
- [ ] Move this tracker to `docs/work/done` after the follow-up implementation and verification are complete.

## Implementation references

Verification on 2026-10-02: 155 frontend tests, production type-check/build, and 4 backend tests passed. The client tests cover a stalled subject request and response body, quiz and question timeouts, retries, invalid membership, and cached statistics before any subject selection. A live browser session confirmed that the dashboard requests only subjects until a subject is opened, and that an unavailable backend produces section failures that recover through Retry. Throttled transfer measurements and the remaining manual responsive/accessibility checks are still pending, so this tracker remains ongoing.

Primary files: `src/main.tsx`, `src/content/runtimeQuestionBank.ts`, `src/app/App.tsx`, `src/app/progress.ts`, dashboard/subject screens and cards, and `backend/src/meducation_api/main.py` plus its JSON repository.

Use the existing MUI Skeleton component for placeholders ([official documentation](https://mui.com/material-ui/react-skeleton/)). Use React's external-store subscription contract for the runtime repository adapter, including stable snapshots ([official documentation](https://react.dev/reference/react/useSyncExternalStore)). Neither requires a new dependency or framework migration.

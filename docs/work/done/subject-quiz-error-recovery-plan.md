# Subject quiz catalog error recovery

Status: complete. Implementation, automated tests, production build, and browser verification pass.

## Intended behavior

When a subject's quiz catalog cannot be fetched, show one full-width recovery banner immediately below the app header. Keep All subjects navigation, the subject name, and the existing four rounded, 92px-high warm shimmer skeletons visible. Match the corrected dashboard treatment: existing loader colors, wave animation, spacing, and rounded icons; reduced motion disables shimmer.

The banner should say “We can’t load quizzes for this subject right now.” and provide the existing bordered recovery button. During automatic backoff, show the real countdown. During an active recovery request, show “Retrying…”. After the bounded retry budget ends, show manual Retry. A revision conflict offers Reload. Recovery replaces placeholders with the subject's real quiz cards and removes the banner.

This work concerns the subject quiz-list request. Question-loading failures after Start, Resume, or Browse continue to use their existing launch recovery flow.

## Existing code

- `src/app/screens/SubjectScreen.tsx` renders the subject heading and navigation, then chooses between `ContentLoadFailure`, four `LoadingSkeleton` rows, and quiz cards. Final catalog failure currently removes the skeleton list.
- `src/content/runtimeQuestionBank.ts` owns `ensureQuizzes(subjectId)`, per-subject resource state, errors, retry counts, request deduplication, and generation guards. It currently discards the retry delay and does not expose active-attempt transitions for quiz catalogs.
- `src/app/App.tsx` selects the subject, starts its catalog request, and supplies the screen's data and callbacks. Its existing retry callback handles revision conflicts with a page reload.
- `SharedFailureBanner` and `useRetrySeconds` currently live inside `DashboardScreen.tsx`. The transport already reports retry delays and attempt starts, and supports advancing a pending backoff.
- Quiz cards derive saved progress through `quizProgressForSubject`; fetching a catalog must never create, reset, or modify an attempt.

## Step 1 — Extract the existing banner for reuse

- [x] Move the dashboard banner and its countdown helper into `src/app/components/ContentRecoveryBanner.tsx`.
- [x] Accept learner-safe title/supporting copy, recovery phase, retry deadline, Retry-After minimum, and callback. Keep request scheduling in the runtime layer.
- [x] Retain the full-width outer surface and inner `Container maxWidth="lg"` used by the header/dashboard banner. Render it before the subject's existing `Container maxWidth="md"`, preserving that container's normal padding.
- [x] Keep the current dashboard's wording, action labels, colors, icons, and behavior when moving it to the shared component. Use the current working tree as the reference, including any user changes made since the dashboard implementation.

Acceptance: both screens use the same banner presentation, and the banner's top edge touches the header's bottom edge with no content-container gutter around its background.

## Step 2 — Expose recovery state per subject

- [x] Add observable quiz-catalog recovery metadata keyed by subject ID: whether a failure has occurred in the current recovery cycle, the next retry deadline, and whether a retry request is currently running.
- [x] In `ensureQuizzes`, use transport retry/attempt notifications to store `Date.now() + delayMs`, and clear the deadline when the next request starts.
- [x] Keep the failure/recovery marker through automatic attempts and manual retries until success, so the banner remains mounted throughout recovery instead of disappearing between requests.
- [x] Clear metadata when the subject catalog becomes ready or the runtime is reconfigured. Terminal failure retains its safe error but clears its scheduled deadline.
- [x] Publish state changes through the existing runtime subscription. Preserve per-subject request deduplication, caching, generation guards, timeout, and bounded retry policy.
- [x] Expose an operation-scoped backoff action. Advance only the selected subject's pending retry, consume the existing budget, and deduplicate repeated clicks. Respect server Retry-After minimums; active requests must not start a second operation.

Acceptance: the countdown describes the actual pending attempt; two subject loads cannot share or overwrite each other's recovery state. After exhaustion there is no countdown or hidden endless retry loop.

## Step 3 — Wire the subject's recovery in App

- [x] Read the selected subject's catalog state, error, and recovery metadata once near the other composition data in `App.tsx`.
- [x] Pass those values and a subject-scoped recovery callback into `SubjectScreen`.
- [x] Handle the callback according to phase: reload for revision conflict, advance an eligible pending backoff, ignore clicks while a request is running, or call `ensureQuizzes(subjectId)` for a fresh manual retry after terminal failure.
- [x] Keep the currently selected subject authoritative. Late responses remain scoped to their subject and cannot replace the current UI or banner.
- [x] Keep back navigation available during requests and failures. Returning to the dashboard removes the subject banner; returning to the subject shows the current state of its existing operation/cache.

Acceptance: recovery targets only the requested subject and uses the existing endpoint; it does not refetch loaded dashboard subjects or launch questions.

## Step 4 — Preserve the subject layout through errors

- [x] Render the shared banner outside and above the subject content container whenever its catalog has a recovery cycle or terminal error.
- [x] Replace the quiz-catalog inline `ContentLoadFailure` branch with the same four-row `LoadingSkeleton` list used during initial loading. Keep `variant="rounded"`, height 92, Stack spacing 2, warm tone, and wave animation.
- [x] Render the same placeholder list during initial loading, retry waits, active recovery requests, and terminal failure. Use busy semantics only when a request or scheduled retry is pending; terminal error remains a failure despite the decorative shimmer.
- [x] Show the successful empty-state message only when the catalog has loaded and contains no quizzes.
- [x] Preserve subject heading/back-button geometry and successful quiz-card controls, progress summaries, score trends, setup-dialog behavior, and ordering.

Acceptance: quiz fetch failure produces one banner and retains the existing loader footprint; no duplicate “Unable to load quizzes” block appears in the list.

## Step 5 — Accessibility and safe copy

- [x] Use the existing MUI cloud-off/refresh rounded icons and a native outlined recovery button with visible focus and a comfortable touch target.
- [x] Announce the failure once. Keep changing countdown text outside the live announcement so it is not spoken every second; announce meaningful recovery transitions politely.
- [x] Keep skeletons decorative and outside the focus order. Retain accessible loading/retrying labels while the catalog is pending.
- [x] Keep focus stable across retries and avoid automatic focus movement when an error appears.
- [x] Use safe generic unavailable-content wording for network, timeout, HTTP, or invalid-response failures; use dedicated content-changed copy for revision conflicts. Show technical details only through the existing developer diagnostics.

## Step 6 — Verify and document

- [x] Cover the subject failure layout, safe banner copy, one retry action, and four original shimmer skeletons in `SubjectScreen.test.tsx`; cover successful recovery and unchanged saved progress in `App.progressive.test.tsx`.
- [x] Test the shared banner's deadline-derived countdown, timer cleanup, Retry-After gating, active-action state, and safe revision copy. The full dashboard test suite also verifies the extracted banner behavior.
- [x] Add deterministic runtime coverage for independent subject retry state, scoped backoff advancement, and Retry-After minimums. Existing retry tests continue to cover bounded retries, deduplication, reconfiguration, and stale-response guards.
- [x] Verify App-level subject endpoint failure and recovery without progress writes or question requests.
- [x] Add a mobile browser outage/recovery flow that checks header alignment, edge-to-edge banner bounds, four shimmer skeletons, keyboard Retry, safe copy, and restored quiz actions. Existing reduced-motion browser coverage remains passing.
- [x] Use the default E2E build's `VITE_CONTENT_MAX_RETRIES=0` for terminal/manual recovery; verify countdown and Retry-After behavior with fake timers.
- [x] Run `npm test`, `npm run lint`, `npm run format:check`, `git diff --check`, and `npm run test:e2e` (which builds with TypeScript first).
- [x] Update `docs/product.md`, `docs/design-system.md`, `docs/architecture.md`, and `docs/testing.md` to describe the subject banner and per-subject recovery metadata.
- [x] Record check results and move this tracker to `docs/work/done` after implementation and verification are complete.

Verification: `npm test` passed (40 files, 256 tests); `npm run test:e2e` passed (6 browser tests); the production build/type-check, lint, formatting check, and `git diff --check` passed. The build reports the existing large-chunk advisory for the timer bundle.

## Completion criteria

A failed subject quiz fetch shows the same full-width recovery treatment as the corrected dashboard. The existing shimmer loaders remain visible, subject navigation works throughout recovery, retry timing matches the transport, and recovery restores the quiz list without progress writes or stale navigation.

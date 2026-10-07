# Quiz question loading error toast

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

Status: complete. Implementation, automated tests, production build, content validation, and browser verification pass.

## Goal and scope

Remove the inline question-loading failure block from the subject screen. When Start, Retake, Resume, or Browse Answers exhausts the existing question-request recovery policy, show a persistent error toast at the bottom right of the viewport. It remains visible until the learner activates its × close button, including across in-app navigation and later successful launches. Notifications are transient React state; a full page reload resets them.

Subject quiz-catalog failures retain their existing recovery banner and skeletons. This change concerns loading questions for a selected quiz. Canonical content, request retry policy, saved attempts, scoring, and backend behavior stay outside this work.

## Findings

- `src/app/screens/SubjectScreen.tsx` receives `questionError` and `onRetryQuestions` and renders `ContentLoadFailure` between the heading and quiz cards. Removing the entire branch also removes its reserved spacing.
- `src/app/session/useQuizLaunch.ts` coordinates question requests, duplicate launch protection, cancellation, generation guards, and retry callbacks. Its error state clears when another launch starts or navigation cancels; it cannot directly control a notification that must remain until explicitly closed.
- `src/app/App.tsx` composes the launch coordinator and subject screen. Notifications must live outside `ScreenTransition` and `ScreenLoadBoundary` so screen replacement, transforms, and suspense do not affect their position or lifetime.
- `ContentLoadFailure.tsx` contains learner-safe error copy that should be shared rather than copied or replaced with raw exceptions.
- MUI is already installed; there is no existing shared toast system.

## 1. Add reusable notification primitives

- [ ] Create `src/app/components/notifications/` with notification types, a `Toast` presentation component, a `ToastProvider`/host, and a `useToast` hook. Use existing MUI Alert, icons, buttons, surfaces, and theme tokens; no new dependency is needed.
- [ ] Define customizable options: `id`/deduplication key, optional title, message content, severity (`success`, `info`, `warning`, `error`), position (top/bottom with left/center/right alignment), `ttlMs: number | null`, close-button visibility, dismissal policy, and an optional action. Defaults: bottom right, informational severity, a finite TTL, and a visible close button. `null` means no expiry.
- [ ] Expose show/update/dismiss operations. Use stable IDs so repeated reporting updates an existing visible message instead of creating duplicates. Timer changes and unmounts must clean up old timers; updating a persistent toast must never accidentally enable expiry.
- [ ] Support stacking by position with consistent gaps. Keep persistent notifications visible, with no overflow eviction or timer-based queue that silently removes them. Use bounded width, wrapping text, viewport gutters, and safe-area insets; narrow screens retain bottom/right anchoring and fit inside the viewport.
- [ ] Mount the provider around the learner App without changing its default export contract, using an inner composition component if needed. Render the host through a portal outside animated screen content. Keep notification stacking below modal dialogs and above ordinary page content.
- [ ] Make dismissal reasons explicit so a manual-only toast ignores Escape, click-away, and timer expiry. Its close button remains keyboard operable and has an accessible name such as “Close notification”. Error messages use alert semantics without stealing focus; other severities use polite status announcements. Avoid duplicate announcements and respect reduced motion.

## 2. Report guarded launch failures

- [ ] Add an optional failure callback to `useQuizLaunch`, invoked only after the current request fails and existing token/generation checks pass. Include the selected quiz and normalized error in the event. Keep notification UI out of the launch hook.
- [ ] In App, map that event to a toast with `severity: 'error'`, bottom-right position, `ttlMs: null`, visible ×, and manual-only dismissal. Deduplicate by quiz ID while a toast remains open; a fresh failure after dismissal may show it again.
- [ ] Extract the existing safe error-to-message mapping into a shared presentation helper and reuse it in `ContentLoadFailure` and the toast. Title: “Unable to load questions”. Include the quiz name for context, since the toast can remain after navigation. Preserve network, timeout, generic failure, and content-revision guidance; never display raw exceptions or HTTP details.
- [ ] Use theme error colors: a tinted error surface, error border/icon, and readable text. Ensure the severity is communicated by the title/icon as well as color.
- [ ] Keep this notification close-only. Learners can try again through the existing Start/Retake/Resume/Browse controls; revision guidance tells them to reload. The generic primitive supports optional actions for future callers. This avoids keeping a retry callback tied to an abandoned navigation destination.
- [ ] Do not dismiss the toast when a new launch begins, succeeds, or navigation calls `cancel()`. Cancellation itself and stale rejected requests must never produce a toast. No notification operation writes progress or starts a quiz.

## 3. Remove the subject-screen block

- [ ] Remove `questionError`, `onRetryQuestions`, the `ContentLoadFailure` import, and the entire inline failure wrapper from `SubjectScreen`; remove the corresponding App props.
- [ ] Retain the heading, navigation, quiz-card spacing, setup dialog, and existing question-loading controls. Failed launches re-enable their controls as they do today.
- [ ] Once no callers need the hook's inline error/retry API, remove obsolete `contentError`/`retryContent` state and update its tests. Preserve cancellation, deduplication, loading IDs, and guarded launch behavior. Keep `ContentLoadFailure` for its other consumers.

## 4. Verify behavior and update documentation

- [ ] Add primitive tests using fake timers for finite TTL, persistent TTL, updates, timer cleanup, deduplication, stacked messages, configurable positioning, optional actions, accessible close, and manual-only rejection of click-away/Escape.
- [ ] Update launch tests to verify one failure event per current failed request, no event after cancellation or stale navigation, normal recovery through a fresh launch, and successful action execution only after questions load.
- [ ] Update `App.progressive.test.tsx` to assert a persistent alert in the notification host and no inline subject error. Cover Start/Retake, Resume, Browse, explicit close, navigation persistence, later success without dismissal, revision-safe copy, and reopening after a fresh failure. Check the authoritative v2 progress snapshot as well as existing legacy-key assertions to prove failures and dismissals do not write attempts.
- [ ] Keep subject catalog/banner tests passing and verify the subject heading-to-card gap no longer includes an error block.
- [ ] Add a Playwright question-endpoint failure flow at desktop and mobile widths. Check bottom/right viewport placement, readable wrapping, no horizontal overflow, keyboard closure, persistence beyond ordinary toast TTL, and recovery through the original quiz controls. Check reduced motion and dialog layering.
- [ ] Run `npm test`, `npm run lint`, `npm run format:check`, `npm run build` (includes TypeScript), `npm run test:e2e`, and `git diff --check`. Run `npm run validate:content` as the documented baseline; no content edits are planned.
- [ ] Update `docs/product.md`, `docs/design-system.md`, `docs/architecture.md`, and `docs/testing.md` with the toast contract, location, lifetime, accessibility, and question-failure behavior.
- [ ] Record verification results here and move the tracker to `docs/work/done` only after implementation and required checks pass.

## Acceptance criteria

The subject screen has no inline “Unable to load questions” block or leftover gap. A current failed question launch produces a safe, semantic error toast fixed at the bottom right. It remains until × is explicitly activated, cannot disappear through timeout/click-away/Escape or in-app navigation, and leaves saved progress untouched. The reusable primitives support other content, severities, positions, and TTLs without quiz-specific logic.

## Completion

Implemented the reusable toast provider and portal host, configurable severity/position/TTL/actions, keyed update and dismissal behavior, shared safe content-load copy, current-failure reporting from the launch coordinator, and removal of the subject-screen error block. Added component, launch, App integration, and browser coverage. Updated product, design-system, architecture, and testing documentation.

Verification: `npm test` passed (41 files, 260 tests); the final focused notification, launch, and App tests passed (3 files, 11 tests); `npm run lint`, `npm run format:check`, `npm run validate:content`, `npm run build`, `npm run test:e2e` (7 browser tests), and `git diff --check` passed. The build reports the existing large-chunk advisory for the timer bundle.

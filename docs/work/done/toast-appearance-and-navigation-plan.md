# Toast appearance and navigation lifecycle

Status: complete. Toast styling, transitions, scoped navigation lifetime, automated coverage, and documentation are implemented.

## Intended behavior

Give toasts a much softer border and shadow, a subtle opacity fade on appearance, and a matching fade when dismissed. Quiz question-loading errors remain open without a timeout while the learner stays on the originating subject screen, but close when the learner leaves that screen. Refresh resets all current notifications. Future callers can explicitly choose to keep notifications across in-app navigation.

This supersedes the navigation persistence requirement in `docs/work/done/quiz-question-error-toast-plan.md`.

## Current implementation

- `src/app/components/notifications/ToastProvider.tsx` owns options, keyed notification updates, TTL timers, dismissal rules, and the portal host. Alerts currently use `boxShadow: 4`, a divider border, and immediate removal from state on close or expiry.
- `src/app/App.tsx` creates question-loading error toasts with `ttlMs: null` and manual dismissal. The provider sits outside the changing screens, so notifications currently survive navigation.
- `src/app/navigation.ts` already supplies `screenIdentity(view)`. It changes for top-level destination changes, including different subjects, but ignores question navigation, timers, and other updates inside a screen.
- Refresh already resets toast state because the provider stores notifications only in memory.
- Existing App and browser tests explicitly expect question-loading errors to remain after All subjects navigation; those expectations must change.

## 1. Soften the shared appearance

- [ ] Replace shadow level 4 with one restrained shared shadow, initially `0 2px 8px rgba(70, 38, 20, 0.06)`.
- [ ] Keep a thin border with reduced divider opacity, using theme-derived color via MUI `alpha`. Preserve readable severity colors, icons, title, content, and close-button focus treatment.
- [ ] Put these shared styles in a small `Toast` presentation component within the existing notifications directory. Keep positioning and lifecycle in the provider.
- [ ] Inspect desktop and mobile presentation and adjust the shadow/border if the edge still looks heavy. Preserve the current width, viewport gutters, and dialog layering.

## 2. Add smooth enter and exit fades

- [ ] Use MUI `Fade` around each toast, with opacity-only motion and an initial timing of 180ms entering and 140ms exiting. Use the existing gentle `cubic-bezier(0.2, 0, 0, 1)` easing.
- [ ] Track whether each toast is open or exiting. Closing marks it exiting; remove the record only after `onExited`. Apply the same exit path to explicit close, TTL expiry, and navigation dismissal.
- [ ] Clear its TTL as soon as exit begins. Ignore repeated dismiss requests. While exiting, make the toast noninteractive and hide it from assistive announcements/focus navigation; do not leave an invisible clickable surface.
- [ ] Preserve keyed updates without replaying the entrance for an already open toast. If the same ID is shown again during exit, reopen/update it and invalidate the earlier exit completion so a stale callback cannot remove the new notification.
- [ ] Honor `prefers-reduced-motion` with zero-duration entry/exit and prompt removal. Clean up timers and transition callbacks on provider unmount.

## 3. Make navigation lifetime configurable

- [ ] Add a generic toast scope option: `{ type: 'global' }` or `{ type: 'screen', key: string }`. Default to global scope to preserve the reusable system's current behavior; callers opt into screen scope.
- [ ] Keep scope independent from TTL and manual-dismiss policy. A screen-scoped, manual toast can close on navigation while still rejecting Escape, click-away, and timeout dismissal.
- [ ] Add a provider API such as `notifyNavigation(screenKey)` that starts the exit of screen-scoped notifications whose originating key differs. Global notifications remain open, and notifications from the new destination remain valid.
- [ ] In the App composition layer, report the committed `screenIdentity(session.view)` through a small navigation bridge/effect. Keep the toast provider unaware of quiz domain types and session internals. Use stable callbacks and the screen key as dependencies so ordinary renders cannot trigger dismissal loops.
- [ ] Add an explicit navigation dismissal reason; allow it only according to scope. All dismissal paths share the fade-out lifecycle.
- [ ] Keep notifications in memory. Global scope means persistence across in-app navigation, not restoration after refresh.

## 4. Scope quiz-loading errors to their subject screen

- [ ] When App receives a guarded question-load failure, attach the originating subject's screen key (`subject:${quiz.subjectId}`) to its toast.
- [ ] Retain bottom-right placement, safe copy, error severity, no TTL, and the × close button. It remains open during retries, setup-dialog open/close, and other updates within that subject screen.
- [ ] Leaving through All subjects, header navigation, a different subject, or a successful launch into Quiz/Browse starts its exit. Opening an exit/setup dialog without changing the screen does not dismiss it.
- [ ] Preserve existing cancellation and generation guards so a late failure after navigation cannot create a new toast for an abandoned screen. Returning to the subject does not restore a dismissed error; a fresh failure may show a new one.
- [ ] Refresh clears notifications through the existing provider reset; no reload listeners or storage writes are needed.

## 5. Verification and documentation

- [ ] Update primitive tests for enter/exit state, removal after exit, reduced motion, timer cleanup, repeated close, and keyed re-show during exit. Test a screen-scoped and global toast together: navigation closes only the former, same-screen updates close neither, and global TTL behavior remains independent.
- [ ] Update `App.progressive.test.tsx` to verify question-error dismissal after All subjects and successful launch navigation, persistence while staying on the same subject, explicit × close, and no saved-progress changes.
- [ ] Update the existing question-error browser test to expect dismissal after navigation. Cover × fade-out separately, reload clearing, softer appearance, desktop/mobile layout, and reduced motion. Use deterministic transition assertions rather than brittle screenshot pixel matching or long fixed waits.
- [ ] Run `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e`, and `git diff --check`. Canonical content is not edited; run content validation if implementation unexpectedly touches content.
- [ ] Update `docs/design-system.md`, `docs/product.md`, `docs/architecture.md`, and `docs/testing.md` to describe shared fade timings, scope options, and screen-scoped question errors. Keep the older completed tracker as historical context.
- [ ] Record results and move this tracker to `docs/work/done` after implementation and checks pass.

## Acceptance criteria

Toast edges and shadows are visibly subdued. Entry and dismissal fade smoothly without moving the toast or leaving hidden interactive controls. A question-loading error remains until explicit close or departure from its originating screen, and refresh clears it. A caller can choose global scope to retain a future toast across navigation. Reduced-motion settings produce immediate transitions, and stale timers/exit callbacks cannot remove a newly shown toast.

## Completion

Implemented a restrained shared border/shadow, opacity fades, reduced-motion behavior, and per-toast global or screen scope. Question-load errors now exit when their subject screen changes; global notifications remain open across navigation. Updated product, design-system, architecture, and testing documentation.

Verification: `npm test` passed (41 files, 262 tests); `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e` (7 browser tests), and `git diff --check` passed. The build retains the existing large timer-bundle advisory.

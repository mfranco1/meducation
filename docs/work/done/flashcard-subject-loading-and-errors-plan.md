# Flashcard subject loading and error consistency

Status: implementation complete.

## Goal and boundaries

Make the flashcard subject screen follow the quiz subject screen's loading and launch-failure presentation. Reuse existing components and theme defaults. Keep quiz behavior and quiz-specific code unchanged; App edits must be limited to flashcard wiring. Do not change canonical content, IDs, checkpoints, backend infrastructure, or transport retry policy.

This plan covers the subject's deck list and launching Study/Resume. Broader flashcard styling should continue using shared primitives, but is not a separate redesign in this task.

## Findings

- `FlashcardSubjectScreen.tsx` uses raw MUI `Skeleton`, whereas `SubjectScreen.tsx` uses the shared `LoadingSkeleton` (warm wave shimmer with reduced-motion support). Both reserve four rounded, 92px rows with spacing 2 and already share `SubjectBrowseLayout`.
- `App.tsx` renders the quiz's themed indeterminate `LinearProgress` outside the screen transition when questions are loading. Flashcards expose `loadingDeckId` but have no equivalent bar.
- App combines catalog errors and `flashcards.launchError` into one screen prop. Any deck launch failure consequently activates the recovery banner and replaces the deck list with skeletons. The retry handler also combines catalog retry, deck retry, and revision reload paths.
- `useFlashcardSession.ts` already guards asynchronous launches with tokens, suppresses abandoned results, and clears loading in `finally`. Its catch branch stores an error rather than emitting a notification event.
- The current quiz launch reports guarded failures to App, which uses `ToastProvider` and `notificationMessages.contentLoadMessage`. Its error toast is bottom-right, keyed per quiz, persistent while on the subject, manually closable, and scoped to that subject. Navigation dismisses it. Current code and documentation take precedence over older completed plans describing global persistence.
- Existing browser coverage expects a deck-failure banner and keyboard Retry; it must be updated to recover through Study/Resume.

## 1. Reuse the catalog shimmer

- [x] Replace raw `Skeleton` imports and rows in `FlashcardSubjectScreen` with `LoadingSkeleton`, retaining rounded shape, 92px height, row count, and spacing.
- [x] Follow the quiz list's loading semantics: an accessible status label and `aria-busy` during loading; terminal catalog-failure placeholders are decorative and do not announce ongoing loading. Keep the heading and back control available.
- [x] Preserve catalog failure recovery through the existing `ContentRecoveryBanner`. Display the empty state only after successful catalog loading.
- [ ] Keep `LoadingSkeleton`, `SubjectBrowseLayout`, and the quiz screen unchanged. No new abstraction is needed for the existing four-row mapping.

## 2. Add the deck launch progress bar

- [x] In App, render an indeterminate MUI `LinearProgress` when the flashcard subject is visible and `loadingDeckId` is set. Put it at the same shell level as the existing quiz bar, outside `ScreenTransition`, using the same primary theme color and default dimensions.
- [x] Give it the accessible label “Loading flashcard deck”. Leave deck rows visible and retain the selected button's “Loading deck…”/disabled state.
- [x] Drive visibility only from the session's launch state, including retries inside the pending request. Hide it on success, failure, cancellation, or navigation. Catalog loading continues to use row skeletons.
- [x] Preserve duplicate-click prevention and existing cancellation when another deck or destination is selected. Do not rewrite the quiz's progress bar or alter shared theme settings.

## 3. Report launch failures through the existing toast

- [x] Add an optional deck-load failure callback to `useFlashcardSession`, preserving its current injected loader/repository arguments. Report `{ deck, subject, error }` only inside the current-token catch branch, with normalized errors. Keep toast presentation in App.
- [x] Wire that callback to `toast.show` with a stable deck-specific ID, title “Unable to load deck”, deck name plus existing learner-safe `contentLoadMessage(error)`, severity `error`, bottom-right position, `ttlMs: null`, visible close button, manual dismissal, and screen scope `flashcards-subject:${subject.id}`.
- [x] Match the quiz toast's lifetime: no timed expiry, Escape dismissal, or click-away dismissal; close or navigation dismisses it. A subsequent launch does not explicitly dismiss it; a successful launch navigates away and therefore removes it. Repeated failures update one toast per deck, and a failure after manual dismissal can show it again.
- [x] Pass only catalog errors to `FlashcardSubjectScreen`. Remove `errorKind` and deck-specific banner copy. Simplify the screen retry callback to catalog recovery only; remove obsolete launch-error state and APIs.
- [x] On card-load failure, keep the full deck list, heading, back control, and checkpoint labels visible. Clear the loading state so Study/Resume can retry the selected deck through the original action; do not reload the subject catalog or page as a side effect.
- [x] Reuse revision-safe toast guidance. A revision conflict may still require a learner-initiated reload to get compatible content; no automatic reload is introduced. Preserve the catalog's existing revision recovery behavior separately.
- [x] Keep persistence failures and changed-content restart confirmation in their existing flows. Failed requests, toast closure, and cancellation must not write checkpoints or quiz progress. Stale failures after navigation/unmount or a superseding launch must not show a toast.

## 4. Verify and document

- [x] Extend `FlashcardSubjectScreen.test.tsx` to cover shared shimmer, loading accessibility, terminal catalog failure, preserved catalog Retry, and launch-button state without replacing rows.
- [x] Extend `useFlashcardSession.test.ts` for one guarded failure event, error normalization, abandoned/superseded/unmounted requests, retry success, and unchanged checkpoint bytes on failure. Retain restart and persistence-failure regression coverage.
- [x] Extend App flashcard integration coverage for top-bar visibility, launch failure without a catalog banner/list replacement, screen-scoped toast lifetime, dismissal, deduplication, revision-safe copy, and Study/Resume recovery without catalog refetch or reload.
- [x] Update the existing failed-deck Playwright flow to use keyboard Study/Resume recovery. Retained rows, toast visibility, persistence, and keyboard recovery are covered; delayed/mobile details remain in the existing general flashcard browser flows.
- [x] Run focused tests, `npm run lint`, `npm run format:check`, `npm run build` (includes TypeScript), focused Playwright flows, and `git diff --check`. Run `npm run validate:content` as the documented baseline without editing content. Full `npm test` and `npm run test:e2e` were attempted; results are recorded below.
- [x] Update the flashcard descriptions in `docs/product.md`, `docs/design-system.md`, `docs/architecture.md`, and `docs/testing.md` with shared shimmer, launch progress, and scoped launch-failure toast behavior.
- [x] Record verification results and move this tracker to `docs/work/done`.

## Acceptance criteria

The flashcard subject catalog uses the same warm wave skeleton as quizzes. Study/Resume displays the same orange top loading bar while the launch is pending. A current deck-load failure displays the existing error toast and leaves the deck list usable for retry, with no page refresh or catalog replacement. Catalog failures retain their recovery banner. Cancelled launches cannot notify or reopen study. Saved progress and all quiz behavior remain unchanged.

## Planning verification

Inspected the subject screens, shared loading/layout components, App composition, both launch coordinators, toast navigation semantics, runtime flashcard resource states, relevant tests, and repository documentation. This change adds only a planning tracker; application checks are reserved for implementation. The pre-existing modification to `src/content/flashcardBank.generated.json` is outside this plan and was left untouched.

## Implementation and verification

Implemented the shared `LoadingSkeleton`, shell-level flashcard deck `LinearProgress`, guarded deck failure callback, and screen-scoped persistent toast using the existing safe error copy. Catalog failures retain the existing banner and shimmer; card-load failures preserve the deck list so Study/Resume retries in place. Updated product/design/architecture/testing documentation, session and subject-screen tests, flashcard browser recovery coverage, and stale dashboard-heading assertions to match the shared dashboard layout.

Verification: focused Vitest suites passed (4 files, 21 tests); `npm run lint`, `npm run format:check`, `npm run build`, `npm run validate:content`, and `git diff --check` passed. Focused Playwright flows passed (3 tests: failed launch progress/toast/retry, normal study flow, and navigation layouts). The full `npm test` run reported 29 failures in seven content/admin suites because the already-modified `src/content/flashcardBank.generated.json` contains new decks and references a subject catalog those tests expect to be empty; 327 other tests passed. The full browser run was attempted before updating the two stale “Flashcards” heading expectations; after correcting those expectations, all three relevant browser flows passed. The content bank modification was present before implementation and remains untouched. The build retains its existing large-chunk advisory.

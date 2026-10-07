# Flashcard study screen redesign — staged implementation plan

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

Date: 2026-10-06
Status: Implemented; verification complete with a repository-wide unit-suite caveat.

## Goal and scope

Match the active quiz screen's header, navigation controls, and responsive navigator while giving flashcards a persistent front prompt and a separate orange answer panel that flips to reveal rich content. Reuse presentation primitives without coupling flashcards to quiz attempts, answers, scoring, or timers.

This document is the implementation tracker. Mark stages complete only after their acceptance checks pass. Move it to `docs/work/done` when the implementation and final verification are complete.

Neither canonical bank, card order, stable IDs, answer provenance, nor the content API needs modification. The existing working-tree edit to `src/content/flashcardBank.generated.json` is outside this task and must be preserved.

## Inspected implementation and reuse opportunities

- `src/app/screens/FlashcardStudyScreen.tsx` currently shows a deck heading, replaces the front with the back, and places Previous and Next at opposite edges. It already renders card content through `MarkdownContent` in rich mode and preserves keyboard focus when Next becomes Finish deck.
- `src/app/screens/QuizScreen.tsx` supplies the reference back arrow, count, positional progress bar, flag control, and right-aligned footer. Its header and footer are currently inline.
- `src/app/components/quiz/ReadOnlyQuizChrome.tsx` repeats much of the header/footer for Browse Answers and results review. These are further consumers of shared presentation primitives.
- `QuestionNavigationLayout.tsx` already supplies a 270px sticky desktop navigator and a right-hand mobile drawer, but its labels are hard-coded to questions.
- `QuestionNavigator.tsx` combines quiz status derivation with reusable filter/grid/tile presentation. `QuestionTile` is exported from this same file. Its answered state already supplies the requested orange treatment.
- `useScrollCurrentQuestion.ts` keeps the current tile in view and honors reduced motion. Its effect dependencies will need to include changes in visible membership and drawer visibility where necessary.
- `src/app/session/useFlashcardSession.ts` already has an internal `moveTo` operation that checkpoints before navigating, plus reveal, restart, finish, and persistence-error handling. It does not expose arbitrary navigation or track opened/flagged IDs.
- `src/domain/flashcardStudy.ts` and the flashcard progress codec/repository currently persist only a position, content signature, and timestamp in a schema-v1 envelope.
- `MarkdownContent.tsx` already uses React Markdown, GFM, sanitized HTML, and KaTeX. Some equation/table styles explicitly align left, so applying `text-align: center` only to the outer card would be incomplete.
- `AppBrand` in `src/app/components/AppHeader.tsx` is the existing book icon and Meducation wordmark. It already supports noninteractive rendering when no navigation callback is supplied.
- Relevant coverage exists in flashcard screen/session/domain/persistence tests, `App.flashcards.test.tsx`, quiz/browse/review tests, and `e2e/learner-smoke.spec.ts`.

## Proposed behavior contract

These resolve details that were not explicit in the request and should guide implementation:

1. **Opened means revealed:** a card becomes opened the first time its answer is revealed. Merely displaying its front does not count. Hiding it again never clears its opened status.
2. **Resume:** persist opened and flagged card IDs alongside the current card. Resume and navigation to another card start with the answer concealed, even for an opened card. Selecting the already-current navigator tile closes the mobile drawer without changing its reveal state.
3. **Completion:** preserve the existing explicit Finish deck action on the final canonical card. It remains available even when some cards are unopened. Reaching the end or opening every card does not automatically finish. Finish clears that deck's active checkpoint, including opened/flagged state; a new study run starts fresh.
4. **Back:** the top-left arrow saves and exits to the subject screen using the existing persistence flow. Give it the accessible name “Save and exit deck.” No visible deck title or stopwatch appears at the top; retain a visually hidden descriptive page heading if needed for heading structure.
5. **Progress:** show `Card n of m` and positional progress `(index + 1) / total`, matching the quiz. Orange navigator tiles represent opened status independently of position.
6. **Filters:** All, Hidden, and Flagged affect only the navigator list (the internal filter value remains `unopened`). Preserve canonical numbering and order, allow arbitrary jumps, and keep Previous/Next moving through canonical deck order. Keep the selected filter until changed or the deck session ends; provide specific empty-state messages.
7. **Flags:** place a flag toggle at the white card's top right without displacing the centered front text. Flagging and opening are independent. Use an icon plus accessible state, not color alone.
8. **Card:** keep the front visible and centered above the orange panel. Remove the visible Front/Back labels. Center the existing logo on the concealed panel and the rich answer content on its revealed face. Preserve sources when revealed using their current restricted rendering policy.
9. **Reveal interaction:** clicking the concealed orange panel or pressing Space reveals it. Clicking the revealed answer panel hides it. Space on a revealed card advances to the next card, allowing a keyboard-only reveal/advance rhythm; the explicit Finish deck control remains on the final card. Links and other interactive content in the revealed answer must remain usable without accidental flipping.

## Stage 1 — establish regression fixtures and acceptance baseline

- [x] Add or extend test-only deck fixtures with at least four cards to exercise out-of-order jumps, a middle-card flag, filter changes, and last-card completion.
- [x] Include a long answer, lists, safe HTML, an image, inline/display math, a table, and source text. Keep unsafe-content cases in test strings rather than canonical content.
- [x] Capture the current active quiz at desktop and narrow mobile widths as the visual reference. Record header spacing, footer alignment, navigator geometry, and drawer focus behavior.
- [x] Review existing failure/resume tests before changing progress types. Record any pre-existing failures separately.

Acceptance: fixtures support every new behavior without modifying either canonical bank. Existing quiz and flashcard regression expectations are understood before shared code changes.

## Stage 2 — add pure opened/flagged state and durable progress

- [x] Extend flashcard domain progress with stable-ID collections for opened and flagged cards. Store only IDs, position, signature, and metadata; never copy content into progress or store presentation state such as animation angle.
- [x] Add pure operations for marking opened, toggling a flag, deriving navigator items/counts, and applying the three filters. Opening is idempotent; invalid target IDs/indices cannot alter the current checkpoint.
- [x] Introduce a schema-v2 flashcard progress envelope/key and a deliberate v1 migration. Existing v1 checkpoints migrate with empty opened/flagged collections because past reveal history cannot be reconstructed.
- [x] Read v2 first; use v1 only when v2 is absent. A malformed v2 record must surface the existing recovery error rather than falling back to stale v1. Preserve legacy bytes; migration must not write during snapshot reads and must commit only through the repository's validated write path.
- [x] Preserve the existing digest/early-v1 signature compatibility and changed-content restart prompt. An explicit restart resets opened/flagged state. Validate membership against loaded deck cards at launch; malformed collections and unknown IDs must follow a defined recovery/restart path, never silently attach state to another card.
- [x] Deep-copy/freeze the new nested collections at repository boundaries. Preserve stable cached snapshots, subscriptions, storage-error reporting, revision checks, and failed-write behavior. Subscribe to relevant legacy/new keys during migration and detect a source revision change before the first migrated write.
- [x] Document the migration limit: older application builds cannot share the new progress format; do not claim cross-version synchronization or an atomic cross-tab lock. Preserve the existing stale-writer protection among updated clients.

Tests: v1 migration, v2 round trip, malformed/duplicate IDs, missing/changed cards, restart reset, repeated reveal, flag toggle, filter ordering/counts, failed writes, legacy-byte preservation, stale revisions, storage events, frozen collections, and unchanged quiz progress. Replace the old constant-size-checkpoint expectation with bounded ID-only growth; keep the signature-size assertion.

Acceptance: current position, opened IDs, and flagged IDs round-trip reliably, old positions remain resumable, and failed commits do not publish a successful state transition.

## Stage 3 — extract shared study header and footer

- [x] Add small presentation components under `src/app/components/study/`, such as `StudyHeader` and `StudyNavigationFooter`.
- [x] Header inputs: item label/count, accessible exit label/callback, disabled state, and an optional trailing slot. The active quiz supplies its existing Stopwatch; flashcards supply no trailing content; read-only review can supply its existing final-time display.
- [x] Footer inputs: position, previous/next callbacks, optional Next/Continue label, final action label/callback, and disabled state. Preserve the quiz's arrow icons, text buttons, spacing, right alignment, and contained final action. Flashcards use Finish deck in that final position.
- [x] Preserve or expose refs needed for focus continuity when Next becomes the final action. Do not move quiz submission confirmation or flashcard persistence into these components.
- [x] Adopt these primitives in the active quiz and flashcard screen. Have the existing read-only chrome wrappers delegate to them while retaining mode-specific labels and behavior.

Tests: first/last/single-item behavior, callbacks, labels, disabled states, optional timer slot, and focus continuity; existing active quiz/Browse/Review tests must pass.

Acceptance: quiz presentation and timer/submission behavior stay stable; flashcards receive the requested title-free header and matching footer without duplicated markup.

## Stage 4 — share navigator presentation and add flashcard navigation

- [x] Extract neutral layout, filter/grid, and tile presentation from the existing quiz navigator into `components/study/`. Keep quiz-specific answered/wrong/flagged derivation in its adapter and flashcard opened/flagged derivation in its own adapter.
- [x] Use a small explicit view model: stable ID, canonical index/number, highlighted state, flag state, optional error indicator, and accessible label. Do not fabricate quiz questions or attempts for flashcards.
- [x] Parameterize responsive layout labels so the mobile trigger says Cards and the landmark says Card navigation. Preserve existing question labels for all quiz modes.
- [x] Reuse the exact orange tile palette, active outline, flag marker, spacing, scroll bounds, and five-column grid. Add semantic theme tokens if needed to remove duplicated literal colors.
- [x] Add `FlashcardNavigator` with All/Hidden/Flagged labels, accessible counts, current-card state, empty messages, and navigation callbacks. The domain's `unopened` filter identifier remains an internal implementation detail.
- [x] Keep the current tile in view when visible, including when filters/status change or the drawer opens. If a filter removes the focused tile, restore focus to an appropriate filter control without switching cards. Do not force the current card into a filter it does not match.
- [x] Preserve drawer Escape/backdrop dismissal and focus restoration. Close it after a successful card jump; a failed checkpoint must keep the current card and expose the persistence error.

Tests: all filter combinations, canonical jump targets, current/opened/flagged overlap, flag removal while filtered, opening the last unopened card, empty filters, mobile dismissal/focus, and quiz/review status regressions.

Acceptance: the desktop/right drawer navigator behaves like the quiz's and retains feature-specific terminology and state.

## Stage 5 — build the centered front and flipping answer panel

- [x] Extract a focused flashcard presentation component, such as `FlashcardStudyCard`, with controlled reveal/flag state and callbacks. It must not access storage or own deck navigation.
- [x] Render the centered front in the white card and the orange panel below it. Keep the flag in a separate reserved row or balanced layout so long front text stays genuinely centered.
- [x] Reuse the `AppBrand` book glyph without its wordmark, enlarged and centered on the concealed face; preserve existing header/drawer defaults.
- [x] Use CSS perspective, `rotateY`, `transform-style: preserve-3d`, and hidden backfaces for a short flip of the orange panel only. Start around 300ms and adjust after browser verification. Reuse MUI/Emotion; no animation dependency is currently needed.
- [x] Design the answer face to grow naturally for long content. Both faces occupy the same intrinsic grid cell and the rich back stays rendered (but inaccessible) while concealed so its content determines the shared height. Avoid fixed-height clipping and absolute-positioned faces; key/reset the panel by card ID and preserve accessibility/focus handling.
- [x] Key/reset the panel by card ID so navigation never displays the previous card's answer or animates a conceal transition from the previous card. Rapid toggles should reverse or settle cleanly with no state updates dependent on `transitionend`.
- [x] Both faces use `MarkdownContent` with `contentKind="rich"`. Add an optional alignment setting or scoped reusable styles, preserving the renderer's default appearance in quizzes. Center prose, headings, images, and display math; retain meaningful list/table/code structure, explicit table alignment, and local overflow scrolling.
- [x] Keep the existing sanitize-before-KaTeX pipeline, URL/image policy, and `trust: false`. Do not add a second renderer or raw `dangerouslySetInnerHTML` path.
- [x] Use a native accessible reveal control on the concealed face. Do not wrap arbitrary rich answer HTML/links inside a button. Clicking the revealed face hides it; hide inactive faces from assistive technology and keyboard navigation.
- [x] Disable the transform transition under `prefers-reduced-motion: reduce` while keeping reveal behavior immediate. Ensure readable text/link contrast on both orange faces, visible focus, and no layout-wide horizontal overflow.

Tests: front remains visible, back is initially concealed, sources appear only when revealed, both faces support rich content, unsafe HTML/URLs remain filtered, default quiz alignment remains unchanged, and navigation resets the correct card.

Acceptance: only the orange panel flips, content remains upright/readable, and long content is never truncated.

## Stage 6 — integrate session actions and keyboard behavior

- [x] Expose validated arbitrary navigation from `useFlashcardSession`; wire `App.tsx` to pass current opened/flagged state, jump, and flag callbacks to the screen.
- [x] Preserve opened/flagged collections through launch, move, save-and-exit, and shell destination changes. Commit first reveal and flag changes through the same error-aware repository path before publishing success. Hiding an answer does not require a progress write.
- [x] Use fresh state/functional updates where needed to avoid losing a rapid flag/reveal action. Repeated opens should not cause redundant saves, and the content signature should still be computed only at launch.
- [x] Scope Space handling to the active study screen. Space reveals a hidden answer and advances from a revealed card; Space on the final revealed card preserves the explicit Finish action. Ignore repeated, modified, composing, or already-handled events; ignore editable elements and interactive controls that need native Space behavior. Suppress page scrolling only when handling the shortcut.
- [x] Let the reveal button's native keyboard behavior handle its own Space/Enter event so one press produces one reveal. Do not intercept Space in drawers/dialogs or on navigation, flag, filter, or answer-link controls. Remove listeners on unmount.
- [x] Keep focus stable during reveal, transfer it appropriately when a reveal control becomes hidden, and retain Next-to-Finish continuity. Navigation/finish/save failures must remain recoverable on the current screen.

Tests: arbitrary jumps and reload/resume, first reveal persistence, no duplicate Space activation, held Space, editable/interactive targets, modal exclusions, listener cleanup, fast actions, failed reveal/flag/jump/save/finish, and shell navigation guards.

Acceptance: all UI actions use one authoritative session/repository path, and opened/flagged state survives resume independently from the concealed/revealed display state.

## Stage 7 — browser verification and efficiency review

- [x] Extend learner Playwright coverage to reveal by click and Space, exercise the repeated Space reveal/advance rhythm across the deck, jump out of order, flag/unflag, apply all filters (including the Hidden empty state), save/reload/resume, and explicitly finish. Verify quiz analytics remain untouched.
- [x] Capture desktop and narrow mobile states: concealed, revealed, long rich answer, filtered navigator, and drawer. Compare the quiz header/footer/navigator before and after extraction; include Browse and results review regressions.
- [x] Exercise reduced motion, visible focus, drawer Escape/backdrop handling, first/last/single-card decks, no-match filters, and rapid navigation during a flip.
- [x] Assert no page overflow with long equations/tables and that content/control bounds remain visible. Validate actual browser transform states and face visibility; DOM-only tests cannot establish that the animation looks correct.
- [x] Render only the current card's rich content. Navigator derivation should be linear in deck size with Set-based membership, avoiding nested scans. Memoize stable expensive derivations where measurements justify it; do not introduce blanket memoization or virtualization without evidence.
- [x] Check production chunk sizes after sharing primitives. Keep flashcard-specific animation and session code out of initial dashboard imports; do not pull quiz scoring or celebrations into flashcards through a shared barrel.

Acceptance: desktop/mobile parity is demonstrated, keyboard behavior is reliable, and no new dependency or avoidable deck-wide rich-content rendering is introduced.

## Stage 8 — final checks, documentation, and handoff

- [x] Run focused tests while developing each stage, then run `npm test`, `npm run lint`, `npm run build` (includes TypeScript), and `npm run test:e2e` for the integrated result.
- [x] Run `npm run validate:content` as the repository's content compatibility gate. Do not modify existing canonical content to fix an unrelated baseline failure; report it explicitly.
- [x] Run `npm run format:check` for the configured baseline and `git diff --check`. Run admin/backend suites only if changes cross those boundaries; this plan does not require backend implementation.
- [x] Update `docs/product.md`, `docs/design-system.md`, `docs/architecture.md`, `docs/testing.md`, and the learner-checkpoint description in `docs/flashcard-schema.md` for new behavior, shared ownership, and progress migration. The canonical flashcard content schema remains v2.
- [x] Record exact results, browser artifacts, and any remaining limitations. Manual assistive-technology QA is distinct from automated accessibility checks.
- [x] Move this tracker to `docs/work/done` only when all required checks pass and the requested behavior is implemented.

## Delivery order and dependency policy

Implement in the numbered order. Each stage should leave a coherent, testable change: baseline → domain/storage → shared chrome → navigator → card presentation → integration/keyboard → browser review → final gates.

Use the installed React/MUI stack, existing React Markdown/rehype/remark/KaTeX pipeline, native CSS transforms, Vitest/Testing Library, and Playwright. A dependency addition is not planned. If browser testing reveals a concrete unmet requirement, evaluate a maintained library against that requirement and its accessibility, bundle cost, license, and compatibility before adding it.

## Planning validation

The plan is based on the current source and repository documentation. No application code was changed and implementation tests have not been run as part of planning. Implementation success must be established by the staged checks above.

## Implementation and verification record

Implemented the staged redesign. The quiz, Browse, and Review screens now share the study header/footer; question and flashcard navigation share tile styling; flashcards track opened/flagged IDs in schema-v2 progress; the v1 reader preserves legacy bytes and migrates at the next write; and the card panel uses the existing sanitized Markdown/HTML/KaTeX renderer with a reduced-motion-aware CSS flip. The final keyboard flow reveals a card, advances to the next card on Space, and retains explicit Finish deck on the last card. No dependency was added. The pre-existing working-tree change to the canonical flashcard bank was preserved and not changed by this implementation.

Passed in the final audit: focused flashcard/session/domain/persistence/Markdown/quiz/App suites (50 tests); `npm run test:e2e` (11 tests, including Space reveal/advance through the deck and the Hidden filter's empty state); production build and TypeScript (via the E2E pretest); `npm run lint`; `npm run format:check`; `npm run validate:content` (11,687 questions and 674 flashcards across 13 decks); and `git diff --check`.

`npm test` ran 364 tests: 337 passed and 27 admin tests failed. The failures are in flashcard-admin and question-bank admin tests whose assumptions conflict with the current working-tree bank (for example, they expect zero decks or no references to subject `s9`, while the bank contains 13 decks). The working-tree change to `src/content/flashcardBank.generated.json` predates this implementation and was left untouched. The repository-wide unit suite therefore cannot be reported as passing against this workspace state.

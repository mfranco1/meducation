# Flashcard deck completion count

Status: implementation complete.

## Goal

Show a small outlined completion pill on each deck card in the flashcard subject page after the learner completes that deck: `Completed 1 time`, then `Completed 2 times`, and so on. Match the quiz subject page's MUI Chip size, variant, and spacing.

## Findings and behavior decisions

- `FlashcardSubjectScreen` currently receives checkpoints and shows card count, an optional saved-position pill, and Study/Resume actions.
- `useFlashcardSession.finish()` currently clears the checkpoint and returns to the subject page. No completion history is retained, so earlier completions cannot be reconstructed. Counting starts when this feature ships; existing checkpoints start with zero recorded completions.
- Count a completion when the learner explicitly selects **Finish deck** on the final card of a non-empty deck. Visiting the final card, revealing answers, saving and exiting, and restarting do not count. Preserve the current ability to navigate directly to the final card; this feature does not require every answer to have been opened.
- A completion increments the count and removes active progress in one repository commit. A failed save keeps the study screen open with its checkpoint and previous count available for retry.
- Counts belong to stable deck IDs, persist across reloads and later study sessions, and survive checkpoint clears or content restarts. A previously completed deck may show both its completion pill and a new saved-position pill.
- Keep the existing Study deck / Resume deck wording and current deck ordering. The requested similarity is the completion pill.
- Use the current versioned flashcard progress repository. Extend the v2 envelope with an additive `completionCounts` map; accept existing valid v2 data without this field and normalize it to `{}` in memory. Keep the existing storage key and checkpoint contract. Reads must not rewrite storage or consult retired keys.
- This is a learner progress change. It requires no canonical content changes, API changes, or new dependencies. The currently modified `src/content/flashcardBank.generated.json` is pre-existing work.

## Stage 1 — Extend the progress contract and decoder

Files: `src/domain/flashcardStudy.ts`, `src/persistence/flashcardProgressCodec.ts`, and their affected test fixtures.

- [x] Add `completionCounts: Record<string, number>` to the normalized `FlashcardProgressState`.
- [x] Extend the stored v2 decoder to accept an absent completion map and return an empty map, preserving revision and every checkpoint field. Include the map in newly initialized states.
- [x] Validate supplied maps: non-empty deck IDs and non-negative safe integer counts. Reject malformed maps, negative/fractional/unsafe values, and unknown envelope fields through the existing corrupt-data protection.
- [x] Ensure normalization makes no storage write and does not derive counts from checkpoint position, opened cards, or quiz attempts.
- [x] Update typed state fixtures affected by the new required normalized field. Keep existing invalid-checkpoint and unsupported-schema coverage.
- [x] Add focused codec coverage for old-v2 compatibility, valid persisted counts, invalid counts, and read-only normalization.

Stage exit: existing v2 progress loads with all positions, opened cards, flags, and revision intact; new progress round-trips with completion counts.

## Stage 2 — Add a durable completion operation

Files: `src/persistence/localFlashcardProgressRepository.ts` and `src/persistence/localFlashcardProgressRepository.test.ts`.

- [x] Include empty completion maps in initial, unavailable, and corrupt fallback snapshots; freeze the map alongside checkpoints.
- [x] Add `completeDeck(deckId)` to increment that deck's count and remove only that deck's checkpoint in a single call to the existing commit path.
- [x] Require an active checkpoint for the operation. If it has already been removed by a successful finish, do not increment again. Keep ordinary `clearCheckpoint` independent of completion counting.
- [x] Preserve all other decks' counts and checkpoints and reject count overflow before saving.
- [x] Reuse existing revision conflict checks, write verification, immutable snapshots, and subscriber notifications. Publish the updated count only after a successful save.
- [x] Cover first/repeated study-session completions, duplicate finish calls, independent decks, reload persistence, ordinary checkpoint clearing, failed writes, corrupt data, stale writers, and snapshot/subscription behavior.

Stage exit: one successfully committed active deck contributes exactly one completion; failed commits do not publish a successful completion. Retain the documented limitation that optimistic revision checks do not provide locking for truly simultaneous cross-tab writes.

## Stage 3 — Wire completion into the flashcard session

Files: `src/features/flashcards/session/useFlashcardSession.ts` and `src/features/flashcards/session/useFlashcardSession.test.ts`.

- [x] Replace finish's checkpoint-clear call with the new repository completion operation through `runPersistence`.
- [x] Guard finish against non-study views, empty loaded decks, and positions other than the final loaded card.
- [x] Return to the subject only after the operation succeeds. On failure, retain the study position and display the existing persistence error so the learner can retry.
- [x] Use the existing external-store subscription to expose the new count; avoid separate React count state.
- [x] Cover finish from a fresh or resumed session, failed finish followed by retry, duplicate finish, a second completed session, and completion after a content restart.
- [x] Verify launch, reveal, navigation, save-and-exit, and restart never increment counts. Adjust existing finish-failure tests to exercise an eligible final-card finish.

Stage exit: completing a deck updates its persistent count once and removes it from active study; starting it again retains that count.

## Stage 4 — Render the completion pill on deck cards

Files: `src/app/App.tsx`, `src/features/flashcards/screens/FlashcardSubjectScreen.tsx`, and corresponding screen/App tests.

- [x] Pass `flashcards.progress.completionCounts` from App into the subject screen as read-only presentation data.
- [x] Resolve each deck's count by stable ID, defaulting a missing entry to zero.
- [x] Render a MUI `Chip` with `size="small"` and `variant="outlined"` only when the count exceeds zero. Use singular `time` for one and plural `times` otherwise.
- [x] Place completion and saved-position pills in a responsive wrapping row under the card-count text, using the quiz page's spacing conventions.
- [x] Keep storage access in the repository/session. Follow the quiz screen's visual pattern without importing code from the sibling quiz feature.
- [x] Cover zero/one/multiple completions, multiple decks with independent counts, and simultaneous completed-plus-resumable status.
- [x] Add App integration coverage for finish → updated subject pill, relaunch/resume, and refresh/remount persistence. Preserve catalog loading/error and deck-launch states.

Stage exit: completion counts are visible immediately on return to the subject, survive refresh, and coexist with saved progress without changing actions or ordering.

## Stage 5 — Verify, document, and close the tracker

Files: `e2e/learner-smoke.spec.ts`, `docs/product.md`, `docs/architecture.md`, `docs/design-system.md`, and `docs/testing-regressions.md`.

- [x] Extend the existing flashcard browser flow: complete once, assert `Completed 1 time`, reload, study and finish again, and assert `Completed 2 times`. Check saving/resuming another run keeps the count and both pills, and quiz analytics remain independent.
- [x] Inspect completed and resumed deck cards at desktop and mobile widths for wrapping, readable text, and keyboard-accessible actions.
- [x] Run focused codec, repository, session, subject-screen, and App tests during their stages.
- [x] Run final frontend checks: `npm test`, `npm run lint` (includes architecture checking), `npm run format:check`, `npm run build` (includes TypeScript), and the affected flashcard browser flows through `npm run test:e2e -- --grep flashcard`.
- [x] Run `npm run validate:content` as the documented content baseline. Report any failures and distinguish pre-existing content issues; do not edit canonical content to make this feature's checks pass.
- [x] Run `git diff --check`. Record commands, outcomes, and any unresolved limitations here; do not mark implementation complete while relevant checks fail.
- [x] Update product behavior, persistence documentation, pill layout conventions, and flashcard regression requirements, including forward-only counts and old-v2 compatibility.
- [x] Move this tracker to `docs/work/done` after implementation and required verification pass.

## Final acceptance criteria

1. Zero recorded completions produces no completion pill.
2. One completion reads `Completed 1 time`; subsequent completions read `Completed N times`.
3. A successful explicit finish increments once and clears the active checkpoint together.
4. Save failures retain the checkpoint and previous visible count, and allow retry.
5. Counts persist across reloads, resumed/restarted study, and later completed sessions.
6. Existing valid v2 checkpoints load safely with zero historical counts; corrupt data is preserved for recovery.
7. Completion and saved-position pills coexist on a deck with a later unfinished session.
8. Deck identity, content, ordering, quiz statistics, and existing Study/Resume actions retain their current behavior.

## Planning verification

Inspected flashcard domain types, decoder/repository, session finish and failure handling, subject rendering, App wiring, selectors, quiz completion-chip rendering, existing regression requirements, and project check scripts. Implemented the completion map, atomic repository operation, final-card session guard, completion pill, browser coverage, and product/architecture/design/testing documentation. Focused tests passed (6 files, 32 tests); the full suite passed (61 files, 363 tests), followed by the expanded session tests (12 tests). The affected Playwright flow passed after the final browser assertions were added. `npm run lint`, `npm run format:check`, `npm run build`, `npm run validate:content`, and `git diff --check` passed. Content validation reported existing answer-under-review warnings and confirmed 11,687 questions and 1,072 flashcards valid. The production build retains its existing large-chunk advisory. Counts are forward-only because earlier finishes were not persisted; optimistic cross-tab writes retain their existing non-transactional race limitation.

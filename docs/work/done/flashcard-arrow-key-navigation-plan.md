# Flashcard arrow-key navigation

Status: complete.

## Goal and behavior

Allow Left Arrow to invoke Previous and Right Arrow to invoke Next on the flashcard study screen, whether the current answer is hidden or revealed.

- Follow canonical deck order, independent of navigator filters.
- Left Arrow on the first card and Right Arrow on the last card do nothing. No wraparound or keyboard-triggered Finish. Single-card decks ignore both arrows.
- Navigation uses the existing session callbacks, which save the checkpoint before updating the screen and conceal the destination answer. Preserve opened/flagged state and existing persistence-error recovery.
- Ignore modified, composing, already-handled, and repeated key events. Consume eligible arrow events to prevent horizontal page scrolling, including at deck boundaries.
- Suspend arrow shortcuts while saving, when there is no current card, or while a modal/dialog or the mobile Cards drawer is open.
- Preserve native keyboard behavior in inputs, textareas, selects, contenteditable regions, links, and keyboard-managed widgets such as tablists, sliders, menus, and listboxes. Allow arrow navigation when an ordinary study button has focus so learners can use shortcuts immediately after clicking Reveal, Previous, or Next.
- Keep the existing Space reveal/advance behavior and explicit Finish action. Preserve focus transfer from a focused Next button to Finish when advancing to the last card.

## Existing implementation

`src/features/flashcards/screens/FlashcardStudyScreen.tsx` owns a window keydown listener for Space with cleanup, modifier/repeat guards, and interactive-target/modal exclusions. Its footer delegates Previous/Next to session callbacks and transfers Next focus to Finish on the last card.

`src/features/flashcards/session/useFlashcardSession.ts` already handles checkpoint writes, reveal reset, and failed navigation saves. Reuse this path; no domain or persistence changes are expected.

## Implementation steps

- [x] Extend the study screen keydown listener to recognize `event.key` values `ArrowLeft` and `ArrowRight`, using the existing `onPrevious` and `onNext` callbacks with explicit index bounds and saving/card guards.
- [x] Keep key-specific target rules: Space retains its button exclusions, while arrows remain available on ordinary buttons and defer to widgets that use arrow keys. Check editable ancestors as well as the immediate target.
- [x] Mirror the footer's focus bookkeeping for arrow-triggered Next; update effect dependencies and retain listener cleanup so rerenders use current callbacks/index without duplicate handlers.
- [x] Update `docs/product.md`, `docs/design-system.md`, and `docs/testing-regressions.md` to document arrow behavior and regression obligations.
- [x] Add focused study-screen, App checkpoint, failed-save, and browser coverage. Preserved the pre-existing uncommitted flashcard-bank change.

## Necessary tests

### Study screen: `FlashcardStudyScreen.test.tsx`

- [x] Tests cover bounded callbacks for hidden/revealed answers, modifiers/repeat/composition/default prevention, ordinary button focus, input/link/tablist exclusions, saving/modal/drawer guards, one-card decks, focused Next-to-Finish transfer, and existing Space behavior.
- [x] Browser coverage verifies Left/Right navigation, destination concealment, first/last boundaries, save/resume, and explicit Finish.

### App integration: `src/app/App.flashcards.test.tsx`

- [x] App coverage verifies arrow navigation, saved destination on exit, and a checkpoint-write failure that keeps the current card and shows the existing recovery error.

### Browser: `e2e/learner-smoke.spec.ts`

- [x] Extended the fixture-based flashcard flow with real Left/Right keypresses, destination concealment, first/last boundaries, reload/resume persistence, and Finish behavior. The component test covers drawer suspension and restoration.

## Verification and completion

- [x] Focused study-screen and App tests pass: 17 tests.
- [x] `npm run lint`, `npm run format:check`, `npm run test:architecture` (10 tests), `npm test` (63 files / 381 tests before the final focused cases), and `npm run build` pass. The final focused run includes all 17 affected tests.
- [x] Ordinary and optional admin production builds pass. The flashcard learner browser flow passes. The full learner run had one unrelated quiz review timeout; that test passed when rerun alone. The admin browser run had one unrelated authoring CRUD timeout (`Move up`); the other admin flow passed, and the isolated CRUD retry timed out at a later authoring step.
- [x] `git diff --check` passes. No content validation was needed. The existing large-chunk build advisory remains.

The browser-suite timeouts occur in quiz review and admin authoring paths and do not involve flashcard study navigation.

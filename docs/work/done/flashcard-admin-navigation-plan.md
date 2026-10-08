# Flashcard admin navigation plan

Status: Completed on 2026-10-08.

## Problem and recommendation

`src/admin/FlashcardAdminPanel.tsx` renders every subject, deck, card, and repeated creation action in one nested list. At planning time the canonical bank contains 98 decks and 1,712 cards; the largest deck contains 106 cards. The desktop panel has a height limit, but every record still appears in its scroll area; below the large breakpoint the list also pushes the editor far down the page.

Replace the expanded catalog with a scoped navigator: choose a subject, choose a deck, then browse or search 25 cards at a time. This directly reduces navigation length and provides access to every card. Collapsing decks alone would still leave long lists inside large decks; virtualization alone would improve rendering without solving discovery.

## Proposed experience

1. Keep the **Flashcard content** heading. Add labelled, searchable MUI **Subject** and **Deck** pickers. Deck options belong only to the chosen subject and show card counts. Preserve canonical ordering. Initially show no selected subject or deck and a short instruction to choose a subject.
2. Show **Add deck** and **Bulk add decks** for the chosen subject. Once a deck is chosen, show its count plus **Edit deck**, **Add card**, and **Bulk add cards**. Choosing a deck browses its cards; editing its JSON is an explicit action.
3. Show a **Search cards in this deck** field. Match case-insensitively against complete front text, back text, and card ID; matching uses the staged in-memory bank. Keep results in canonical order. Clearing search restores the full deck list. Global cross-deck search is outside this initial change.
4. Render at most 25 card rows per page. Each row shows its canonical position, a two-line front preview, and stable ID. Use visible Previous/Next page controls and a range such as **26–50 of 106 cards**. For search, show both match and deck totals. Hide pagination when a single page suffices; never silently truncate results.
5. Keep pickers, actions, search, and pagination outside the scrolling card list. Retain the approximately 340px desktop sidebar width and existing visual theme. At narrow widths stack the navigator above the editor with a bounded card list (target maximum 40dvh), wrapping controls and no horizontal page overflow. Desktop list height should fit the existing approximately 78vh panel budget, allowing outer overflow on unusually short viewports.
6. Distinguish **Choose a subject**, **Choose a deck**, **No decks in this subject**, **No cards in this deck**, and **No matching cards**. Creation actions remain available for empty containers; no-match state offers Clear search.

## Editing and navigation rules

- Keep browsing state (subject ID, deck ID, query, page) distinct from the selected editor record. Keep it in React state without adding persistence.
- Changing subject or deck clears search and returns to page one. If an unstaged editor draft exists, run the existing discard confirmation before changing context. Cancelling leaves the picker, editor, search, and page unchanged. Accepted context changes clear the old editor selection.
- Searching and changing pages do not replace or discard the editor draft. Keep the edited record's subject/deck/ID visible in the editor header. If it is hidden by filtering or pagination, provide **Show in list** to clear the filter and reveal its page without changing the draft.
- Clicking another card or Edit deck uses the existing draft guard. Selecting the already edited record must not reload it and erase its draft.
- After successfully staging a new or updated card, reveal its actual parent deck and page; clear the query if needed. This also covers a card moved by editing `deckId`. After staging a deck, select its actual subject/deck, including a changed `subjectId`.
- After reordering, keep the selected card visible across page boundaries. Move up/down continues to mean canonical sibling order, including when a search is active; filtered results never redefine move targets.
- After bulk card addition, retain the destination deck, clear the query, and reveal the first added card's page without automatically opening an editor. After bulk deck addition, reveal the first created deck under its subject.
- After deletion, undo, import, reset, or shared-subject changes, reconcile browsing IDs against the resulting bank: preserve valid context, clear missing descendants, and clamp the page to available results. Keep existing editor-clearing and draft-protection semantics. Imports do not expand the whole catalog.
- Preserve busy/disabled behavior and all existing validation, change reasons, operation history, import preview, atomic bulk staging, export, and replay behavior.

## Implementation checklist

- [x] Implement the scoped navigator and pure deck search/pagination selector under `src/admin/core`.
- [x] Integrate browsing state and guarded transitions, including context recovery after undo and reconciliation after bank/subject changes.
- [x] Add searchable labelled subject/deck pickers, card search, 25-card pagination, accessible list names and result announcements, responsive bounded scrolling, and empty states.
- [x] Update admin browser flows and selector coverage. Update admin usage guidance in `docs/content-management.md` and navigation conventions in `docs/design-system.md`.
- [x] Complete verification below and record results.

## Acceptance and verification

- Selector tests verify page limits, canonical positions, full front/back/ID search, case-insensitivity, and empty/stale-page handling.
- Component and admin browser coverage verifies scoped contexts, draft safeguards, CRUD, export/replay, paired reset, bulk atomicity, undo, and fixture preservation.
- Verify keyboard-only selection, focus visibility, desktop and narrow layouts, short viewports, long labels, and no editor displacement by a full catalog. Automated accessibility checks do not replace manual screen-reader QA.
- Passed `npm test` (65 files, 394 tests), `npm run lint`, `npm run format:check`, `npm run test:architecture` (10 checks), `npm run build`, the enabled admin production build, `npm run test:e2e:admin` (2 browser tests), `npm run validate:content`, and `git diff --check`. Content validation reports 11,687 questions and 1,712 flashcards valid, with existing answer-review warnings. Canonical bank files are unchanged.

## Scope

This is an admin navigation change. It needs no new dependency, backend endpoint, content-schema change, canonical-content edit, learner navigation change, or persistence migration.

# Admin and content management UX plan

Date: 2026-10-12. Status: admin implementation completed and audited.

Audit follow-up: [Admin completeness audit](admin-completeness-audit.md) finishes selected-record deletion and consistent deletion reviews, restores single-record actions, repairs draft/paired-Undo guards, and verifies complete relevant coverage. Its Architecture decisions describe the final smaller implementation where this proposal suggested a new generalized journal or additional framework components.

Follow-up: [Admin panel layout and copy plan](admin-panel-layout-and-copy-plan.md) supersedes this plan's fixed navigator heights, visible modal Reason fields, Record/Bulk add naming, and separate bulk Preview/Stage buttons. Follow that completed plan for the latest requested behavior.

## Goal and scope

Make `/admin.html` manageable with large catalogs and batches, make deletion available at every hierarchy level, and reduce visible controls without removing authoring features. Keep Meducation's warm MUI theme and JSON-based, local authoring workflow.

This plan covers Quizzes, Flashcards, bulk-add previews, import previews, validation results, and coordinated workspace actions. It does not authorize deleting existing content. Implementation must preserve canonical text, meaningful formatting, answer provenance, stable IDs, sibling order, existing file formats, and learner progress. No new backend, runtime AI, persistence migration, dependency, or content-schema change is needed.

## Findings from the current implementation

- `AdminNavigatorPanel.tsx` renders every matching subject, expanded quizzes, and up to 200 questions in one scroll area. Search matches subjects only. Questions beyond 200 are inaccessible from the list; the current browser-search suggestion does not solve this.
- `FlashcardAdminPanel.tsx` already has searchable subject/deck pickers, deck-scoped full-text search, 25-card pagination, and bounded scrolling. Reuse these behaviors, including draft retention and selection recovery, across quiz browsing.
- Long lists also occur outside navigation: `AdminStatusPanel.tsx` renders every issue; quiz previews join every generated ID; `FlashcardBulkAddDialog.tsx` renders every deck, full card detail, and generated ID; import previews expose large JSON blocks without consistently bounding height.
- Quiz parent deletion already removes quizzes/questions with explicit `cascade: true`, but asks two generic confirmations before validation. Deck deletion cascades to cards. Subject deletion does not remove flashcard decks/cards; final shared-subject validation rejects it while decks remain.
- The Flashcards editor shows Stage, Delete, Move up/down, Undo, Reset, Export, and Import together, including unavailable actions. Creation has separate single/bulk buttons. Quiz bulk destination buttons duplicate navigation choices.
- Quiz state/history lives in `useAdminEditor` and `InMemoryQuestionBankGateway`; flashcard state/history lives in the panel. Paired import, export, and reset exist, but ordinary Undo is separate. Simply calling each bank's delete handler would risk a partial change and inconsistent recovery.

## Proposed experience

### 1. Browse one level at a time

Use a consistent navigator for both sections:

1. Searchable **Subject** picker.
2. Searchable **Quiz** or **Deck** picker scoped to that subject.
3. **Search items in this quiz** or **Search cards in this deck**, followed by a bounded result list.

Keep subject/quiz/deck context actions beside the appropriate picker. Selecting a parent browses its children; **Edit subject**, **Edit quiz**, and **Edit deck** explicitly open its record. Shared subject editing/deletion should be available from either section without requiring a tab switch or a JSON edit first.

- Show 25 item/card rows per page, in canonical order, with a range and total. Remove the first-200 limit entirely. Search questions by full stem and stable ID; retain flashcard search across full front/back and ID. Search and display trimming must never rewrite stored content.
- Give rows a canonical position, at most two preview lines, stable ID, and a selected state. Full content remains available in the editor/review detail. Keep full parent names readable and allow wrapping; use IDs to distinguish duplicate names.
- Picker popups have a bounded scrolling option list and search by name/ID. Bulk-add destination pickers use the same component rather than long select menus. Preserve canonical option ordering.
- Keep context, search, result counts, and pagination outside the scrolling list. Desktop panels fit the viewport; mobile lists are bounded to approximately 40dvh and stack above the editor. Avoid one scrollbar per nested level.
- Subject/quiz/deck changes use the draft-discard guard and reset child context/search/page only after acceptance. Search and page changes preserve editor drafts. Provide **Show in list** when the edited record is outside current results.
- After create, move, delete, Undo, reset, or import, retain valid parent context and reconcile missing descendants. Clamp pages and reveal a created/moved record. Cancelled transitions retain every piece of browsing/editor state.
- Use concise distinct empty states: choose a parent, empty container, or no search matches. Keep Add available for empty containers; offer Clear search for no matches.

### 2. Bound every review list

Pagination is presentation only: validation always checks the complete candidate, and export always includes all records.

- **Validation:** always show error/warning totals and the first actionable error. Use severity filters and 10 issues per page in a bounded area. Preserve exact messages, IDs, JSON paths, and busy/stale feedback; never imply hidden issues are resolved. Stage stays unavailable while any error exists, even on another page.
- **Bulk preview:** summarize subject/deck/quiz/item totals first. Browse generated records 25 at a time, scoped to a parent, and open full record details on demand. Include front/back, sources, review notes, choices, and provenance where applicable. Large generated-ID lists become a searchable paginated disclosure rather than a joined paragraph.
- **Import preview:** summarize operation types, destinations, and descendant counts. Keep complete read-only technical JSON in a disclosure with bounded height (`maxRows`), including the paired quiz change set and resulting flashcard bank. Review all operations through pagination; never cut them off.
- **Deletion review:** show total affected subjects/quizzes/items/decks/cards and a bounded, paginated disclosure of names/IDs. Counts cover the entire deletion, regardless of search or page.
- Do not require manually opening every record before Stage. Keep validation evidence and complete detail accessible without forcing a long review scroll.

### 3. Delete from context, with one clear review

Add a labelled **Subject actions**, **Quiz actions**, or **Deck actions** menu beside each selected parent. Include Edit and **Delete subject…**, **Delete quiz…**, or **Delete deck…**. Selected items/cards use **Record actions → Delete item… / Delete card…**. Parent deletion must not require loading its JSON or deleting children individually.

Open one MUI deletion dialog containing:

- The exact target name and stable ID.
- The complete descendant counts from the staged pair of banks.
- A required Reason field, prefilled from the existing workspace reason and editable without changing unrelated drafts.
- Concise copy: deletion is staged locally, can be undone while retained in workspace history, and only affects canonical files after reviewed replacement. Existing learner attempts/checkpoints remain stored and may become inaccessible when their content is removed.
- Cancel and an explicit destructive action such as **Stage subject deletion**. Use red only for this destructive action. Cancel receives initial focus; focus returns to the trigger or surviving parent context.

Cascade is the normal UI behavior, with no separate cascade checkbox or second confirmation:

- Subject → every quiz and its items, plus every flashcard deck and its cards.
- Quiz → every item in that quiz.
- Deck → every card in that deck.
- Item/card → that record only.

Generate explicit `cascade: true` parent operations internally. Keep existing import validation rejecting parent operations that omit required cascade intent; simplifying the UI does not relax the technical contract.

Also provide opt-in **Select** mode for item/card lists: checkboxes, a selected count, **Select this page**, Clear selection, and **Delete selected…**. Selection may persist across pages within the same parent; search/parent changes clear it to prevent hidden unintended targets. Show the total selected count at all times. Delete selected records as one reviewed, undoable batch. Do not add an ambiguous global Select all or multi-parent bulk-delete mode in this pass.

Before staging, resolve targets against current snapshots, validate the entire final pair, and recheck captured revisions. If either bank or target changes while the dialog is open, require a refreshed review. Missing records, stale previews, invalid final references, or failures leave both banks and histories untouched. Never silently replace a removed target with another row.

### 4. Show actions where they are relevant

Keep frequently used actions visible; use named menus for less frequent operations. Preserve clear labels rather than replacing the interface with unlabeled icons.

- Use **Quizzes / Flashcards** tabs for section navigation.
- Give the navigator one **Add** menu containing relevant single-record and bulk choices. Keep unavailable child choices disabled with clear parent context. Retain Record/Bulk add modes, but replace the three quiz bulk-destination buttons with a labelled destination selector.
- Keep **Stage record** visible in Record mode. Bulk/import flows keep **Validate/Preview** and **Stage** as separate steps, with Stage available only for a current successful preview. Hide these controls outside their applicable workflow.
- Place Delete and flashcard Move up/down in **Record actions**. Preserve canonical sibling-order move semantics and boundary disablement. Parent actions stay beside parent pickers so Delete subject is easy to find.
- Put Import and Reset in a **Workspace** menu. Keep Undo visible beside concise staged/exported status because it is the principal recovery action. Retain explicit **Reset both banks** when applicable; never let a local reset partially undo a coordinated transaction.
- Put one active-workspace **Export** action in the shared header. Its label and summary state **Export quizzes**, **Export flashcards**, or **Export both banks**. Remove the duplicate flashcard footer export after routing its existing handler through the header. Coupled subject deletion always exports both banks, both change sets, the replacement manifest, and the content bundle; a quiz-only export must not split that transaction.
- Keep Copy template and Load JSON file together under a bulk-editor utility menu. Preserve every existing feature and enablement rule; inventory old/new action locations before implementation.
- Draft, staged, exported, warning, and error states remain distinguishable in text. Export still downloads files and retains the workspace; it does not publish or replace repository content.

### 5. Stay on-brand and accessible

Reuse `AppBrand`, `AppShell`, the shared theme, and existing MUI primitives. Retain the warm off-white shell, paper surfaces, primary orange action accent, 14px panel/dialog corners, 10px interactive rows, restrained dividers, and neutral parent context. Severity colors communicate actual feedback and destructive intent.

Use one clear editor heading and compact context path. Preserve labelled Reason/JSON controls, readable monospace JSON, visible keyboard focus, full diagnostic content, and responsive wrapping. Menus support keyboard navigation and restore focus; dialogs trap focus; count/status announcements are polite. Respect reduced motion, 390px width, short viewports, and 200% zoom. Avoid horizontal page overflow or tiny targets.

## Implementation boundaries and reusable pieces

Keep admin-specific presentation in `src/admin/components`; promote nothing to `src/shared` without demonstrated learner reuse. Compose small pieces rather than a configurable all-purpose admin framework:

- `AdminEntityPicker`: labelled searchable parent picker with name/ID/count rendering and context-action slot.
- `AdminPagedList`: bounded content region, result summary, Previous/Next controls, empty-state slot, and optional selection toolbar; record rendering remains caller-owned.
- `AdminActionMenu`: labelled action groups, destructive treatment, disabled states, and focus restoration; it invokes supplied callbacks.
- `AdminDeleteDialog`: target/impact/reason/review state and confirmation callbacks, with a paged affected-record disclosure.
- `AdminReviewPanel`: shared summary/disclosure framing using `AdminPagedList` for diagnostic and generated-record detail, with independent filters/page sizes.

Keep search/pagination, selection reconciliation, descendant resolution, deletion operation generation, and impact counting pure under `src/admin/core`. Reuse `flashcardNavigator.ts` patterns and existing validators/serializers/change-set operations.

Extend the admin command/gateway seam to coordinate the two in-memory banks. Extract only the flashcard state/commands needed for coordinated operations from the panel into a hook/controller; keep presentation and learner code separate. A single owner must capture both snapshots, operation logs, reasons, and history before a cross-bank deletion and publish the validated result together. Do not coordinate by two sequential UI commits or mutable panel refs.

Retain existing schema-v4/v2 banks, version-2 individual change sets, and version-1 content bundles. Subject deletion produces existing subject/deck cascade operations and reuses final-pair validation from `coordinatedContentChangeSet.ts`. Extend that seam for staging an already edited workspace, rather than sending it through import's reset-workspace requirement.

Coordinated Undo must restore both banks and both operation logs as one batch. Preserve chronological history, including existing single-bank edits; never restore one side past later dependent edits. Use a bounded transaction journal (at most ten batches, matching current policy) and make the latest recoverable batch unambiguous in either section. Reset and export use the same coupling metadata. Keep revision/busy guards and unsaved/bulk-draft protection for both sections, including the hidden mounted workspace. Existing source reasons must remain recoverable in review/history; do not invent per-operation fields in export schemas.

## Implementation sequence

- [x] Inspect current admin UI, commands, schemas, ownership, design guidance, prior navigation work, and test obligations.
- [x] Save this plan with explicit behavior, boundaries, and acceptance criteria.
- [x] 1. Inventory action destinations; add pure quiz paging/search. Replace nested question browsing and the first-200 cutoff; reuse searchable scoped pickers and action menus in both sections.
- [x] 2. Bound issues, generated IDs, bulk records, and import JSON. Status issues show 10 per page; generated IDs are summarized with a full disclosure; flashcard bulk previews page through one deck and 25 cards at a time; import JSON has bounded editor height.
- [x] 3. Add the coordinated gateway/history seam for subject deletion across both banks, including paired validation, stale-revision checks, one Undo, and paired export/reset gating.
- [x] 4. Add parent/record deletion review, selected item/card deletion, grouped workspace actions, and active-section export.
- [x] 5. Update content-management, design-system, architecture, and testing docs. Finish interaction/responsive and regression verification before moving this tracker to `docs/work/done`.

## Acceptance criteria and verification

- Every item beyond position 200 is reachable. At most 25 item/card rows appear per page. Search, pagination, long picker catalogs, and review lists remain bounded and readable without pushing the editor far down the page.
- Searching/paging preserves drafts; cancelled context changes preserve state. Create/move/delete/Undo/import/reset recover valid context and pages. Search never changes canonical positions or reorder targets.
- Any selected subject/quiz/deck can be deleted directly from its context menu. The review shows the exact target and all descendants; confirmation stages one batch. Subject deletion leaves no quizzes/items/decks/cards referencing it and does not touch another subject.
- A cross-bank failure or stale review changes neither bank/history. One Undo restores the exact pair, operations, and order. Later edits cannot be silently lost. Export/replay and coordinated reset preserve the transaction.
- Item/card multi-delete shows the selected scope clearly and is atomic. Changing search/parent clears selection; pages preserve it. Cancellation changes nothing.
- All current features remain keyboard-accessible at documented destinations. No buttons for inapplicable workflows crowd the editor. Frequent staging, Undo, and Export remain visible.
- Canonical files remain byte-identical throughout development/tests. Fixture tests preserve untouched records, IDs, choice order, provenance, deterministic export, and learner progress.

Use small fixtures for more than 200 quiz items, multiple pages, long names/IDs, repeated sibling names, empty parents, many diagnostics, and subjects containing both quiz and flashcard content. Do not assert production counts.

Focused coverage: `src/admin/core` selectors/deletion/coordinated replay tests; gateway/hook tests for transaction/history/revision behavior; component tests for guards, actions, validation, and focus; `e2e/admin` flows for context deletion, selection, paired download/replay/Undo/reset, both sections, keyboard operation, desktop/390px/short viewport layouts. Include existing authored-content and bulk/import regressions. Follow `docs/testing.md` and `docs/testing-regressions.md`; run both learner and admin browser suites and both build modes for authoring/shared entry changes, and Python contract checks if stored contracts or shared fixtures change.

Implementation gates: affected tests, full unit suite, lint, formatting, architecture tests, `npm run validate:content`, `npm run build` (includes type-checking), enabled admin build, relevant browser suites, and `git diff --check`. Record existing warnings separately from failures. Manual screen-reader review remains release QA; automated keyboard/role checks do not establish assistive-technology behavior.

## Implementation progress

- The quiz navigator now scopes by subject and quiz, searches full stems/IDs, and paginates all items by 25; the 200-item truncation is removed.
- Flashcards use Add/parent/record/Workspace menus and the shared header export. Quiz bulk destination buttons are now one selector. Quiz workspace import/reset actions are grouped; Undo stays visible. Flashcard bulk previews show one deck and at most 25 cards, with bounded import JSON.
- The deletion dialog summarizes quiz descendants and subject deck/card descendants, pages affected identities, and keeps the workspace reason internally. Subject deletion applies a paired quiz/flashcard operation and stores a paired undo snapshot in the in-memory gateway.
- Validation issues are paged by 10. Generated IDs show a short summary with an expandable full list.
- Design, content-management, architecture, and testing documentation describe the new paths.
- The audit follow-up completes selected-record deletion, reviewed flashcard deletion, guarded paired Undo, and responsive/keyboard regressions. See that tracker for the complete current verification results.

Earlier implementation verification: `npm run build` and `npm run lint` passed, including type-checking and architecture boundaries; normal output omits the admin entry. `git diff --check` passed. Existing Vite warning for chunks above 500 kB remains. No unit or browser tests have been run. Canonical banks were not edited.

Final admin verification is recorded in [Admin completeness audit](admin-completeness-audit.md): 474 complete frontend unit tests, 72 admin tests, and 12 admin browser flows passed, along with type-checking, both build modes, lint/architecture, formatting, actual-bank validation, and diff checks. The broader learner browser suite has three separately tracked failures; see [Learner browser regression findings](../ongoing/learner-browser-regression-findings.md). The proposed generalized journal/framework was replaced by the bounded section histories and guarded paired-bank authority documented in the audit.

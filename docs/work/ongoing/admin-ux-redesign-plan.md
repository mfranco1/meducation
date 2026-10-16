# Admin UX redesign implementation plan

Date: 2026-10-16
Status: stage 1 implemented and verified; stage 2 save/publication/history review and recovery slice implemented. Native unsaved-discard flows and the remaining stage 2 work are open; stages 3–5 remain planned.
Scope: the full authenticated admin experience, beginning with the crowded header. This document proposes UI changes; it does not authorize content deletion or publication.

## Outcome

An editor should immediately understand where they are, what they can edit, whether their work is saved, and whether learners can see it. Everyday work follows **choose content → edit or add → review → save draft → publish when ready**. Recovery and account maintenance appear when relevant without competing with authoring.

Keep the Meducation brand, warm MUI theme, PostgreSQL authority, paired transactions, explicit publication, stable IDs, answer provenance, and existing recovery protections. No new backend infrastructure, runtime AI, or authoring storage is needed.

## Evidence and current friction

Inspected the live `/admin.html` page and the supplied screenshot, both authoring sections, `HttpAdminApp`, `AdminWorkspace`, `FlashcardAdminPanel`, `useAdminEditor`, the HTTP gateway/client, core operations, current schemas, design/product/content/testing documentation, and architecture policy.

- `HttpAdminApp.tsx` places authentication, session refresh, draft refresh, reconciliation, undo/reset, release selection, export, and publication in one wrapping header. Most controls have the same orange emphasis. The publication reason occupies space even when the user is only browsing.
- `releaseId` currently controls both activation and export. Selecting a retained release silently changes the export target; these should be separate explicit intents.
- `AdminWorkspace.tsx` starts with a large empty JSON editor, generic Record/Add tabs, and repeated Add/Edit/Delete controls. The blank editor does not guide the first action.
- Quiz and flashcard authoring use different add/review layouts and validation placement. Flashcard subject management switches to the quiz workspace.
- The quiz status panel reports local saved/dirty state while the header independently reports published state. Neither alone explains all three storage levels: unsaved browser text, saved database draft, and published learner content.
- Publication review renders JSON rather than a readable impact summary. Several saves/discards/undo/reset confirmations use native browser dialogs; `HttpQuestionBankGateway.savePair` itself invokes `window.confirm`.
- Existing tests protect important behavior: hidden drafts, new text entered during an in-flight save, stale previews, uncertain commits, cross-tab conflicts, paired cascade deletion, undo, activation, and responsive widths. These are redesign requirements, not incidental implementation details.

The live page was inspected without saving or publishing content. Current architecture check passes: 280 modules, 1,194 imports.

## Proposed information architecture

### Compact application header

Desktop order: **existing AppBrand + “Content admin” | workspace status | Review & publish | More | Account**.

- Reuse `AppBrand`; do not redraw the mark or imitate the wordmark.
- One restrained status affordance opens workspace details. Show “Up to date”, “Draft changes”, or “Unsaved edits”; details separately identify both sections' unsaved work and whether saved content differs from the publication.
- “Review & publish” opens a focused flow. It is disabled with visible explanatory text when there are no publishable changes or editing/recovery prerequisites remain. Do not rely on a tooltip attached to a disabled button.
- **More** contains “Export content…”, “Published versions…”, “Undo last saved change…”, “Reset draft to published version…”, and “Refresh content”. Group destructive draft reset separately from routine utilities.
- **Account** contains sign-out and session details. Reauthentication is available there but is primarily offered when the server requires it.
- Remove the always-visible publication reason, retained-release selector, raw revision sentence, and three refresh buttons. Keep technical context in an expandable Details area.
- A recovery banner appears below the header only when needed. “Check save status” replaces “Reconcile operation” in user-facing copy. Do not hide unresolved writes in an overflow menu.

Use a dedicated admin header with MUI `Box`/`Stack`, `Button`, `Menu`, `MenuItem`, `Divider`, and an accessible account `IconButton`. Reuse `AppShell` through its existing header slot; avoid changing the learner `AppHeader` solely for admin needs.

### Content workspace

Use MUI `Tabs` for **Quizzes / Flashcards**, with persistent draft-state indicators on each tab. Preserve both editors' unsaved text when switching sections.

At desktop widths, use two columns: a roughly 280–320px navigator and a flexible editor. Fold the standalone status column into contextual feedback and an expandable validation region. Keep one stable editor action bar close to the content rather than scattering actions across panels.

Navigator:

1. Searchable Subject picker.
2. Searchable Quiz or Deck picker within that subject.
3. Contextual “Add quiz” / “Add deck” and “Add questions” / “Add cards”. Use explicit object names instead of repeated “Add”.
4. Search, result count, canonical-order rows, and existing 25-record pagination.
5. Parent actions in labelled menus such as “Subject actions” and “Quiz actions”. Delete stays in those menus, with the existing cascade review.

Make “Manage subjects…” available from the subject picker area in either section. Open a shared subject dialog so flashcard authors do not unexpectedly switch to Quizzes. Clearly communicate that subjects are shared by both banks.

Editor:

- Show subject/parent breadcrumb context, record heading, secondary stable ID, and a record-actions menu.
- With no selection, show a concise “Choose a quiz” / “Choose a deck” state and the relevant add action. Do not display an empty 16-line editor and a disabled Save button.
- On a selected record, provide **Edit / Preview / JSON** views. Edit uses structured fields; JSON remains an expert escape hatch. Preview uses the actual shared content renderer.
- Place a compact unsaved/saved status and Save draft action in the editor footer. A successful save changes this to “Saved to draft”; publication remains a separate header action.
- Show validation errors beside their fields and in a navigable summary. Warnings remain visible and distinguishable from blocking errors. Technical paths remain accessible.

### Structured editing and exact content preservation

Introduce forms incrementally: subject, quiz, deck, card, then question. The finished redesign includes all five; header cleanup alone is only an intermediate milestone.

- Subject: name and existing accent value. Quiz/deck: name, parent relationship, and deck description. Card: front, back, sources, review note.
- Question: stem, ordered choices, source answer, verified answer, rationale. Put answer-review notes, rationale provenance, choice explanations, pearls, and metadata in clearly labelled expandable sections.
- Retain authored Markdown/HTML/math as source text in multiline fields. Preview renders it through `MarkdownContent` with the same rich/restricted modes as learner content. Do not introduce a WYSIWYG conversion that normalizes source text.
- Source answer and verified answer remain distinct. Existing source answers are read-only in the ordinary form; correcting source transcription is a deliberate advanced action with a recorded reason, never a side effect of verification.
- IDs are read-only. Relationships use explicit move actions; order uses accessible Move up/down controls. Do not remap choice labels, renumber choice IDs, or reorder records merely by rendering/editing the form.
- Keep a single draft representation. Form changes patch only edited fields; preserve optional fields, sparse values, nested metadata, choice IDs, and exact authored strings. Invalid JSON remains editable in JSON view; do not discard it or silently switch to a partial form.
- Switching views must not mark an unchanged record dirty, lose unsupported-but-valid fields, or change canonical serialization. Schema validation remains the authority for what is accepted.
- Subject/quiz/deck deletion and moves retain their explicit existing operation semantics. Do not add unsupported entity moves simply by exposing editable parent IDs.

## End-to-end workflows

### Edit and save

Choose subject → quiz/deck → record → edit → Save draft → review changes and enter/confirm change reason → confirm Save draft → inline saved feedback.

Use one MUI review dialog, replacing the duplicate native confirmation. Review shows the destination and server-produced impact. Reason edits invalidate any existing server preview. Preserve explicit preview/confirmation and its fingerprint; the new UI must not weaken the save contract. New text entered during a request must survive that request's completion.

Provide a rendered Preview view for proofreading without implying that it is saved. Changing a parent/record with unsaved work opens a common “Keep editing / Discard changes” guard. Do not add automatic saves or an implicit “save everything” across both sections.

### Add content, including large batches

Contextual Add opens the same three-stage composition for both sections: **Content → Review → Save draft**. The destination is preselected from browsing context and remains visible.

- Offer a single-record form or **Bulk JSON**, using existing content-only templates and compilers. A populated quiz must be created with its required question content; do not promise an empty-quiz save the validator rejects.
- Retain multiple quizzes/decks per batch, copy-template/file-selection conveniences where currently supported, and grouped validation. Label pasted JSON as batch content, not a database import.
- Review shows per-parent counts, validation, and clearly distinguished provisional versus server-reserved identities. Reserve IDs through the existing gateway, never in the browser.
- The gateway currently limits a save to 10,000 new records. Explain that limit before reservation and ask the author to split oversized batches; do not silently split one review into multiple writes.
- Content, destination, reason, authentication, or server-context changes invalidate the applicable preview. Failed saves retain all entered content.

### Publish

Review & publish → resolve unsaved work in either section → enter release reason → request current server preview → review quiz and flashcard changes together → confirm publication → show published success.

The review uses a readable impact summary for subjects, quizzes, questions, decks, and cards; expandable affected IDs; validation warnings; and one explicit “Publish quizzes and flashcards” final action. Show “Learners will see this version” and distinguish it from saving a draft.

Respect fresh-authentication requirements. If sign-in is needed, preserve editing text, complete authentication, invalidate the old review, and require a fresh review and explicit confirmation. Never automatically resend a mutation after authentication.

### Export and published versions

- Export dialog offers **Saved draft**, **Current published version**, or **Selected published version**, and shows the chosen context before download. Unsaved text is excluded and explicitly identified. Export always contains the paired banks; it is not a full database backup.
- Published versions opens a lazily loaded, paginated list. Use the publication sequence and release ID currently returned by the API; do not invent timestamps, author names, or release notes.
- A selected version offers Export and **Use this published version…**. Activation review explains that it changes learner content while preserving the current draft. Confirm through the existing activation preview/fingerprint flow.
- After activation, expose a stale draft-base warning if applicable. “Reset draft to published version…” is an explicit separate action with affected scope, retained-history explanation, and unsaved-text handling. Never silently reset or merge.
- “Undo last saved change…” describes its paired scope and target revision. Do not present an arbitrary history timeline or per-record undo that the current UI/API does not support.

### Deletion and a content rebuild

Delete quiz/deck → review cascade counts and affected records → confirm saving the deletion to the draft. Subject deletion additionally shows effects on both banks and guards hidden drafts. Initial focus stays on Cancel; stale/busy reviews cannot commit.

Rebuilding content uses these same flows: retain subjects, delete old parents, add replacements in batches, review, and publish. Add a short task-oriented help entry explaining this sequence. A new “delete all content” operation is outside this redesign and requires a separate concrete scope; it is not necessary to deliver the new UX.

## State, feedback, and recovery

Model independent facts rather than a single status enum: session/access, in-flight or uncertain operation, snapshot freshness, per-section local dirty state, saved-draft versus publication difference, and current review validity.

Presentation priority: blocking recovery/error → unsaved work → saved draft changes → up to date. Details always expose the underlying distinctions. Dirty state must be reactive; the current ref-only aggregate is insufficient for a live header/tab indicator.

- Session expired: preserve text; “Sign in to continue”. Signed-out users see a branded entry screen and one Sign in action, not the entire disabled toolbar.
- Session fresh-factor expired: contextual reauthentication; invalidate review; no mutation replay.
- Stale context: “Content changed elsewhere” with Refresh content. Refresh keeps entered text and demands re-review; it must not silently replace a dirty form.
- Unknown commit outcome: persistent “We could not confirm whether this saved” banner with Check save status. Block writes across both sections and all dialogs until reconciliation finishes. Distinguish confirmed commit from no receipt without calling either an error indiscriminately.
- Busy: one shared mutation admission policy plus local loading indicators. Prevent duplicate submit, undo/reset/activation races, and hidden-section writes.
- Success: concise local feedback or existing toast presentation. Only blocking/recoverable problems stay persistent; avoid alert stacks for ordinary success.
- Global review actions identify which section has unsaved content and provide a “Go to edits” action. Do not discard hidden drafts to make a publication possible.

## Components and ownership

Prefer focused compositions over a universal admin component framework. Names below are proposed, not existing exports.

Reuse unchanged where possible:

- `AppBrand`, `AppShell`, shared theme, `MarkdownContent`, loading surfaces, and existing notification primitives.
- `AdminIssues`, `AdminRecordSelection`, `AdminDeleteDialog`, navigator selectors, operation application, serializers, and bulk compilers.
- `useAdminEditor`, `HttpQuestionBankGateway`, and `PairedHttpClient` as starting owners of existing state and transport semantics.

Add/extract under `src/admin`:

- `AdminHeader`, `AdminWorkspaceStatus`, `AdminWorkspaceMenu`, `AdminAccountMenu`: presentation receiving state/actions.
- `AdminPublicationDialog`, `AdminExportDialog`, `AdminVersionsDialog`: task-specific UI with loading/error/empty states and explicit targets.
- `AdminNavigatorFrame`, `AdminEditorFrame`, `AdminEditorActions`: layout slots used by quiz and flashcard composition. Customization through typed props/children and `sx` where needed; no arbitrary configuration DSL.
- `AdminSaveReviewDialog`, `AdminUnsavedChangesDialog`, `AdminRecoveryBanner`: shared admin interaction patterns with task-specific callbacks/copy.
- `SubjectEditorDialog`, `QuizRecordEditor`, `DeckRecordEditor`, `CardRecordEditor`, `QuestionRecordEditor`: schema-aware forms; share Markdown text/preview and choice-field presentation only where there is demonstrated reuse.
- `useAdminSession` and `useAdminPublication` may extract focused orchestration from `HttpAdminApp`. Keep ownership explicit and avoid several hooks independently fetching or mutating the same snapshot.
- Pure draft adapters and status/action eligibility calculations belong in `src/admin/core`. HTTP methods and prepared-command lifetime remain in `src/admin/data`. Neither may import React/MUI.

Replace `window.confirm` in `HttpQuestionBankGateway` by exposing a prepared review/commit contract to presentation. UI cancellation must retain text and avoid commit; context/fingerprint validation still happens at the gateway and server. Keep the existing in-memory test double aligned. This is a deliberate boundary repair needed for consistent dialogs, not a rewrite of the paired authoring service.

Do not move admin-only components into `src/shared`, import learner feature components, add a form/state library without demonstrated need, or introduce app-wide theme changes for this page.

## Theme, responsive layout, and accessibility

- Use existing `primary.main` (`#b9511b`), warm background/paper/text tokens, Inter stack, 14px panels, and 10px interactive rows. Preserve the canonical brand palette independently of action colors.
- Neutral styling for navigation/utilities; orange for the current primary action; semantic colors for errors/warnings/success. Avoid orange on every text button.
- Target a single roughly 64–72px desktop header row. At 390px, use two intentional rows rather than uncontrolled wrapping: compact brand/account, then status/publish/more. Long localized labels may wrap without clipping.
- At `lg`, navigator and editor are top-aligned columns; below `lg`, full-width stacked sections. Bound only long navigator/review lists. Keep the currently documented 390/1048/1440px geometry guarantees.
- Full-screen MUI task dialogs on narrow displays; normal constrained dialogs on desktop. Editor footer may be sticky within its surface if it does not obscure fields, errors, or the virtual keyboard.
- MUI Tabs/Menu/Dialog semantics, labelled icon actions, visible focus, keyboard ordering, Escape/cancel, focus return to trigger, live status announcements, reduced motion, and 200% zoom checks are acceptance requirements.
- Detailed technical identifiers remain selectable in disclosure areas. Do not remove diagnostic paths or complete deletion counts in the name of minimalism.

## API feasibility and boundaries

The main redesign can use existing paired draft, preview/save, publication, activation, reservation, reconciliation, and export endpoints. Keep request preconditions and one-attempt mutation behavior intact.

The preview response includes counts, affected IDs, total affected, a validation warning count, and fresh-auth requirements. Implementation verified that `validation.warnings` is a number; detailed server warning messages/paths are not part of this endpoint. The service truncates each affected-ID group to 100: show “Showing 100 of N” where relevant. Do not imply a full paginated server diff exists. Deletion reviews can still use their existing complete local impact inventory. A complete historical field diff or rich release timeline would require separately scoped API work.

Current design documentation contains stale per-section export/file-replacement wording; align it with the current PostgreSQL-only paired export workflow during implementation. Historical ADR language about JSON authority is superseded by current content-source policy, not a basis for restoring file authoring.

## Delivery sequence and checkpoints

- [x] Inspect workflows, UI, theme, contracts, and regression coverage.
- [x] Record design, component ownership, sequencing, and acceptance criteria.
- [x] **1. Header and state foundation.** Extract compact header and menus; centralize reactive dirty/recovery/busy facts; move publication/export/version controls into focused dialogs. Preserve existing editors and transport behavior. Checkpoint: every existing header capability is reachable, recovery is surfaced contextually, and exports have explicit targets.
- [ ] **2. Shared review and recovery interactions.** Replace native save/discard/undo/reset confirmations with MUI flows; extract the gateway review/commit boundary; render server publication impact and warnings. Checkpoint: no mutation replay, stale review, hidden-draft loss, or double confirmation.
- [ ] **3. Unified workspace and batch creation.** Consistent navigators, contextual Add menus, content empty states, editor action/status region, subject dialog, and shared batch flow framing. Checkpoint: both sections support the same discoverable browse/add/review/save pattern at all target widths.
- [ ] **4. Structured authoring.** Implement exact-preserving adapters; simple entity forms first, question form second; shared rendering preview; advanced JSON retained. Checkpoint: round-trip parity and all supported optional fields/choice IDs/order/provenance survive untouched.
- [ ] **5. Integrated acceptance and documentation.** Run regression gates, inspect visual/accessibility states, update design/product/content/testing docs, and record evidence. Move this tracker to `docs/work/done` only when implementation and required verification are complete.

Each checkpoint is a small coherent reviewable change. Do not present stage 1 as completion of the full redesign.

## Verification and acceptance

Unit/component coverage should target behavior rather than incidental copy/style:

- State precedence, action eligibility, explicit export target, cross-section dirty indicators, and focusable explanations for blocked actions.
- Form/JSON parity with sparse metadata, optional values, exact Markdown/math strings, answer provenance, stable choice IDs/order, invalid JSON retention, and no dirty state on view switching.
- Shared dialogs: cancel preserves drafts, stale review rejects commit, busy double-click prevention, initial focus and focus return, warnings and capped affected-ID evidence.
- Existing core/gateway/controller tests plus new prepared-review/commit cancellation and invalidation tests.

Browser acceptance on disposable PostgreSQL fixtures:

1. Edit each entity type, bulk-add quizzes/decks/questions/cards, validate/save, reload, and confirm exact paired content.
2. Preserve drafts while switching sections, searching/paging, cancelling parent changes, refreshing, signing out/in, and completing an in-flight save after newer typing.
3. Publish a reviewed pair, activate a retained version, export each explicit target, undo a saved deletion, and reset with an explicit stale-base decision.
4. Exercise two-tab conflicts, expired/fresh authentication, cancelled sign-in, lost commit response, reconciliation, and global write blocking. No mutation automatically retries.
5. Keyboard-only navigation, focus restoration, dialog cancellation, text zoom/reduced motion, long labels/IDs, and 390/1048/1440px layouts in both sections. Header must not recreate the supplied multirow control wall.
6. Preview synthetic rich/hostile content using the same renderer as learners; assert no canonical text change. Confirm unchanged learner progress and default learner bundle isolation.

Run lint/architecture, architecture tests when contracts/imports change, relevant unit tests then full frontend suite, `npm run typecheck`, learner and enabled admin builds sequentially, and learner/admin browser suites as required by `docs/testing.md`. Use `npm run verify:full` for final integrated acceptance when the environment is available; serialize shared dist builds. Run backend checks if API contracts change. Never exercise destructive acceptance scenarios against the local authority.

For this planning-only change: architecture check passed. Typecheck/build and diff-check results are recorded below after execution. No implementation correctness, visual prototype fidelity, or browser regression pass is claimed by this plan.

## Planning verification results

- `npm run check:architecture`: passed (280 modules; 1,194 imports).
- `npm run build`: passed, including `tsc -b`; Vite reports its existing >500 kB chunk-size advisory.
- `git diff --check`: passed before final evidence update; final check repeated at handoff.
- Companion workflow canvas: TSX syntax and strict typecheck passed against the installed canvas SDK declarations. It is a planning schematic, not a rendered production UI acceptance result.
- No application source or canonical content was changed. Full unit/browser/backend suites are implementation acceptance work, not claimed as passed here.

## Implementation progress — first stage-1 slice

- Added a compact dedicated `AdminHeader` through the existing `AppShell` header slot, with workspace status, Review & publish, More, and Account. Native undo/reset confirmation remains unchanged for stage 2.
- Added reactive per-section unsaved facts and section indicators while retaining both editors. A pure status calculation separates browser edits, draft/publication differences, stale draft bases, and uncertain writes; blocked publication has visible explanatory text.
- Moved publication reason/review into a focused responsive dialog. Reason, section-dirty, and gateway-context changes invalidate publication review; late preview responses cannot restore an invalidated review. Publication impact still uses the existing technical JSON representation pending stage 2.
- Added explicit paired export targets for saved draft, current published version, and selected published version. Opening export from a version selects that version explicitly; opening the header export starts with saved draft. Version selection no longer silently controls ordinary export.
- Moved the paginated published-version loader into an on-demand responsive dialog; retained activation keeps its explicit server preview/confirmation and preserves the draft. Added contextual uncertainty/reconciliation feedback and retained authentication access during recovery.
- Canonical content, stable IDs, schemas, backend endpoints, learner persistence, and gateway save contracts are unchanged.

Stage 1 remains unchecked until shared editor/header busy admission and integrated acceptance are complete. The existing editor-local busy guards and paired client's uncertain-operation guard remain; this slice adds synchronous admission for header commands only. Shared save/discard dialogs, readable impact review, workspace/forms, and accessibility acceptance remain in their planned stages.

Verification evidence for this slice:

- `npm run lint`: passed; architecture valid (287 modules, 1,214 imports).
- `npm run test:architecture`: 10 passed.
- `npm run test:ci`: 95 files / 586 tests passed. Focused new status/header/export tests: 7 passed.
- `npm run build` and `npm run test:e2e`'s fresh learner build/typecheck passed. The learner build retains the existing >500 kB advisory.
- `npm run build:admin`: passed after learner browser acceptance; optional HTTP editor assets included.
- `npm run test:e2e`: 43 Chromium tests passed on disposable PostgreSQL.
- `npm run format:check`: passed.
- Explicit synthetic paired content validation: 0 errors, 1 warning. No authority export or canonical content was changed/validated.
- Admin browser run: 24 of 26 scenarios passed; publication review and in-flight logout failed. Both defects were corrected, then `npm run test:e2e:admin -- --grep 'edits both banks|logout wins'` passed both scenarios on a fresh disposable PostgreSQL fixture (including publication, activation, export, session revocation, and retained editing text). The other 24 passing scenarios cover unchanged paths; a second complete 26-test run is not claimed.
- Browser acceptance caught a stale frontend preview type: `validation.warnings` was declared as an array but the existing API returns a numeric count. The declaration and publication rendering now match the server; no endpoint changed. The in-flight logout regression also exposed an obsolete toolbar locator and an overly broad account-action guard; the menu locator is updated and account changes retain their existing ability to revoke a session during an editor write, without replaying it. Both corrected paths passed the targeted rerun.
- Header geometry checks passed at 390/1048/1440px. Inspected synthetic-content mobile and desktop screenshots: the mobile action row no longer wraps More to a third row; desktop controls occupy one row. Manual keyboard/assistive-technology/device acceptance beyond the automated suite remains open.
- Final lint/architecture, `npm run typecheck`, and `npm run build:admin` passed again after the warning/account corrections.
- `git diff --check`: passed; repeated after this evidence update. Source and browser-test formatting checked at handoff.

Initial simultaneous browser/unit/build execution encountered timeouts under load and was interrupted; those incomplete runs are not passes. The final unit and learner browser results above are sequential reruns. Backend checks and `verify:full` are not claimed: no API/schema/transport contract changed, and this is an intermediate UI slice. Manual assistive-technology/device acceptance and the remaining redesign checkpoints remain open.

## Implementation progress — shared admission and prepared save review

Continuation scope: finish the shared busy foundation and implement the save/publication/history review portion of stage 2. Native unsaved-discard guards and editable reasons for flashcard saves remain follow-up work; stage 2 is not complete.

- Added synchronous command admission in `PairedHttpClient`, covering each HTTP editor preview, reservation, review, and commit. Header operations use the same gate. Account actions remain available during an editor write and never replay content mutations. Reconciliation alone can admit a command with an uncertain receipt.
- Both editors receive shared blocking state; browsing guards and write actions respect it while JSON text can still retain newer typing during an in-flight save. Flashcard text edits now invalidate prepared paired reviews too.
- Removed `window.confirm` from `HttpQuestionBankGateway`. The gateway exposes a captured prepared-save review and explicit confirm/cancel methods. Confirmation is bound to the live review object, captured context, candidate, reason, and fingerprint; invalidation cancels a displayed review and rejects late preview responses. The command gate stays held while review is pending.
- Added responsive MUI save review with initial focus on Keep editing. Editor/batch/deletion preparation actions say Review save/Review deletion; the final Save draft action occurs in the server review dialog. Existing complete local cascade inventories remain available before server review.
- Added readable server impact counts for subjects/quizzes/questions/decks/cards, numeric warning counts, expandable affected IDs, and truthful Showing N of M disclosure for capped lists. Save, publication, and activation use the same presentation.
- Replaced native Undo/reset confirmations with focused MUI history dialogs, captured context, paired-scope explanations, retained-history/unsaved-text guidance, and stale/busy rejection.
- Added regression coverage for cancellation, review identity, duplicate confirmation, late previews, complete-command admission, uncertain writes, initial focus, capped IDs, and explicit browser save confirmation.

Canonical content and backend endpoints are unchanged; all browser mutations use disposable PostgreSQL fixtures. Stage 1's shared busy foundation is now complete. Stage 2 remains open for native unsaved-discard replacement, cancellation/status feedback, editable flashcard save reasons, and broader accessibility acceptance. This tracker remains ongoing.

- Recovery/sign-in actions are available inside blocked batch, deletion, and history dialogs. Expired/fresh authentication requirements block new writes until an explicit successful session refresh. Reauthentication invalidates prepared reviews without retrying mutations.
- Authentication completion immediately invalidates save/publication/history reviews. If a header request is still running, only a session refresh is queued afterward; no content mutation is queued or replayed.
- Nested save review explicitly focuses Keep editing after its opening transition, so a parent batch/deletion dialog cannot retain focus.

Verification evidence for this continuation:

- Full frontend suite, run serially with `npx vitest run --maxWorkers=1`: 98 files / 600 tests passed. This includes the unchanged learner navigation test that timed out in an earlier interrupted run.
- Final lint/architecture, typecheck, enabled admin production build, formatting and diff checks passed. Architecture valid: 294 modules / 1,242 imports. Architecture regression tests: 10 passed.
- Learner production build/typecheck and browser suite: passed; 43 Chromium scenarios on disposable PostgreSQL. The existing learner chunk-size advisory remains. Subsequent changes remain within the optional admin implementation and admin browser tests.
- Admin browser suite: 26 of 28 scenarios passed in the complete run. Both failures were test timing assumptions: after explicit confirmation, a parent batch dialog can be hidden by the closing server-review dialog before the save completes. The grouped-create and deck/card CRUD tests now wait for the expected saved database records. Their targeted rerun on a fresh disposable PostgreSQL fixture passed both scenarios, covering reserved IDs, exact text/provenance, ordering, cross-deck moves, deletion and undo. A second all-green complete 28-test run is not claimed.
- Passing browser cases also cover cancel/review/retry with zero writes on cancellation, uncertain reset plus expired-session reauthentication/reconciliation without replay, two-tab conflicts, fresh authentication, logout/newer typing during held saves, publication/activation/export, learner freshness, and both panels/header at 390/1048/1440px.
- Earlier overlapping and interrupted unit/browser runs are not passes. The serial frontend run and completed browser evidence above supersede those attempts. The activation test waits for its explicit committed response before polling state.
- No backend checks, `verify:full`, canonical-content validation, or manual assistive-technology/device acceptance is claimed for this intermediate UI slice. No authority content changed.

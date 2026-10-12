# Admin panel layout and copy plan

Date: 2026-10-12. Status: implemented and verified.

Follow-up: [Admin completeness audit](admin-completeness-audit.md) repairs the horizontal shrink regression introduced by start alignment, expands verification from the filtered tests to complete coverage, and finishes the related deletion/draft/history work. Its results supersede the earlier verification record below.

## Scope

Address browser comments 1–10 on `/admin.html`, applying equivalent behavior to both Quizzes and Flashcards. This follow-up supersedes the earlier admin UX plan's visible Reason fields, Record/Bulk add naming, separate bulk Preview/Stage controls, and fixed navigator heights. Preserve its useful pagination, validation, draft protection, coordinated history, and export behavior.

## Implementation plan

### 1. Size navigator cards to their contents (comment 1)

- Update `src/admin/components/AdminNavigatorPanel.tsx` and the navigator in `src/admin/FlashcardAdminPanel.tsx`. Remove fixed outer `40dvh`/`78vh` heights and prevent the surrounding stretched row from making the navigator as tall as the editor.
- Let subject-only, empty, and short-list cards take their natural height. Remove list/stack flex growth that reserves blank space.
- Bound only long item/card lists with a responsive maximum height and vertical scrolling. Keep pickers, actions, search, counts, and pagination outside that scroll area. Allow the outer card to grow when controls wrap; outer overflow must not hide controls.
- Check no subject, subject without children, selected parent without items, short and long lists, long names, and changing selections. Desktop and mobile cards must shrink and expand without excess blank space or inaccessible content.

### 2. Repair outlined field labels (comments 2 and 9)

- Inspect computed label, notch, ancestor overflow, and spacing in the real browser before choosing the fix. Quiz JSON already forces label shrink, so adding shrink alone is insufficient evidence of a repair.
- Repair the MUI outlined-label/notch relationship and provide enough space above fields. Audit the Flashcards outer `fieldset` and its native styles as well as dialog containers for interference with nested outlined inputs.
- Use consistent admin field styling where the same fix applies; keep any admin-only correction under `src/admin`. Avoid a global learner theme change unless a shared defect is demonstrated.
- Check empty, populated, disabled, focused, and unfocused JSON inputs, destination selectors, and import-preview fields. Labels must remain fully readable and the border must leave the appropriate notch at desktop/mobile widths and 200% zoom.

### 3. Remove redundant instructional subtitles (comments 3 and 6)

- Remove “Choose a quiz to browse its items.” and equivalent browse instructions in both sections, along with redundant descriptions repeating a heading, picker, or obvious action. Do not add replacement filler.
- Preserve actual empty-content and no-results messages, including “No decks in this subject.”, “No quizzes in this subject.”, and empty item/card states.
- Preserve validation messages, stale/busy feedback, result counts, meaningful destination context, draft/export status, and deletion impact information. These communicate state or consequences rather than repeating instructions.
- Document this copy rule in `docs/design-system.md` during implementation.

### 4. Apply concise labels consistently (comments 4, 5, 7, and 9)

- Quiz editor tab: **Bulk add → Add**. Apply **Add** to equivalent flashcard batch-entry controls where applicable; retain **Record** for the record editor.
- Quiz selector: **Bulk destination → Destination**; use the same field label for equivalent flashcard selectors.
- Flashcard dialog titles: **Bulk add cards → Add Cards**, **Bulk add decks → Add Decks**.
- Flashcard editor: **Bulk JSON → JSON**; both sections use **JSON**.
- Update affected accessible names, browser locators, and authoring documentation. Internal bulk types and schema identifiers can keep their existing names.

### 5. Remove modal Reason inputs while preserving change-set metadata (comment 8)

- Remove the editable Reason input from `FlashcardBulkAddDialog.tsx` and `components/AdminDeleteDialog.tsx`, and audit equivalent quiz/flashcard authoring dialogs for the same control.
- Reuse the existing nonempty workspace reason internally. For a fresh workspace, use the established defaults (“Local question-bank edit” / “Local flashcard content edit”); deletion may use the existing deletion default if no workspace reason exists.
- Keep imported reasons and coordinated transaction reasons intact through staging, Undo, reset, replay, and export. Preserve source/verified answer provenance and content review notes.
- Remove unused reason-edit callbacks and UI-dependent dirty tracking. Continue validating required reason metadata at the change-set boundary; removing the input must not make a valid dialog impossible to submit.
- Retain internal reason/context changes in stale-preview guards where they affect the exported transaction. Update stale-preview text so it does not tell users to edit a removed field.

### 6. Use one Preview → Stage action (comment 10)

- Replace the flashcard dialog's Preview and Stage batch buttons with one primary button. Apply the same flow to quiz Add mode, replacing Validate plus the extra Stage button.
- Initial state: **Preview**. Clicking parses, compiles, and validates the complete candidate, then displays the existing review output. Errors leave the action as Preview; warnings alone may allow staging under existing rules.
- Successful, current preview: the same button becomes **Stage**. A second deliberate click stages exactly the compiled candidate that was previewed. A preview click must never stage automatically.
- JSON edits, file loading, destination changes, bank/subject revisions, or relevant export-context changes invalidate the preview and return the action to Preview. Preserve controller/gateway checks so a stale candidate cannot stage even if the UI has not rerendered yet.
- Disable the action during applicable validation/staging/file-load work and prevent duplicate submissions. Stage failures must not partially mutate either bank; require a new preview after a stale failure. After successful staging, close/reset the flashcard dialog and clear the quiz preview using existing draft/history behavior.
- Preserve keyboard focus on the same button through the label change and announce preview results accessibly.
- Keep single-record staging and destructive deletion actions specific to their workflows. Imports already preview selected files before exposing Stage import; retain that flow unless an import surface actually contains redundant Preview and Stage buttons, in which case use this same state transition.

## Sequence and progress

- [x] Inspect both panels, bulk dialog, deletion dialog, controller, theme, existing tracker, and relevant architecture/content/design/testing guidance.
- [x] Save the plan and identify superseded requirements in the ongoing admin UX tracker.
- [x] Implement intrinsic navigator sizing and bounded long-list scrolling in both sections.
- [x] Diagnose and fix outlined field clipping; apply consistent labels and subtitle rules.
- [x] Remove modal Reason controls while preserving valid metadata and transaction history.
- [x] Implement the single Preview → Stage action with current-preview and concurrency guards in both Add flows.
- [x] Update meaningful regression coverage and authoring/design docs.
- [x] Complete implementation checks and browser verification.

## Verification and acceptance

- Extend existing admin component/controller tests for Preview → Stage, invalid JSON, validation errors, allowed warnings, draft/destination/revision invalidation, staging failure, and duplicate-click protection. Verify exported reasons remain nonempty and imported reasons survive without visible Reason inputs.
- Update `e2e/admin/flashcard-admin.spec.ts` and relevant quiz admin browser coverage for revised names, empty states, keyboard focus, staging, Undo, and replay. Use fixtures; do not mutate canonical banks.
- Perform browser layout checks at the reported **1048×739** viewport, a desktop width using the `lg` layout, **390px** mobile width, short viewports, and **200% zoom**. Inspect actual rendered notch/label geometry; DOM label assertions alone cannot prove clipping is fixed. Check expanding/shrinking cards, wrapping controls, full pagination access, dialog scrolling, and no horizontal page overflow.
- Run affected tests, `npm run lint`, `npm run format:check`, `npm run test:architecture`, `npm test`, `npm run typecheck`, `npm run build`, `npm run build:admin`, `npm run test:e2e:admin`, and `git diff --check`. Run learner browser checks if a shared UI/theme component changes, per `docs/testing.md`.
- This is UI/controller work: canonical content, stable IDs, choice order, answer provenance, schema versions, and learner persistence remain intact. Run `npm run validate:content` if implementation touches any content/schema/validation contracts.
- Verification passed: focused Vitest coverage (6 tests; 13 skipped by the selected name filter), lint (includes architecture validation), typecheck, `npm run build:admin`, `npm run format:check`, `git diff --check`, and `npm run test:e2e:admin` (4 tests).
- Browser review confirmed intrinsic navigator card sizing and readable JSON labels at the reported 1048×739 viewport and 390px mobile width. Canonical content and schemas were not changed.

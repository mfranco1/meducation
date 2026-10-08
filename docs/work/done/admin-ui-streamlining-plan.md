# Admin UI streamlining plan

Date: 2026-10-08. Status: complete.

## Scope and outcome

Streamlined `/admin.html` across Quizzes, Flashcards, and the flashcard bulk-add dialog. The JSON authoring workflows and controls remain unchanged, with less repeated instruction, neutral context, consistent warm primary actions, and geometry drawn from the existing theme. Changes were limited to admin presentation, tests, and documentation; learner code, shared theme/components, admin command/core/data modules, storage, build gates, and canonical banks remain untouched.

Implemented the admin presentation changes, regression coverage, and documentation. Learner code, shared theme/components, admin commands/core/data, storage, build gates, and canonical banks were left untouched. Selection, filtering, pagination, validation, staging, imports, exports, confirmation rules, and undo/reset semantics are unchanged.

## Findings and proposed changes

### Header and section navigation — `src/admin/AdminApp.tsx`

- Keep Meducation branding, Admin identity, Quizzes/Flashcards navigation, and existing header Import/Export handlers.
- Replace the permanently visible “Changes stay local until export.” subtitle with concise guidance in the authoring documentation and a contextual export notice when changes exist. Preserve the fact that export only downloads files and does not publish changes.
- Use `primary` for Export instead of `success`. Keep Import visually secondary. The header currently owns quiz export even while Flashcards is selected; retain that ownership and use an explicit “Export quizzes” label to avoid implying a flashcard export. Keep flashcard and paired exports in their current section.
- Derive header surface/border from existing theme values in admin-local styles. The existing hardcoded warm values are already on-brand; replacing them is consistency work, not a palette redesign.
- Keep section navigation as the current buttons so section-switch behavior and the mounted flashcard workspace remain intact.

### Quiz editor and navigator — `AdminApp.tsx`, `components/AdminNavigatorPanel.tsx`

- Keep Record/Bulk add tabs and the three bulk destinations. Render selected destination as neutral context rather than an `info` alert; show it once and retain the actual selected subject/quiz names.
- Remove the persistent paragraph beginning “Items need stem…” from the editor. Keep the complete field requirements and examples in `docs/content-management.md`; validation must continue explaining invalid drafts with paths. Preserve Reason, JSON, and destination field labels.
- Keep canonical record IDs and question snippets: IDs distinguish records with similar text and support review. Reduce visual emphasis on repeated parent metadata rather than removing identity or authored snippets.
- Use consistent 10px interactive-row corners and spacing for selected navigator rows. Keep the existing nesting, subject-only search, quiz scoping, and 200-question display limit. Do not replace it with the flashcard navigator's search or pagination behavior.
- Separate record actions (Stage, Delete) from workspace actions (Undo, Reset) with spacing and wrapping. Bulk Validate and Stage remain separate steps; Stage uses primary orange, while the validation result retains its real semantic severity.

### Flashcard workspace — `FlashcardAdminPanel.tsx`

- Remove the repeated “Flashcard content” heading and long subject-catalog instruction beneath the already selected Flashcards section. Keep the Subject/Deck picker labels and short actionable empty states.
- Deck picker options already include the deck name and count. Replace the repeated name/count line below the picker with only information needed to understand the card results; retain result count, page position, selected-card affordance, and empty/search-empty states.
- Preserve the meaningful Create/Edit deck/card heading. Keep Reason; align “Record JSON” visually with quiz JSON without changing its input semantics.
- Group Stage record/Delete/Move up/Move down separately from Undo/Reset and file actions, retaining all controls and their enablement conditions. Keep “Reset both banks” explicit and distinct from Reset.
- Shorten file action copy to “Export flashcards” and “Import change set”; when quiz changes are staged, describe the existing paired export contents beside that action. The download filenames, counts, manifest, bundle, and handlers stay identical.
- Replace the blue staged-changes info block with a compact textual status such as “Staged changes · not exported,” plus concise export/review guidance. Retain the distinction between draft, staged, and exported work. Keep validation errors, warnings, and import failures visible with their existing severity.

### Bulk dialog and import previews — `FlashcardBulkAddDialog.tsx`, both editors

- Render “Destination: …” as neutral text; move the repeated ID-assignment explanation into authoring documentation. Keep the selected destination visible throughout preview/staging.
- Align “Change reason” with the “Reason” label used in both editors. Keep Bulk JSON, Copy template, Load JSON file, Preview, Stage batch, and Cancel as available actions.
- Stage batch uses primary orange. Success green remains available for completed feedback; error/warning alerts retain semantic colors and explicit text.
- Remove the repeated “Cards will be appended…” line when the destination already makes it clear; preserve counts, generated IDs, canonical card order, front/back, sources, review notes, and the one-undoable-batch explanation. These are review evidence, not decorative subtitles.
- Keep import JSON read-only, paired quiz previews visible, stale-preview guidance prominent, and Stage import unavailable under its current rejection conditions. Do not collapse or hide actionable diagnostics as part of decluttering.

### Geometry, typography, and responsive behavior

- Use the existing theme: primary `#b9511b`, `background.default`/`paper`, `text.primary`/`secondary`, and theme divider treatment. Reserve green for success feedback, red for errors/destructive actions, and warning tones for actual warnings or pending export state. Routine context should be neutral.
- Panels and preview surfaces use 14px corners; controls and interactive rows use 10px. Preserve intentional connected-control geometry. Read computed styles before changing a radius: MUI `sx={{ borderRadius: 1 }}` already resolves to the theme's 14px, not 1px. The bulk preview's current radius therefore is not itself a confirmed defect.
- Use MUI typography consistently: small section/context headings, body-sized record content, muted captions for secondary metadata. Keep JSON monospace and preserve meaningful content formatting.
- Implement any reusable styles/components inside `src/admin/components`; consume the shared theme without editing it or introducing a global override.
- Retain the desktop navigator/editor/status layout, flashcard bounded scrolling, and narrow stacked layout. Wrap actions with real row gaps; avoid horizontal page overflow at 390px and 200% zoom. Do not shrink keyboard targets or suppress focus rings.

## Execution sequence

- [x] Inspect admin presentation, shared theme, ownership guidance, and authoring tests.
- [x] Document the copy/style inventory, protected behavior, and acceptance criteria.
- [x] Add fixture-based quiz navigator and status-panel baseline tests.
- [x] Record verification results for this planning pass.
- [x] Implement admin-local palette/geometry and action hierarchy changes.
- [x] Apply copy cleanup across both editors, dialog, and previews.
- [x] Update affected role/name queries and authoring documentation to actual final labels.
- [x] Complete responsive/style and authoring behavior verification.

## Tests and acceptance criteria

The new `AdminNavigatorPanel.test.tsx` protects parent-dependent Add availability, unchanged selection payloads, canonical ordering, and subject-search callbacks. `AdminStatusPanel.test.tsx` protects textual workspace states, error/warning priority, busy announcements, summaries, diagnostic paths, and suppression of irrelevant default instructions. These tests establish current behavior and should not freeze decorative copy or color.

Retain `useAdminEditor.test.ts`, `FlashcardAdminPanel.test.tsx`, and admin core tests for validation, stale previews, draft guards, atomic batches, undo/reset, provenance, and paired import/export. Existing admin browser flows cover flashcard CRUD, moving, deletion, exports, replay, shared subjects, and bulk batches. Update selectors only when a label actually changes; do not weaken download/content assertions to accommodate the redesign.

Admin browser coverage in `e2e/admin` verifies the initial quiz view at a 390px CSS viewport, keyboard activation of navigation, primary action color, panel radius, no horizontal overflow, and the existing CRUD, bulk preview, invalid draft, import, and export flows.

Acceptance: repeated explanatory subtitles removed as listed; critical authoring and export guidance still available; ordinary actions warm/neutral; real severity conveyed in text and color; all controls reachable and functional; canonical IDs/content and export bytes unchanged; learner/shared production files unchanged.

Verification: `npm test -- src/admin`, `npm run test:e2e:admin`, `npm run lint`, `npm run format:check`, normal build, enabled admin build with `VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build`, and `git diff --check`. Normal build omits `admin.html`; enabled build includes it. Content validation was unnecessary because canonical content and processing logic did not change.

## Verification results

- `npm test -- src/admin` — passed: 10 files, 64 tests.
- `npm run test:e2e:admin` — passed: 3 browser flows, including 390px keyboard/style checks and authoring CRUD/import/export.
- `npm run lint` — passed, including checked architecture boundaries.
- `npm run format:check` passed. Prettier checks passed for changed TSX files already following the repository's formatted style; three existing compact JSX files retain their established formatting to keep the diff focused.
- Normal build — passed with TypeScript checking and omitted `dist/admin.html`; enabled admin build passed and included it. Existing Vite advisory remains for a chunk above 500 kB.
- `git diff --check` — passed.

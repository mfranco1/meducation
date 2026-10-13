# L1 — Progress download/upload: detailed implementation plan

Status: in progress. Implementation began 2026-10-13 with the synthetic fixture and pure codec slice. Created 2026-10-12. Parent: [local-first preparation](local-first-production-preparation.md). Prerequisite met: [L0-A](../done/L0-local-contracts-plan.md) selected protocol with isolated/model feasibility evidence; application verification remains in this stage. L0 database/auth research does not gate this feature.

## Progress snapshot — 2026-10-13

Implementation is in **Steps 1–8**, but L1 is not complete. Step 1 fixtures/invariants and the Step 2 v1 codec contract are implemented with unit coverage. Steps 3–6 have runtime implementations; their broad application acceptance is incomplete. `npm run verify:full` passed end to end: lint, format, architecture tests, all 523 Vitest tests, actual content validation, backend Ruff/mypy/pytest (39 passed), typecheck, learner smoke build, all 18 learner Chromium browser tests, the admin build, and all 12 admin Chromium browser tests. The initial browser run exposed an exclusive-lock handoff bug; the test fixture also needed to avoid reseeding storage after controlled reload. Both were fixed before this full pass.

Remaining: finish B01–B12 application acceptance, add deeper restore/storage interruption and recovery admission cases, verify lifecycle/BFCache and unsupported/read/write capability cases, run the full learner/admin Playwright suites, and perform manual B13–B14 launch checks on real mobile and assistive technology. Step-level completion boxes mean the full acceptance gate, not merely that implementation began.

## Deliverable

A learner can download one JSON file containing both quiz and flashcard progress, select it later, review its contents, and explicitly replace local progress. Failed or interrupted restores preserve a recoverable state. No content/backend/authentication dependency is introduced.

Use the existing two v2 storage contracts with a separate versioned backup format. L0 Step 3 selects shared document participation with exclusive paired export/restore/recovery, preserving synchronous ordinary writes. L1 must integrate the admission guards, lifecycle ordering and bounded retry behavior from the ADR; L0 Step 6 acceptance is selected in the [browser checklist](L0-browser-acceptance.md); actual application tests remain required. Do not treat the synthetic probe as completed production coordination.

## Proposed module ownership

Use these names as concrete starting points; combine very small helpers when that is clearer.

- src/persistence/progressBackupCodec.ts: pure envelope encoding/decoding, bounded validation, summaries and error categories. It may import existing persistence codecs/domain types but not content or React.
- src/persistence/progressCoordination.ts: browser participation lease, restore exclusivity and capability state, with injectable test ports. Keep browser storage/coordination globals inside persistence as required by boundaries.
- src/persistence/progressRestore.ts: raw paired-state capture, journal lifecycle, restore/recovery and atomic publication of usable snapshots.
- Existing localRepository.ts/localFlashcardProgressRepository.ts: participation/journal guards, rehydration and subscriber refresh. Preserve normal domain behavior.
- src/app/components/ProgressBackupDialog.tsx: MUI presentation receiving data/actions via props; no direct localStorage access.
- src/app/useProgressBackup.ts: app-owned cross-feature composition, file handling and interaction state; invoke persistence services and composed session contracts, never sibling feature internals. App may compose concrete persistence services; the feature-session-only restriction applies within features.
- src/app/App.tsx, navigation/drawer and bootstrap: utility action, safe-view gating, recovery gate and post-restore reset.
- Colocated tests; tests/fixtures/progress-backups/ for small explicit contracts; e2e/progress-backup.spec.ts for download/restore and multi-page cases.

If file APIs/object-URL use needs a utility, keep it small and app-owned. Do not add a general settings framework, broad barrels, a third study feature or database code.

## Step 1 — Establish fixtures and observable invariants

- [x] Build a small quiz fixture with a paused active attempt, retained completions, completion counts greater than retained history, score/activity summaries and durable completed IDs.
- [x] Build a flashcard fixture with opened/flagged checkpoint IDs, completion counts and daily aggregates. Include explicitly empty progress and legacy-v2 optional fields normalized by current codecs.
- [x] Include unknown/deleted content IDs and changed content signatures; restore must preserve records without fetching content.
- [x] Capture existing storage behavior in affected tests: getters never write, snapshot identity remains stable, errors do not silently erase bytes, failed completion does not clear active progress, and counts survive pruning.

Acceptance: fixtures model meaningful histories, not production content snapshots. No content-bank modifications.

## Step 2 — Implement the versioned backup contract

Selected v1 fields (L0 Step 2):

- format: exact literal meducation-progress-backup.
- version: 1.
- exportedAt: canonical UTC ISO timestamp.
- quiz: schemaVersion 2 plus active, completed, completionCounts, lowestScores, latestScores, activity, completedIds; no runtime revision.
- flashcards: schemaVersion 2 plus checkpoints, completionCounts and dailyStats when present; no runtime revision.

- [x] Define a discriminated parse result with safe error categories: too-large, malformed-json, wrong-format, unsupported-version, invalid-progress, unsupported-browser and storage/recovery errors. Avoid dumping uploaded content in errors/logs.
- [x] Validate File.size before text(), then UTF-8 size and JSON syntax; MIME/extension are hints only. Bound depth/container/string sizes using L0 Step 5 limits (4 MiB file, depth 16, 250,000 visited nodes and explicit container/field caps); guard traversal without an unbounded recursive stack.
- [x] Reject unknown keys and __proto__/constructor/prototype property names at every object depth. Build fresh allowlisted structures; use safe record access for imported IDs. Never spread or recursively merge an unvalidated payload into application objects.
- [x] Validate finite safe counts, bounded percentages, nonnegative time, timestamp parseability/canonical representation, valid enums, unique milestones and safe ID lengths. Selected answers must obey current immediate-feedback lock rules.
- [x] Check score total = correct + incorrect + unanswered; percentage matches the existing rounding rule. Require completed IDs to be unique and present in completedIds; response map keys match questionId; active map keys match quizId; the same attempt cannot be both active and completed. Durable counts may exceed retained-history counts; do not require equality or recompute lowest/latest statistics from pruned history.
- [x] Preserve arbitrary valid stable IDs, source signatures and optional bank revisions without requiring today's bank. Validate flashcard aggregate invariants through the existing domain validator and retain local-date strings unchanged.
- [x] Encode active attempts without timerStartedAt/completedAt/score; encode retained completed attempts without timerStartedAt/contentSignature. Preserve optional contentRevision/currentQuestionId. Apply the selected L0 Step 5 source-only normalization and reject inconsistent/unknown fields rather than silently trimming them.
- [x] Apply the ADR’s quiz count/durable-ID/summary consistency and response/score rules; preserve unknown IDs without bank queries. Do not treat retained history as complete history or enforce wall-clock chronological/future-date restrictions.
- [x] Canonicalize legacy optional defaults only when defined by the existing schema. Do not trim malformed records into apparent success. Reject future backup versions before reading nested fields.
- [x] Encode with explicit field selection and deterministic serialization. Exclude storage revisions, arbitrary localStorage keys, authentication state and separate content banks. Step 1 audit found that existing active quiz contentSignature embeds question text/choices/answers; L0 Step 2 selects preserving that exact signature and a sharing warning; Step 5 selects a 512 KiB per-active-signature ceiling and a 4 MiB file cap. Do not promise text-free backups or silently replace existing signatures with hashes. Validate the encoded result with the same import contract before offering download.

Acceptance: own-format round-trip; all invalid fixtures yield safe errors and zero storage writes. Include near-limit accepted/rejected cases, nested dangerous keys, invalid dates, score mismatch, duplicate completions, fractional/unsafe counts and preserved unknown IDs.

## Step 3 — Add progress participation and recovery gating

- [x] Implement the L0-selected browser coordination adapter with dependency injection. For the selected shared-lease protocol, acquire participation before repository reads and check lease validity before every write.
- [x] Add an initialization/recovery state above study UI in app composition. Module-level repository creation must not read through the gate; lazy content loading can remain independent.
- [x] Guard both repositories against pending restore/recovery and invalid participation. Never refresh one displayed snapshot from an intermediate two-key write. Preserve existing frozen-snapshot behavior once ready.
- [x] Add explicit local invalidation/subscriber refresh after a committed pair; storage events alone do not notify the writing tab. Deduplicate recovery/initialization across both repositories.
- [x] Implement browser lifecycle handlers as selected by L0: retain participation through synchronous pagehide save; revalidate on pageshow (persisted returns must discard stale sessions and re-enter boot, preferably via controlled reload); block writes after lost participation. No uncoordinated fallback writes during restore.
- [ ] Apply the Step 6 capability matrix: disable normal paired export/restore and persistent study writes without valid coordination; preserve safe browsing and exact saved bytes. Pending/unreadable journals require recovery gating. Do not add a repeated-snapshot export fallback or silently use an empty/transient store. Test actual acquisition/access failures, capability copy and no-write behavior.

Acceptance: existing repository/session tests pass with the coordinator injected. A second initialized page cannot write during exclusive restore, and a fresh page cannot observe half-restored progress. Suspended/legacy-tab limitations match documented guarantees.

## Step 4 — Implement safe export and preview

- [x] Refuse normal export if either repository reports corruption/unavailable storage. Missing keys normalize to valid empty progress; corruption never becomes an empty successful export.
- [x] Acquire exclusive paired-capture access after gating this document and releasing its shared lease; if other tabs block it, capture nothing and offer close-tabs/retry guidance. This is read-only and does not journal. Capture a consistent pair under the L0 protocol. Normalize backup active timers to paused values; never add time between export and import. Include all durable summary fields and signatures.
- [x] Serialize and revalidate, enforce the export cap, then provide filename meducation-progress-YYYY-MM-DD.json using a sanitized generated date. Create/revoke Blob URLs; do not promise that a browser download proves an off-device backup exists.
- [x] On selected-file validation, produce counts for retained completed attempts, saved quizzes, saved flashcard decks and total recorded completions. Label totals distinctly; do not confuse saved checkpoints with completions.
- [x] Capture exact current raw base values/revisions alongside the immutable preview. New local changes invalidate the preview; never silently update the replacement target while confirmation remains open.
- [x] Offer a current valid backup download before replacement. For corrupt current bytes, offer a clearly labelled raw recovery file only if implemented; such a file is not accepted by the normal importer.

Acceptance: export performs no progress mutation; paused backup timers remain paused after delayed restore; corrupt state is visible; repeated export/import preserves data within defined normalization rules.

## Step 5 — Implement replacement and deterministic recovery

Suggested persistence API: captureBackup(), previewBackup(fileData), restoreBackup(previewToken), inspectRecovery(), recoverProgress(). Exact function names may vary; all mutable storage operations stay in persistence.

- [x] On confirmation, close ephemeral review/results state and block same-tab study/writes. Acquire exclusive participation as selected in L0; if another tab prevents it, write nothing and offer retry after closing other tabs.
- [x] Recheck current raw values against the preview. If different, release/rejoin normal participation and require a new preview. Validate target again immediately before journaling.
- [x] Generate fresh independent v2 revisions and complete target raw strings. Use journal key meducation.progress.restore.v1 and the L0 Step 4 schema: fixed original/imported pairs, operationId, format/version and decision original/imported. These equal-length decision values mean prepared/committed. Create a prepared journal containing both original raw values/nulls and both targets. Enforce combined originals <=4 MiB, targets <=4.25 MiB and fully escaped journal <=20 MiB, with all nested target validation, before persisting. Raw recovery output cap is 64 MiB and is not ordinary-import data.
- [x] Persist/read back the prepared journal before changing either progress key. If reservation fails, originals remain unchanged and the user sees a storage-space error.
- [x] Write/read back quiz target and flashcard target. Persist/read back the committed marker only after both verify. Treat this marker as the decision point.
- [x] On any failure after preparation, re-read the actual journal under exclusivity. Readable decision original selects rollback, imported selects roll-forward; inaccessible/invalid state stays gated. Do not infer rollback from a failed marker write/readback. When rolling back, restore both originals; remove originally absent keys via removeItem. Verify before cleaning up. If rollback cannot finish, keep the journal and recovery gate; never resume ordinary study with a mixed pair.
- [x] After the marker, failure cleanup/reload must complete the target pair, not roll it back. Keep operations idempotent so repeating recovery cannot increment counts. Clear the journal only once the chosen pair is verified.
- [x] Refresh both repository snapshots and reset stale editing state before showing success and returning to a dashboard. Prefer a controlled reload after successful restore if that most reliably reconstructs module-scoped instances; ensure pagehide cannot re-save the discarded pre-restore session during that reload.
- [ ] At startup, inspect journal before exposing progress. Valid decision original => restore originals; valid decision imported => retain/complete targets. Unexpected progress values outside either recorded pair or a mismatched operation require conflict handling, not overwrite. Invalid journal => preserve bytes, block writes and show explicit recovery actions. All recovery runs under the same exclusivity protocol. Current boot screen retries/reloads but lacks the selected three-key raw recovery action.

Acceptance: inject failure after every mutating operation; each restart deterministically selects originals or targets based on the persisted decision. No silent empty fallback, duplicated completions or discarded journal. Cleanup failure may show a recoverable state rather than success.

## Step 6 — Integrate the learner dialog

- [x] Add Progress backup to the drawer with a clear label/icon and accessible collapsed tooltip. It is a utility dialog, so existing quiz/flashcard destination identity remains unchanged.
- [x] Gate opening during active quiz/flashcard study with save-and-leave guidance; do not pause/finish/abort a session implicitly. From review, run the existing exit confirmation before opening the utility; cancel keeps review, confirm leaves to the Quizzes dashboard and opens the utility. The separate restore preview must still be explicitly confirmed. Cancel pending quiz/deck launches before opening from other non-editable views.
- [x] Provide Download backup and Choose backup file actions. Show reading/validation status, preview counts/date, replacement warning, Cancel and Restore backup. Clear input so selecting the same file again works.
- [x] Disable duplicate actions during commit/recovery. Cancellation before commit clears only preview memory. Once writes begin, prevent closing via backdrop/Escape and explain the ongoing restore; browser termination is handled by the journal.
- [x] Use the existing theme and MUI dialog patterns, keyboard focus trapping/restoration, polite progress announcements and alert errors. No raw technical exception/status text in product UI.
- [x] Explain that data stays in this browser, clearing site data removes it, and backups enable manual transfer. Do not call restored statistics authenticated or tamper-proof.
- [x] Keep file contents out of logs/telemetry, clear memory on dismissal, revoke object URLs, and restore focus after cancellation/success. No network requests should be necessary for this workflow.

Acceptance: keyboard-only, mobile-width, reduced-motion and no-network browser flows work; errors leave the user able to retry or cancel safely.

## Step 7 — Run adversarial and regression tests

Use [L0 browser acceptance](L0-browser-acceptance.md) B01–B14 as the feature acceptance checklist. Add explicit Chromium/Firefox/WebKit projects; verify:full currently covers Chromium only. Record real BFCache/fresh-load paths and keep manual mobile/assistive-technology checks as launch gates.

- [ ] Codec tests: valid empty/populated/legacy optional cases; unsupported envelope/schema; wrong app; dangerous keys; huge/deep content; invalid dates/numbers; duplicates; map mismatches; impossible score totals; missing system; unknown content IDs.
- [ ] Export tests: corrupt-storage error vs missing-key empty state; durable history after pruning; active timer normalization; timezone-preserved flashcard dates; size-cap consistency; no mutation on export.
- [ ] Recovery tests: throw at journal reservation, first/second target, readback, marker, rollback, removeItem and cleanup. Reconstruct fresh repositories and run recovery twice. Test malformed journal, original absent/corrupt bytes, unexpected third values, cleanup uncertainty and committed-marker write-success/read-failure. Use the Step 4 design model as supporting evidence, not a substitute for real implementation/quota tests.
- [ ] Concurrency tests: preview becomes stale; simultaneous restores; another current-version page holding participation; tab closed/crashed; fresh page during commit; storage-event refresh and same-tab subscribers; pagehide/pageshow regression. Keep legacy-tab limitations explicit rather than writing a test that claims to fence old code.
- [ ] Browser tests use Playwright same-context pages sharing localStorage. Exercise genuine download and file selection, cancel and repeated file choice, overwritten progress, delayed timer restore, imported checkpoint resume, current-content mismatch restart, and network unavailable during backup workflow.
- [ ] Run full existing quiz/flashcard persistence/session regressions, including the saved timer, completion deduplication, quota failure, stale editing views and snapshot identity.

## Step 8 — Validate and document completion

- [ ] Run targeted changed tests during implementation; once complete run npm run verify:full and any added multi-browser/lifecycle cases not included by that runner. Run the plain npm run build if needed for the minimum typecheck/build evidence.
- [ ] Confirm learner build still excludes admin.html/QA and no eager canonical-bank import was added. Verify ordinary admin tests remain passing because the drawer/composition changed.
- [x] Run npm run validate:content, architecture checks and git diff --check; compare protected content files to confirm no authored content changes.
- [x] Update docs/product.md, docs/architecture.md, docs/testing.md and the backup format/ADR with the implemented behavior, exact limits, compatibility and recovery status. Document remaining manual mobile and accessibility checks as launch gates.
- [ ] Record checks/results in this tracker, update parent L1 boxes, and move this tracker to docs/work/done only once the feature and relevant checks pass. Keep the parent ongoing for L2–L6.

## Suggested reviewable implementation slices

1. Codec/fixtures and validation tests (step 1–2).
2. Coordination/boot/repository guards with lifecycle tests (step 3).
3. Export/preview and journaled restore/recovery tests (steps 4–5).
4. Dialog integration and browser verification (steps 6–8).

Each slice should remain coherent and buildable. Do not expose a Restore action until the recovery and concurrency tests pass. No deployment, accounts, backend routes or Postgres implementation are part of L1.

## Implementation progress

### 2026-10-13 — Initial implementation, audit fixes and acceptance

- Added synthetic populated and empty v1 fixtures with paused quiz progress, retained and durable totals, pruned/unknown IDs, changed flashcard signatures, checkpoints and daily aggregates. Added codec, coordination, admission, export, file-selection, dialog and journaled restore modules with colocated tests.
- Integrated shared Web Locks admission before app mount, repository read/write guards, journal recovery before progress exposure, pagehide/pageshow lifecycle behavior, same-tab paired refresh, and the Progress backup drawer/dialog flow. Active quiz/review and flashcard study paths require explicit leave confirmation. File size is checked before reading; corrupt live progress is not silently exported as empty. The preview offers a bounded non-importable raw recovery copy for corrupt current progress; the startup recovery screen still offers retry/reload only, so raw capture of an inconsistent three-key journal state is not implemented.
- Audit fixes added fresh allowlisted codec projection with sorted map serialization, nested dangerous-key rejection, safe read-only browsing where Web Locks are unsupported, local read/write capability probes, cancellation-safe file parsing, visible current-progress totals, and a raw-corrupt-pair recovery download in the preview. A Chromium browser run exposed and fixed an exclusive-lock handoff race. The E2E fixture now avoids reseeding progress after controlled reload. Step 3 capability matrix and the broad acceptance criteria for Steps 4–8 remain open; startup journal-conflict raw recovery, exhaustive fault injection, lifecycle/BFCache, cross-browser, mobile and assistive-technology coverage are not complete. Do not move this tracker to done.
- Verification on 2026-10-13: `npm run verify:full` passed end to end: lint, format, architecture tests, Vitest (92 files, 523 tests), content validation, backend Ruff/mypy/pytest (39 passed), typecheck, learner smoke build, 18 learner Chromium E2E tests and 12 admin Chromium E2E tests. `git diff --check` passed and `git diff --name-only` showed no authored canonical content changes. The learner build retains the >500 kB chunk advisory. Firefox/WebKit, real BFCache, actual quota, mobile and assistive-technology gates remain open.

## Completion checklist

- [x] L0-A decisions linked; implementation must honor the ADR and pending acceptance gates.
- [x] Steps 1–2 contract/fixtures complete.
- [ ] Step 3 coordination complete.
- [ ] Steps 4–5 backup/restore complete.
- [ ] Step 6 UI complete.
- [ ] Steps 7–8 checks/docs complete.

Planning document creation is complete; feature execution is underway. Implementation checkboxes below record requirements completed in code; step-level completion boxes remain open until each step’s full acceptance criteria pass. Multi-page browser flows, broad fault injection, accessibility/mobile checks and documentation updates remain open.

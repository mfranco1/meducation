# L1 — Progress download/upload: detailed implementation plan

Status: complete — implementation, audit, simplification and Chromium/WebKit verification. Completed 2026-10-13. The user explicitly deferred Firefox acceptance on 2026-10-13; it remains unverified in the ongoing browser checklist. Created 2026-10-12; implementation began 2026-10-13. Parent: [local-first preparation](../ongoing/local-first-production-preparation.md). Prerequisite: [completed L0-A](L0-local-contracts-plan.md).

## Progress snapshot — 2026-10-13

Steps 1–6 are implemented. Step 7 test coverage now includes production interruption/recovery, actual quota, concurrent utilities/recovery starters, capability failures, file lifetime, study/review/navigation, accessibility attributes/focus, narrow enlarged-text/reduced-motion layout and network/resource cases. Step 8 owner docs and the recovery runbook are reconciled. The final production revision passed `npm run verify:full`: 534 Vitest tests, 41 learner Chromium E2E and 12 admin E2E, plus lint, format, architecture, content, backend, typecheck and both build modes. The dedicated browser run includes the final results/browse assertions; its results are recorded below.

Deferred follow-up (user instruction, 2026-10-13): execute the dedicated Firefox suite on a working host. This is no longer a blocker for closing L1; it is not a passed test. Its binary fails before application code with `Could not find profile folder`, even after forced reinstall and a native Terminal run. A separate OS-launched Firefox reached native automation but did not run the application cases and is not acceptance. Browser support has not been narrowed. Chromium/WebKit real back navigation uses a safe fresh-load path (`pageshow: [false,false]`); actual persisted BFCache/device freeze-return observations and B13–B14 real mobile/assistive-technology checks remain explicit launch/lifecycle evidence gaps.

Implementation boxes indicate completed code/test requirements. L1 is complete under the user-approved Firefox deferral; release acceptance remains separate. Current feature criteria and per-case evidence remain in [B01–B14](../ongoing/L0-browser-acceptance.md).

## Deliverable

A learner can download one JSON file containing both quiz and flashcard progress, select it later, review its contents, and explicitly replace local progress. Failed or interrupted restores preserve a recoverable state. No content/backend/authentication dependency is introduced.

Use the existing two v2 storage contracts with a separate versioned backup format. L0 Step 3 selects shared document participation with exclusive paired export/restore/recovery, preserving synchronous ordinary writes. L1 must integrate the admission guards, lifecycle ordering and bounded retry behavior from the ADR; L0 Step 6 acceptance is selected in the [browser checklist](../ongoing/L0-browser-acceptance.md); actual application tests remain required. Do not treat the synthetic probe as completed production coordination.

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
- [x] Apply the Step 6 capability matrix: disable normal paired export/restore and persistent study writes without valid coordination; preserve safe browsing and exact saved bytes. Pending/unreadable journals require recovery gating. Do not add a repeated-snapshot export fallback or silently use an empty/transient store. Test actual acquisition/access failures, capability copy and no-write behavior.

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
- [x] At startup, inspect journal before exposing progress. Valid decision original => restore originals; valid decision imported => retain/complete targets. Unexpected progress values outside either recorded pair or a mismatched operation require conflict handling, not overwrite. Invalid journal => preserve bytes and block writes. Recovery runs under the same exclusivity protocol. Boot failure offers a bounded, fixed-three-key raw recovery download, explicitly marked potentially inconsistent and non-importable; it re-reads to reject observed changes and preserves read/size errors.

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

Use [L0 browser acceptance](../ongoing/L0-browser-acceptance.md) B01–B14 as the feature acceptance checklist. The dedicated `playwright.progress-backup.config.ts` runs the production learner bundle in Chromium, Firefox and WebKit; `verify:full` continues to run the default Chromium suite. Record real BFCache/fresh-load paths and keep manual mobile/assistive-technology checks as launch gates.

- [x] Codec tests: valid empty/populated/legacy optional cases; unsupported envelope/schema; wrong app; dangerous keys; huge/deep content; invalid dates/numbers; duplicates; map mismatches; impossible score totals; missing system; unknown content IDs.
- [x] Export tests: corrupt-storage error vs missing-key empty state; durable history after pruning; active timer normalization; timezone-preserved flashcard dates; size-cap consistency; no mutation on export.
- [x] Recovery tests: throw at journal reservation, first/second target, readback, marker, rollback, removeItem and cleanup. Reconstruct fresh repositories and run recovery twice. Test malformed journal, original absent/corrupt bytes, unexpected third values, cleanup uncertainty and committed-marker write-success/read-failure. Use the Step 4 design model as supporting evidence, not a substitute for real implementation/quota tests.
- [x] Concurrency tests: preview becomes stale; simultaneous restores; another current-version page holding participation; tab closed/crashed; fresh page during commit; storage-event refresh and same-tab subscribers; pagehide/pageshow regression. Keep legacy-tab limitations explicit rather than writing a test that claims to fence old code.
- [x] Browser tests use Playwright same-context pages sharing localStorage. Exercise genuine download and file selection, cancel and repeated file choice, overwritten progress, delayed timer restore, imported checkpoint resume, current-content mismatch restart, and network unavailable during backup workflow.
- [x] Run full existing quiz/flashcard persistence/session regressions, including the saved timer, completion deduplication, quota failure, stale editing views and snapshot identity.

## Step 8 — Validate and document completion

- [x] Run targeted changed tests during implementation; once complete run npm run verify:full and any added multi-browser/lifecycle cases not included by that runner. Run the plain npm run build if needed for the minimum typecheck/build evidence.
- [x] Confirm learner build still excludes admin.html/QA and no eager canonical-bank import was added. Verify ordinary admin tests remain passing because the drawer/composition changed.
- [x] Run npm run validate:content, architecture checks and git diff --check; compare protected content files to confirm no authored content changes.
- [x] Update docs/product.md, docs/architecture.md, docs/testing.md and the backup format/ADR with the implemented behavior, exact limits, compatibility and recovery status. Document remaining manual mobile and accessibility checks as launch gates.
- [x] Record checks/results in this tracker, update parent L1 boxes, and move this tracker to docs/work/done only once the feature and relevant checks pass. Keep the parent ongoing for L2–L6.

## Suggested reviewable implementation slices

1. Codec/fixtures and validation tests (step 1–2).
2. Coordination/boot/repository guards with lifecycle tests (step 3).
3. Export/preview and journaled restore/recovery tests (steps 4–5).
4. Dialog integration and browser verification (steps 6–8).

Each slice should remain coherent and buildable. Do not expose a Restore action until the recovery and concurrency tests pass. No deployment, accounts, backend routes or Postgres implementation are part of L1.

## Implementation progress

### 2026-10-13 — Completion and simplification continuation

Scope: finish remaining automated acceptance, repair observed defects, and reduce duplicate code while preserving v1 backup format, two v2 progress keys, exact raw strings, journal decision rules, lazy content loading, and learner interaction semantics. Consolidate download resource handling and replace character-by-character raw JSON construction with bounded size preflight plus standard serialization. Keep strict validation and recovery guards; line count alone does not justify removing them. Reuse prior passing checks only for unchanged code; run focused regressions and full verification after edits.

Canonical baseline SHA-256: question bank `11b3fd084f4462c16805069883f53defd538a4d0bcd4d3537ab4c101bd7a3901`; flashcard bank `fa6c863dd11085311111f9715a4a5e291a5e9e6a28ac03e4e51a83d0c4443ac7`. Both had no pre-existing diff. Starting revision: `d28a61b`.

### Completion continuation results

- Consolidated boot/dialog file downloads in the existing app file module and replaced manual character-wise raw JSON construction with bounded escaped-size preflight and standard serialization. Removed duplicate recovery/admission/target-projection branches and the unnecessary animation-frame handoff wait. Production source is **35 lines shorter** than `d28a61b`, including the added capability/success behavior; test coverage grew independently. Raw serialization avoids a per-character output array while retaining controls, Unicode/lone surrogates and the exact 64 MiB ceiling. Strict validation, journal decisions, byte preservation and current storage formats remain intact.
- Fixed recovery retry leaving `committing` stuck, duplicate restore starts, read-only rejoin/refresh, stale error capture, gated storage-event invalidation and coordinated read-only lease loss. File API failures disable/report only affected actions. A sessionStorage-only notice produces a success announcement and dashboard focus after verified reload; it is not progress or backup data.
- Added adversarial UTF-8/semantic tests and production before/after interruption coverage through restart, fresh repositories and repeated recovery. Browser coverage now has 25 cases, with evidence for competing utilities/recovery starters, exact populated round trips, actual quota, fresh-load navigation, file cancellation/reselection/oversize, review/results/study/pending-launch policy, recovery retry and layout/focus. Synthetic progress only.
- Actual quota observation: Chromium and WebKit hit `QuotaExceededError` after 5,235,763 filler payload bytes in disposable nonpersistent contexts. Prepared-journal reservation failed with exact originals and no journal; no progress eviction occurred. Both real back-navigation observations were `[false,false]` (safe fresh loads), not persisted BFCache returns.
- Firefox: direct/headed/default-temp/native-terminal attempts fail before application execution; a forced isolated cache reinstall did not repair it. OS-launched Firefox 157 reached its native automation endpoint, but no application acceptance matrix ran there. Firefox was subsequently deferred by the user for L1 closure; retain its open acceptance follow-up with no support-target reduction.
- Updated root/doc indexes, product, architecture, design system, testing/regressions, ADR, browser checklist, parent tracker and the new [recovery runbook](../../progress-backup.md). Canonical baseline hashes remain unchanged; no backend/cloud/auth infrastructure or schema migration was introduced.

### 2026-10-13 — Initial implementation, audit fixes and acceptance

- Added synthetic populated and empty v1 fixtures with paused quiz progress, retained and durable totals, pruned/unknown IDs, changed flashcard signatures, checkpoints and daily aggregates. Added codec, coordination, admission, export, file-selection, dialog and journaled restore modules with colocated tests.
- Integrated shared Web Locks admission before app mount, repository read/write guards, journal recovery before progress exposure, pagehide/pageshow lifecycle behavior, same-tab paired refresh, and the Progress backup drawer/dialog flow. Active quiz/review and flashcard study paths require explicit leave confirmation. File size is checked before reading; corrupt live progress is not silently exported as empty. Both the preview and boot failure path can offer a bounded non-importable raw recovery copy of the fixed three keys. Boot capture is best-effort without exclusivity and warns that values may be inconsistent; storage exceptions, observed changes and size overflow do not fabricate a file.
- Audit fixes added fresh allowlisted codec projection with sorted map serialization, nested dangerous-key rejection, safe read-only browsing where Web Locks are unsupported, local read/write capability probes, cancellation-safe file parsing, visible current-progress totals, and raw recovery downloads. A Chromium browser run exposed and fixed an exclusive-lock handoff race. The E2E fixture now avoids reseeding progress after controlled reload. At that checkpoint the capability matrix, exhaustive fault injection and lifecycle/browser coverage remained open. The continuation above records the subsequent implementation/tests; the final closure below records the user-approved Firefox deferral and separate manual launch obligations.
- Verification on macOS 27.0 (26A5425a), 2026-10-13: `npm run verify:full` passed: lint, format, architecture tests (270 modules/1,190 imports), Vitest (92 files, 526 tests), content validation, backend Ruff/mypy/pytest (39 passed), typecheck, learner smoke build, 21 learner Chromium E2E tests and 12 admin Chromium E2E tests. Five backup E2E cases passed separately in Chromium 153.0.8010.12 and WebKit 26.6. Firefox 155 could not launch (`Could not find profile folder`); all five attempts failed before test execution. `git diff --check` and protected content-file comparison passed. The learner build retained the >500 kB chunk advisory. At that earlier checkpoint real BFCache, actual quota, mobile and assistive-technology gates remained open; the continuation above supersedes actual-quota status.
- Final learner-bundle assertion passed after the admin build: `dist/index.html` exists, `dist/admin.html` is absent, and no `content-qa`/`ContentQaPanel` strings are in learner assets. The new dedicated Playwright config is included in lint and formatting checks. A second `git diff --check` passed after documentation updates; no generated canonical question/flashcard bank files are in the changed-file list.

### Final audit and closure — 2026-10-13

- `npm run verify:full` passed on the final production code: 92 Vitest files / 534 tests; 41 learner Chromium E2E; 12 admin E2E; lint and architecture (270 modules / 1,195 imports), formatting, 10 architecture tests, actual content validation, backend Ruff/mypy/39 pytest tests, typecheck and learner/admin builds.
- After adding the final results/browse cancellation assertions, `npx playwright test --config=playwright.progress-backup.config.ts --project=chromium --project=webkit` passed all **50 cases (25 per engine)** against the fresh learner production bundle on loopback. Environment: macOS 27.0 (26A5425a), Chromium 153.0.8010.12, WebKit 26.6. No production code changed after full verification.
- Learner output contains `index.html`, excludes `admin.html` and contains no `content-qa`/`ContentQaPanel` asset strings. Both canonical SHA-256 hashes match the baseline above. Diff whitespace and documentation links were checked at archival.
- No blocking implementation findings remain in the completion audit. Firefox application acceptance is explicitly deferred by the user, with the launch failure retained as evidence rather than a pass. B13–B14 and unobserved persisted-cache/device lifecycle paths remain documented follow-ups. Existing large-chunk and backend TestClient advisories remain.
- All relevant owner documents, entry points, ADR, parent stage status and browser checklist were updated; this tracker moved to `docs/work/done`. L2–L6 remain unstarted.

## Completion checklist

- [x] L0-A decisions linked; implementation must honor the ADR and pending acceptance gates.
- [x] Steps 1–2 contract/fixtures complete.
- [x] Step 3 implementation and local coordination acceptance complete; Firefox acceptance is explicitly deferred by the user.
- [x] Steps 4–5 implementation and local backup/restore acceptance complete, including production fault matrix and real quota.
- [x] Step 6 UI and local automated acceptance complete; real mobile/assistive technology remain launch gates.
- [x] Steps 7–8 completed under the user-approved Firefox deferral: Chromium/WebKit checks pass, docs/evidence are reconciled and tracker archived. Firefox is unverified, not passed.

L1 is complete and archived. The user explicitly deferred Firefox testing on 2026-10-13 after repeated host launch failures. The ongoing browser checklist owns that follow-up, any defects it reveals, and separate public-launch mobile/assistive-technology/lifecycle observations. No Firefox compatibility pass or public-release readiness is claimed.

# L0 — Local contracts: detailed execution plan

Status: in progress; Steps 1–2 complete, coordination/recovery/validation/browser decisions pending. Created 2026-10-12. Parent: [local-first preparation](local-first-production-preparation.md). Next feature: [L1 progress backups](L1-progress-backup-plan.md).

## Outcome and dependency gates

Produce recorded, testable decisions for local progress restoration, database/toolchain compatibility, and private-admin authentication. L0 does not install production infrastructure or change content authority.

L0-A (steps 1–6) gates L1. L0-B (step 7) gates L2/L3. L0-C (step 8) gates L4. A hosting/auth research delay must not block progress backups once L0-A is complete. Step 9 records the independent gate results.

Recommended defaults below are design candidates, not claims about implemented behavior. If a feasibility test invalidates one, record the replacement and update L1 before feature implementation. Do not silently weaken the acceptance criteria.

## Step 1 — Capture the current contracts

- [x] Read architecture, testing/testing-regressions, design-system, domain types, both persistence repositories/codecs, both feature session hooks, app navigation and boot composition.
- [x] Record every write path: quiz launch/resume/checkpoint/finish/leave/abort/pagehide; flashcard launch/restart/move/open/flag/save-and-exit/finish; and future restore/recovery.
- [x] Record current storage keys: meducation.progress.v2 and meducation.flashcards.progress.v2. List optional fields and defaults; retired quiz v1 data is not an import target.
- [x] Record that repository reads can expose empty fallback snapshots plus an error, snapshots are frozen, writes are synchronous, revision checks are optimistic, and current storage events do not constitute a transaction.
- [x] Record that completed history is capped at 200 but completedIds/durable summaries are not; flashcard daily aggregates use local calendar dates. Active quiz timerStartedAt must not travel as a running timer.

Output recorded: [progress-backup decision evidence](../../decisions/0002-progress-backup-and-restore.md), including the write-path checklist. Required output: a short evidence section in the progress-backup ADR, with exact current file references and the write-path checklist. Do not inspect or copy the user's real browser progress into fixtures/logs.

## Step 2 — Set the backup and user-flow contract

- [x] Adopt an application-specific v1 JSON envelope; nested quiz/flashcard payloads have explicit schema versions and omit runtime storage revisions. Current content signatures/revisions remain opaque references.
- [x] Include both progress systems, retained history and all durable summaries. Exclude arbitrary storage keys, separate authored content banks, authentication data and browser/environment fingerprints. Preserve active quiz signatures with their embedded text for resume compatibility; warn about sharing backups.
- [x] Make restore replace both systems, never merge. An absent system is an invalid v1 file; an explicitly empty valid payload is allowed and previewed as a replacement with empty data.
- [x] Place Progress backup in the existing learner drawer as an app-owned utility dialog. Avoid creating a third study feature or routing storage through shared presentation.
- [x] Allow opening it only from non-editable study states. Disable its drawer action during active quiz/flashcard study with clear accessible guidance to save and leave first. This reuses existing save/exit behavior rather than inventing a second exit workflow. Review requires existing exit confirmation before opening the utility; results/browse remain visible until cancel or successful replacement resets sessions to the Quizzes dashboard. Cancel delayed launches before opening.
- [x] Confirm that import validation and restore never require content/API availability; unknown content IDs remain recoverable. Compatibility checks happen when study resumes.
- [x] Set UI states: idle, reading, invalid, preview, committing, success, recoverable failure, recovery-required. Cancellation before committing must write nothing.

Output recorded: envelope field allowlists, replacement/empty semantics, screen behavior, UI state transitions and proposed copy in the [progress-backup ADR](../../decisions/0002-progress-backup-and-restore.md). L1 implements them after remaining gates.

## Step 3 — Choose a coordination protocol that preserves saved progress

Preferred candidate: preserve synchronous ordinary writes using a shared Web Lock participation lease for each initialized learner tab. Restore/recovery takes the exclusive lock only when other cooperating tabs are closed/quiescent. This trades seamless multi-tab restore for smaller repository/session changes. It is not a generic distributed locking system.

- [ ] Prototype the protocol against two browser pages with temporary fixture storage. Every current-version learner must acquire a shared same-origin lease before reading/mutating progress. Keep the lease while the page can write; each repository commit checks its valid participation state. Module-scope repository creation must not bypass the boot gate.
- [ ] The restoring tab first blocks its own study/writes, releases its shared lease, then requests the exclusive lock with ifAvailable. If unavailable, do not mutate or force a lock; reacquire shared participation and tell the user to close other tabs and retry. A new tab waits behind an active exclusive restore before exposing snapshots.
- [ ] A tab finding a pending journal during initialization must remain gated and release any shared lease before competing for recovery exclusivity; otherwise waiting readers can deadlock recovery. Specify one retry/notification path so simultaneous booting tabs converge without spinning.
- [ ] Keep the exclusive lock across journal writes, recovery, verification and cleanup. Return to normal operation only after both repositories are coherent and shared participation is re-established.
- [ ] Verify that pending lock acquisition and release cannot deadlock. Never request an exclusive lock while retaining this tab's shared lease; never use steal or a localStorage lock with an assumed atomic compare-and-swap.
- [ ] Explicitly exercise pagehide, pageshow/back-forward cache, tab close, reload, hidden/frozen pages and crashed owner. A hidden tab may block restore; that is a safe reason to ask it to close. An unexpectedly lost lease must block further writes until reacquired. A pagehide save may run only while its lease is valid; do not release participation before that checkpoint.
- [ ] Verify existing synchronous pagehide timer-pause semantics. The lease lifecycle must not introduce unawaited asynchronous writes at unload.
- [ ] Document current-version guarantees and the unavoidable old-build limitation: old pages do not cooperate. Tell the user to close all other app tabs before restore; never claim the new implementation can fence legacy scripts.
- [ ] If this candidate fails browser/lifecycle verification, evaluate asynchronous locks around every commit or a single authoritative progress envelope as alternatives. Record migration/call-site costs and revise L1 before adopting either. No ad hoc partial lock protocol is acceptable.

Browser API facts: Web Locks provide same-origin asynchronous shared/exclusive coordination and require a secure context. Use feature detection; verify target engines rather than assuming a browser name guarantees behavior. See [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).

Output: approved-by-evidence protocol/state diagram, lock name/version, participating call sites, compatibility behavior and passing prototype observations. Ordinary domain rules stay framework-free.

## Step 4 — Specify transactional restore and crash recovery

- [ ] Preserve the existing two v2 keys for the preferred protocol; reserve a single versioned restore-journal key in persistence. Extend StoragePort with removeItem if needed; do not emulate missing keys by storing invalid null strings.
- [ ] Define a bounded journal with operation ID, original raw values including absent keys, canonical target raw values with fresh revisions, and a validated decision marker. Journal data is itself untrusted and size-bounded.
- [ ] Specify the sequence: acquire exclusive participation; recheck both preview base values; prepare complete journal before mutation; write both targets; verify; atomically replace journal with committed marker; clean up; refresh snapshots; reacquire shared participation.
- [ ] Before the committed marker, recovery restores both originals; after it, recovery completes/retains both targets. Never delete the journal while unresolved. The exclusive participation requirement also applies to recovery.
- [ ] Consider failure at every storage call, including journal reservation, either target, marker replacement, rollback, cleanup and readback. If quota prevents rollback, retain journal and gate all normal progress use with an actionable recovery screen. Do not return an empty fallback or report success.
- [ ] Decide behavior for corrupt existing data: valid backup replacement may repair it only after explicit warning and preserving exact prior bytes in journal/optional raw recovery download. A corrupt journal cannot be replayed automatically; preserve bytes and fail closed with recovery guidance.
- [ ] Do not assume free-space estimates reserve space. A safe failure to prepare the journal is preferable to deleting originals to make room.

Output: complete write/recovery state machine and fault-injection cases. Browser storage events notify other documents, not the writer; local subscribers need explicit refresh. See [storage events](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event) and [setItem quota behavior](https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem).

## Step 5 — Decide strict validation, limits and timer normalization

- [ ] Enumerate all permitted fields from current types; do not describe decodeProgress as strict. Define semantic checks for score sums/percentage, duplicate IDs, response-key agreement, completed-ID membership, safe numbers, timestamps and active/completed consistency.
- [ ] Derive size limits using synthetic short/long retained history and growing completed-ID maps, not personal browser data. Recommended starting investigation: 4 MiB UTF-8 file cap, depth 16 and explicit per-field/container caps; finalize from fixtures and document exact constants. localStorage encoding/quota and journal duplication mean an under-limit file can still fail to restore safely.
- [ ] Use identical canonical validation on export/import; either a successful export passes its own importer or export returns a clear error. Never silently trim history/IDs to meet limits.
- [ ] Export paused attempts only. The active same-tab session must first save/leave through existing flow. For stale saved running timestamps, retain persisted elapsedMs and remove timerStartedAt; do not add unobserved elapsed time. Explain potential loss of uncheckpointed time, not fabricated elapsed time.
- [ ] Preserve valid flashcard calendar dates and aggregate totals; do not rebucket on another device's timezone. Do not require old records to reference today's question bank or re-score old results.
- [ ] Specify older/future backup version behavior: v1 only for first release, unknown versions rejected with no mutation. Future migrations require explicit conversion functions and fixtures.

Output: exact limits, timestamp format and numerical invariants in ADR/schema documentation, plus fixture descriptions.

## Step 6 — Set browser, lifecycle and accessibility acceptance

- [ ] Target maintained Chromium, Firefox and WebKit on secure origins; include manual iOS Safari and Android Chrome download/file-selection checks before public launch. Record actual tested versions during implementation.
- [ ] If Web Locks/required storage features are unavailable, preserve existing ordinary-study behavior where safe, but disable coordinated restore with a useful message. Never offer the same safety guarantee through an untested fallback. Valid export may use bounded repeated snapshots and reject observed concurrent changes; document its weaker coordination if this fallback is retained.
- [ ] Test blocked storage, private-mode quota behavior, canceling file selection, choosing the same file twice, input clearing, focus restoration, Escape behavior, screen-reader progress and 390px layout.
- [ ] Choose no backend calls or backup telemetry. Revoke created object URLs and discard parsed preview data when the dialog closes.

L0-A exit: steps 1–6 produce a selected protocol, schema/limits and test matrix; unresolved concurrency/recovery behavior blocks L1 implementation. The browser checks here may be small temporary feasibility probes, not a finished backup feature.

## Step 7 — Record database/toolchain compatibility (L0-B)

- [ ] Inspect backend Python requirement/locks and machine architecture; record Docker/Compose availability without installing anything yet.
- [ ] Check official Postgres, intended managed-host and Psycopg/SQLAlchemy/Alembic support. Select a mutually supported Postgres major and Python 3.14 driver; do not choose an unsupported newest version automatically.
- [ ] Record concrete container tags/digests to pin in L2 and matched pg_dump/pg_restore tooling. Confirm linux/amd64 and linux/arm64 images or document emulation/CI constraints.
- [ ] Specify development-only connection settings, separate migration/runtime URLs/roles, optional loopback DB port, named volume, backup location and explicit destructive reset command. Managed TLS/pooler differences stay environment configuration.
- [ ] Save a short ADR and commands for L2 to verify. Mark untested container runtime behavior as pending L2, not validated by reading vendor docs.

L0-B exit: selected versions and compatibility evidence are recorded; no database provisioning or migration occurs in L0.

## Step 8 — Record the single-editor auth contract (L0-C)

- [ ] Prefer an OIDC authorization-code flow with PKCE and a backend session for the admin, subject to provider capability verification. Keep learner requests public and independent of admin authentication.
- [ ] Specify allowed issuer, audience, algorithms, trusted key source/rotation, token time checks, stable editor subject ID, provider-specific MFA assurance, reauthentication rules and deny-by-default behavior.
- [ ] Specify server session storage/lifetime, logout/revocation, Secure/HttpOnly/SameSite cookie behavior, CSRF state/token and origin checks, redirect allowlist, secret rotation and operator account recovery. No privileged tokens in browser localStorage.
- [ ] Evaluate Neon Auth or a managed OIDC provider against those requirements using official documentation. Record support/gaps and the proposed adapter. If evidence is insufficient, mark provider selection pending before L4; do not block L1 or build a custom identity system.
- [ ] Specify local test identity with production-shaped claims, explicit development-only configuration and fail-closed production startup. Define hosted login/MFA/recovery tests that mocks cannot replace.

L0-C exit: security/session contract is recorded with provider capability status. A chosen verified adapter is mandatory before L4 implementation, but creating the cloud identity account is deferred.

## Step 9 — Publish decisions and handoff

- [ ] Create focused decision records under docs/decisions using the next available numbers: progress backup/coordination; local database runtime; single-editor authentication. Do not pre-create empty records for unresolved choices.
- [ ] Update docs/architecture.md, docs/testing.md and the parent/L1 plans only where an accepted decision changes their guidance; preserve current-vs-proposed wording.
- [ ] Log L0-A, L0-B, L0-C separately with evidence, remaining tasks and selected file boundaries. Mark L0 complete only when all required decision deliverables are done; allow L1 to proceed after L0-A.
- [ ] For documentation-only changes run link/path and diff checks plus the repository minimum build/typecheck. Any retained executable spike must receive relevant tests and boundary checks.

## Completion checklist

- [ ] L0-A coordination/format/lifecycle decisions complete.
- [ ] L0-B DB/toolchain decisions complete.
- [ ] L0-C identity contract and provider capability status complete.
- [ ] Decision documents, parent links and verification evidence recorded.

Planning document creation is complete; these execution boxes are deliberately unchecked.

Planning verification: relative links resolve; repository build/typecheck passed with the existing bundle-size advisory; git diff --check passed. No feasibility spike or runtime feature was implemented in this planning turn.

## Execution log

2026-10-12 — Step 1 completed: current source contracts, storage fields/defaults, complete runtime write inventory and limitations recorded in the populated progress-backup ADR. Self-review/audit completed, including correction of the L1 text-free-backup claim: current active quiz signatures embed content. Seven existing suites/49 tests and build/typecheck passed; source/link assertions and diff check passed; canonical hashes unchanged. No runtime implementation or real browser-data access. Stop here; Step 2 requires the user's continuation instruction.

2026-10-12 — Step 2 complete and self-audited: v1 paired backup, paused attempts, preserved content references, replace-only confirmation, review/launch gating and explicit failure/recovery states. JSON/source-interface field audit, link/diff checks and build/typecheck passed; existing chunk-size advisory remains. Canonical hashes unchanged; documentation only. Stop before Step 3 pending the user's continuation instruction.

# L0 — Local contracts: detailed execution plan

Status: in progress; Steps 1–6 design/audit complete; L0-A selected, L1 application verification pending. Steps 7–9 pending. Created 2026-10-12. Parent: [local-first preparation](local-first-production-preparation.md). Next feature: [L1 progress backups](L1-progress-backup-plan.md).

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

- [x] Prototype the protocol against two browser pages with temporary fixture storage. Every current-version learner must acquire a shared same-origin lease before reading/mutating progress. Keep the lease while the page can write; each repository commit checks its valid participation state. Module-scope repository creation must not bypass the boot gate.
- [x] The restoring tab first blocks its own study/writes, releases its shared lease, then requests the exclusive lock with ifAvailable. If unavailable, do not mutate or force a lock; reacquire shared participation and tell the user to close other tabs and retry. A new tab waits behind an active exclusive restore before exposing snapshots.
- [x] A tab finding a pending journal during initialization must remain gated and release any shared lease before competing for recovery exclusivity; otherwise waiting readers can deadlock recovery. Specify one retry/notification path so simultaneous booting tabs converge without spinning.
- [x] Keep the exclusive lock across journal writes, recovery, verification and cleanup. Return to normal operation only after both repositories are coherent and shared participation is re-established.
- [x] Verify that pending lock acquisition and release cannot deadlock. Never request an exclusive lock while retaining this tab's shared lease; never use steal or a localStorage lock with an assumed atomic compare-and-swap.
- [x] Explicitly exercise pagehide, pageshow/back-forward cache, tab close, reload, hidden/frozen pages and crashed owner. A hidden tab may block restore; that is a safe reason to ask it to close. An unexpectedly lost lease must block further writes until reacquired. A pagehide save may run only while its lease is valid; do not release participation before that checkpoint.
- [x] Verify existing synchronous pagehide timer-pause semantics. The lease lifecycle must not introduce unawaited asynchronous writes at unload.
- [x] Document current-version guarantees and the unavoidable old-build limitation: old pages do not cooperate. Tell the user to close all other app tabs before restore; never claim the new implementation can fence legacy scripts.
- [x] If this candidate fails browser/lifecycle verification, evaluate asynchronous locks around every commit or a single authoritative progress envelope as alternatives. Record migration/call-site costs and revise L1 before adopting either. No ad hoc partial lock protocol is acceptable.

Browser API facts: Web Locks provide same-origin asynchronous shared/exclusive coordination and require a secure context. Use feature detection; verify target engines rather than assuming a browser name guarantees behavior. See [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).

Output recorded: selected protocol/state diagram, lock name/version, participating call sites, boundaries and measured observations in the [ADR](../../decisions/0002-progress-backup-and-restore.md). Chromium/WebKit feasibility is demonstrated; Firefox launch and real BFCache observations remain explicit Step 6/L1 release gates, not passing claims. Ordinary domain rules stay framework-free.

## Step 4 — Specify transactional restore and crash recovery

- [x] Preserve the existing two v2 keys for the preferred protocol; reserve a single versioned restore-journal key in persistence. Extend StoragePort with removeItem if needed; do not emulate missing keys by storing invalid null strings.
- [x] Define a bounded journal with operation ID, original raw values including absent keys, canonical target raw values with fresh revisions, and a validated decision marker. Journal data is itself untrusted and size-bounded.
- [x] Specify the sequence: acquire exclusive participation; recheck both preview base values; prepare complete journal before mutation; write both targets; verify; atomically replace journal with committed marker; clean up; refresh snapshots; reacquire shared participation.
- [x] A readable journal decision original restores originals; decision imported completes/retains targets. Failed marker verification is uncertain until re-read, not automatically rollback. Never delete the journal while unresolved. The exclusive participation requirement also applies to recovery.
- [x] Consider failure at every storage call, including journal reservation, either target, marker replacement, rollback, cleanup and readback. If quota prevents rollback, retain journal and gate all normal progress use with an actionable recovery screen. Do not return an empty fallback or report success.
- [x] Decide behavior for corrupt existing data: valid backup replacement may repair it only after explicit warning and preserving exact prior bytes in journal/optional raw recovery download. A corrupt journal cannot be replayed automatically; preserve bytes and fail closed with recovery guidance.
- [x] Do not assume free-space estimates reserve space. A safe failure to prepare the journal is preferable to deleting originals to make room.

Output recorded in the [ADR](../../decisions/0002-progress-backup-and-restore.md): internal v1 journal, equal-length decision marker, write/recovery state machine, failure ledger and synthetic interruption model. Exact size limits remain Step 5. Browser storage events notify other documents, not the writer; local subscribers need explicit refresh. See [storage events](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event) and [setItem quota behavior](https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem).

## Step 5 — Decide strict validation, limits and timer normalization

- [x] Enumerate all permitted fields from current types; do not describe decodeProgress as strict. Define semantic checks for score sums/percentage, duplicate IDs, response-key agreement, completed-ID membership, safe numbers, timestamps and active/completed consistency.
- [x] Derive size limits using synthetic short/long retained history and growing completed-ID maps, not personal browser data. Recommended starting investigation: 4 MiB UTF-8 file cap, depth 16 and explicit per-field/container caps; finalize from fixtures and document exact constants. localStorage encoding/quota and journal duplication mean an under-limit file can still fail to restore safely.
- [x] Use identical canonical validation on export/import; either a successful export passes its own importer or export returns a clear error. Never silently trim history/IDs to meet limits.
- [x] Export paused attempts only. The active same-tab session must first save/leave through existing flow. For stale saved running timestamps, retain persisted elapsedMs and remove timerStartedAt; do not add unobserved elapsed time. Explain potential loss of uncheckpointed time, not fabricated elapsed time.
- [x] Preserve valid flashcard calendar dates and aggregate totals; do not rebucket on another device's timezone. Do not require old records to reference today's question bank or re-score old results.
- [x] Specify older/future backup version behavior: v1 only for first release, unknown versions rejected with no mutation. Future migrations require explicit conversion functions and fixtures.

Output recorded in the [ADR](../../decisions/0002-progress-backup-and-restore.md): exact portable/journal/container limits, canonical timestamp/score/count invariants, timer normalization and version policy. Synthetic sizing/invariant probe retained; full validator remains L1 work.

## Step 6 — Set browser, lifecycle and accessibility acceptance

- [x] Select maintained desktop Chromium, Firefox and WebKit on secure origins; require actual iOS Safari/Android Chrome download/file-selection and assistive-technology checks before public launch. Record actual tested versions in L1 evidence.
- [x] Define admission using actual capability/access results. Without valid coordination, disable normal paired export/restore and persistent study writes; preserve safe browsing and saved bytes. Pending/unreadable journals gate progress. No weaker export fallback is selected.
- [x] Define assertions for blocked storage, private-mode quota, file cancellation/reselection/input clearing, focus/Escape/screen-reader announcements and 390px layout. Record existing evidence and pending application/manual checks separately.
- [x] Select no backup backend calls/telemetry, safe Blob URL revocation and invalidation/disposal of delayed reads/preview data.

Output: Step 6 of the [ADR](../../decisions/0002-progress-backup-and-restore.md) and the [browser acceptance checklist](L0-browser-acceptance.md). Firefox launch and actual BFCache coverage remain explicit L1 verification obligations. No finished utility/browser coverage is claimed.

L0-A exit met for design: steps 1–6 select protocol, schema/limits and test matrix. An observed protocol/recovery failure blocks implementation until resolved; unimplemented application acceptance tests belong to L1. Public release still requires its automated/manual gates.

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

- [x] L0-A coordination/format/lifecycle decisions complete; feature verification remains L1.
- [ ] L0-B DB/toolchain decisions complete.
- [ ] L0-C identity contract and provider capability status complete.
- [ ] Decision documents, parent links and verification evidence recorded.

Planning document creation is complete; only completed execution steps are checked.

Planning verification: relative links resolve; repository build/typecheck passed with the existing bundle-size advisory; git diff --check passed. No feasibility spike or runtime feature was implemented in this planning turn.

## Execution log

2026-10-12 — Step 1 completed: current source contracts, storage fields/defaults, complete runtime write inventory and limitations recorded in the populated progress-backup ADR. Self-review/audit completed, including correction of the L1 text-free-backup claim: current active quiz signatures embed content. Seven existing suites/49 tests and build/typecheck passed; source/link assertions and diff check passed; canonical hashes unchanged. No runtime implementation or real browser-data access. Stop here; Step 2 requires the user's continuation instruction.

2026-10-12 — Step 2 complete and self-audited: v1 paired backup, paused attempts, preserved content references, replace-only confirmation, review/launch gating and explicit failure/recovery states. JSON/source-interface field audit, link/diff checks and build/typecheck passed; existing chunk-size advisory remains. Canonical hashes unchanged; documentation only. Stop before Step 3 pending the user's continuation instruction.

2026-10-12 — Step 3 design/prototype complete and audited: shared participation, exclusive paired capture/restore/recovery, valid-lease write guards and lifecycle gating. Retained isolated probe/evidence: 21 passed across Chromium/WebKit. Lint/architecture, formatting, build/typecheck and link/diff/hash checks passed; existing chunk-size advisory remains. Firefox profile launch and actual BFCache restoration remain unverified Step 6/L1 release obligations, not passing claims. No production progress feature implemented. Stop before Step 4 pending user continuation.

2026-10-13 — Step 4 complete and self-audited; fixed marker/readback uncertainty and preserved raw corrupt/absent originals. Retained model: 90 restore interruptions, 618 recovery interruptions/retries and 3 fail-closed cases passed. Lint/architecture, format, build/typecheck, link/evidence/diff checks passed; canonical hashes unchanged and existing chunk-size advisory remains. Actual browser/production journal validation remains L1 work. Stop before Step 5 pending user continuation.

2026-10-13 — Step 5 complete and self-audited: exact validation/limits/normalization recorded; seven synthetic sizing scenarios and selected invariant assertions passed. Preserved pruned-history totals and local calendar dates; no current-clock timer inflation or silent truncation. Lint/architecture, format, build/typecheck and link/evidence/hash/diff checks passed; existing chunk-size advisory remains. Full importer/round-trip/quota implementation tests remain L1 work. Stop before Step 6 pending user continuation.

2026-10-13 — Step 6 complete and self-audited: capability admission, safe unsupported/storage-failure behavior, lifecycle evidence rules, dialog/file/download cleanup and accessibility contract selected. Added 14 pending application acceptance cases with separate L1/public-launch gates. L0-A design gate met; Firefox launch, real BFCache, actual quota and mobile/assistive-technology application checks remain explicitly pending. Documentation only; build/typecheck, changed-document link assertions, checklist-state/hash checks and git diff --check passed. Existing Vite chunk-size advisory remains. Stop before Step 7 pending user continuation.

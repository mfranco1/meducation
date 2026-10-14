# L4 authoring handoff from L3

Current status: local PostgreSQL authority cutover is user-approved. See the
[local authority runbook](local-authoring.md). Authority statements in the original
design-stage snapshot below describe the pre-cutover stage.

Recorded 2026-10-14. L3 implements local Postgres read delivery, operator import/
activation/export, durable IDs and tested recovery. L4 implementation has not
started. Canonical JSON remains authoritative; do not enable DB-only editing or
change authority as a side effect of this handoff.

Execution plan: [L4 local authoring and admin access](work/ongoing/L4-local-authoring-admin-access-plan.md). The plan records implementation gates; it does not change this handoff's authority or verification status.

Read [architecture](architecture.md), [paired-release decision](decisions/0005-paired-content-releases-and-postgres-schema.md),
[single-editor authentication](decisions/0004-single-editor-authentication.md),
[operator commands](../backend/README.md#paired-content-import-activation-and-export),
[recovery acceptance](../backend/README.md#actual-bank-parity-and-isolated-recovery-acceptance)
and the [completed L3 tracker](work/done/L3-postgres-schema-migration-parity-plan.md).

## Implemented foundation

- Head `0001_content` packages relational rows, global ordinals, immutable paired
  TEXT artifacts, shared subjects and validated content digests. Entity IDs remain
  stable across releases; composite FKs prevent cross-release relationships.
- One paired-document `draft` has an increasing revision and base publication
  context. `save_draft` checks expected revision; save/reset creates a new revision
  rather than resetting the counter. Draft state is private to operational roles.
- `reserve_ids` commits independently before preview/apply, recording creation
  intent and expected draft/publication context. Replay returns the same IDs;
  changed intent/UUID reuse fails. Cancel/reset/failed apply burns allocations;
  established identities and counters persist across deletion and rollback.
- `store_release` is a trusted canonical-file importer. It registers unseen IDs,
  seeds counters, validates/finalizes both banks and records file hashes/import
  provenance. It never implicitly activates. `activate_release` requires the
  expected sequence, creates an event and changes the pointer atomically. Replay
  returns the original event without moving a later pointer; explicit rollback
  reactivation creates a new sequence even with identical hashes.
- The global operation ledger and audit/import/publication/reservation histories
  are protected. Operational users cannot mutate tables arbitrarily. Owner/
  migrator maintenance is trusted and can change enforcement.
- One reader engine supplies a response-pinned pair. Every content request reads
  the active pointer once; two immutable catalog entries are retained per worker.
  Eviction preserves in-flight views, health performs no recurring SQL, and SQL
  failures return unavailable responses without JSON/cached-content fallback.

## Required L4 implementation

1. Plan the paired HTTP gateway and editor state/undo/reset/preview contract before
   implementation. Existing admin max-current-ID helpers remain limited to JSON
   authoring; replace them with server reservations before persistent DB creates.
   Preserve source/verified answers, sparse fields, meaningful strings and order.
2. Implement and test backend rich-content validation parity. Python/SQL enforce
   stored structure; L3 file import also invokes the TypeScript Markdown/domain
   gate. That development-time Node workflow is not an HTTP validation boundary.
   Add bounded request/resource handling and shared cross-runtime policy cases.
3. Add an authored-release/publish operation. Do not expose `store_release` as an
   editor publish primitive: its unseen-ID registration and file-import provenance
   are intentionally privileged. Authored creates must consume owned reservations;
   audit must describe authored publication without invented file provenance.
4. Publish from one captured/locked draft, checking expected draft revision and
   current base publication sequence, then finalize the pair, activate and advance
   draft base/revision in one transaction. A rollback to the same digest still has
   a new sequence and must invalidate stale publish previews. Use durable operation
   UUIDs and fingerprints for replay; do not blindly retry uncertain writes.
5. Add the authenticated private gateway and least-privilege editor role under
   ADR0004. Every private read/write needs verified authorization, private session
   and CSRF/expiry/revocation behavior; local actor strings, hidden navigation and
   admin build flags are not authentication. Resolve provider/fresh-MFA acceptance.
   Public learner reads continue through the separate reader role.
6. Complete authoritative recovery before cutover. L3 tests backup-role custom
   dump, fresh owner restore, explicit ACLs and exact content/private-state/API
   parity, but its temporary archive is not retained/off-device backup. Reconcile
   post-backup allocation evidence before resuming creates; lost reservations must
   not quietly weaken never-reuse guarantees. Restart workers/caches after restore.
   Auth/session restore must use a new external epoch; content dumps do not back
   up private PDFs/media or browser progress.
7. At a separately reviewed cutover, update authority docs/tooling/admin bootstrap
   and obtain deterministic current exports. Postgres becomes authoritative and
   JSON is an export/archive/fallback, never a second writable canonical source.
   JSON read rollback is safe only while files contain every authoritative edit.

## Verification and remaining release obligations

L3 records real-PG fixture contracts, all actual-bank API/reconstruction parity,
restore-state equality, and Chromium proxy/progress/backend-switch/restart flows.
The linked native CI run verifies the current implementation on AMD64 and ARM64.
These checks do not certify hosted TLS/authentication, provider suspend/wake,
capacity, retained backup/RPO, MFA or deployment. Keep the existing
[browser acceptance tracker](work/ongoing/L0-browser-acceptance.md) for user-deferred
Firefox, real mobile/accessibility and unobserved persisted navigation acceptance.
Learner progress remains browser-local and runtime generative AI remains absent.

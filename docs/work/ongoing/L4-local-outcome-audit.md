# L4 local outcome audit — 2026-10-14

Content-source update (2026-10-16): the [PostgreSQL-only retirement](postgres-only-content-retirement-plan.md) removes repository JSON databases, runtime read fallbacks and file-authoring modes. PostgreSQL and authenticated HTTP CRUD are the current contract; earlier stage statements and machine evidence below remain historical. This does not close unrelated hosted identity, retention, device or deployment gates.

Later status: the user-approved local cutover supersedes the pending authority
and external-copy gates below. See [Step 7 evidence](L4-step7-cutover-evidence.json).
This earlier closeout remains historical.

Scope: finish locally executable L4 verification/preparation before further L5
work, as requested by the user. Base checkout: `ae26a0c`. This is a partial L4
completion audit, not authority cutover or hosted readiness. The retained external
copy remains explicitly user-deferred; canonical JSON remains authoritative.

## Parent L4 outcome mapping

In order of the twelve parent L4 checkboxes:

1. **Implemented:** asynchronous paired HTTP gateway and editor, server-owned
   reservations, paired snapshot and durable Undo/reset. Owners:
   `src/admin/data/HttpQuestionBankGateway.ts`, `PairedHttpClient.ts` and
   `backend/src/meducation_api/admin`. Evidence: Steps 4–5 backend/browser snapshots.
2. **Implemented:** validated paired saves, captured preview/publish transaction,
   immutable publication, source/verified provenance and append-only identity/audit.
   Evidence: Step 2 policy parity and Step 4 transactional tests.
3. **Implemented:** stale revision/publication rejection, preview invalidation,
   draft-only Undo/reset, deterministic export and retained activation. Evidence:
   Step 4 PG failure/concurrency cases and Step 5 actual-proxy browser suite.
4. **Implemented for API/active attempts:** request-pinned publication selection,
   release-scoped worker cache and existing revision-conflict flow. Retained releases
   preserve later content; no history review expansion or rescoring was added.
   Evidence: Step 4 reader tests, L3 parity/browser and Step 5 learner regressions.
   Browser freshness for *new* launches remains the separate L5 Step 2 target.
5. **Partial:** provider-independent authorization, signed synthetic assurance,
   PKCE/nonce/state, allowlist and negative cases pass locally. Real tenant MFA,
   fresh-factor semantics/recovery/logout and production adapter acceptance remain
   unverified. Production refuses the synthetic adapter. Parent stays unchecked.
6. **Implemented:** cookie flags, Origin/CSRF, private no-store, separate learner
   caching and direct route attacks. Evidence: Step 3 auth and Step 4 PG role tests.
7. **Implemented:** explicit development-only loopback identity, production refusal
   and public published-only learner routes. Evidence: Step 3 settings/token tests
   and installed-image/proxy acceptance.
8. **Implemented locally:** paired draft/save/publish/export/Undo/rollback and
   auth failures. Step 5 browser cases cover expiry, dirty text, cancel and logout;
   this audit adds successful fresh step-up followed by stale-save rejection.
9. **Pending explicit cutover:** prepared authority documentation patch exists and
   applies cleanly. No final target/import or authority change is authorized here.
10. **Prepared; cutover pending:** selected-export validation/audit, manifest/hash
    checking, HTTP bootstrap without bundled fallback, and separate media inventory
    are implemented. Retire writable JSON mode only at the authority gate.
11. **Policy/tooling prepared; retained acceptance deferred:** schedule, retention,
    protection and provisional RPO/RTO procedure are documented. Full disposable
    recovery passes, but temporary archives are not retained off-device evidence.
12. **Rehearsal verified; operational gate pending:** actual-bank fresh separate-DB
    dump/restore, exact all-table/sequence/effective-role parity, session quarantine
    and allocation-journal reconciliation pass. A verified retained copy is still
    required before DB-only authority. Parent stays unchecked.

## L4 handoff requirements

The seven [handoff requirements](../../L4-authoring-handoff.md#required-l4-implementation)
map to the outcomes above: paired contracts/reservations (1), policy parity (2),
owned authored publication (2), locked capture/stale previews/operation replay (2–3),
auth boundary with pending hosted assurance (5–7), recovery with pending retained
acceptance (11–12), and separately authorized authority/tooling cutover (9–10).

Allocation enforcement is locally implemented and tested: migration
`0006_allocation_fence`, independently flushed immutable range journals, guarded
admission, restore quarantine and burning all prior admitted ranges prevent ID
reuse after backup loss. Real independent durability is not established by two
fixture directories. No automatic transaction replay or uncertain-write retry was
introduced. Original Step 1 canonical hashes remain the comparison baseline.

## Verification and remaining gates

[Closeout evidence](L4-local-closeout-evidence.json) records current source hashes,
versions, current cutover target hashes and full observed reports. Local checks
passed: complete `npm run verify:full` (592 frontend units, 230 backend tests,
41 learner and 12 JSON-editor browsers), fresh HTTP admin build and all 12
installed API/PG17/Nginx editor cases. The runner's 173 PG skips are not acceptance;
current backend/fixture hashes match the separate 172-test real-PG regression and
five-case restart evidence from L5 Step 1.

The fresh actual-bank rehearsal passed all 348 source and restored routes,
exact serialized artifacts/ordered fields/provenance, table/sequence/effective-role
parity, draft/history/audit restoration, session quarantine/epoch rotation, and
post-backup allocation reconciliation without ID reuse. Selected authored export
validation/audit also passed. Rehearsal archives/journals were temporary and cleaned;
these measurements cannot close operational retained-copy RPO/RTO.

Prepared cutover patch applicability and whitespace passed; original baseline
hashes are preserved. `docs/testing.md` and `backend/README.md` changed since that
baseline, so review the current hashes at cutover. The patch is not applied.
Existing content-review, Vite chunk-size, weak-RSA fixture and recovery tuple-method
advisories remain; none was silently repaired or counted as an acceptance failure.
No blocking local implementation finding remains for this closeout scope.
Historical snapshots are preserved; the parent checklist is reconciled only for
implemented outcomes. No routine DB, volume, private media, learner progress,
provider account or content authority is modified by this audit.

Remaining external/approval-dependent L4 work: retained independent backup and
journal verification with measured operational recovery; explicit reviewed
cutover; real hosted provider/factor/TLS/routing acceptance; existing manual
browser/device/accessibility obligations. Changed-source native CI must also be
verified after these changes are committed. Keep L4 ongoing until its actual
recovery and authority gates pass.

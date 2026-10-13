# L4 — Local database authoring and admin access

Created: 2026-10-14. Status: plan prepared; implementation not started. This request authorizes planning only. Canonical JSON remains authoritative.

Parent: [local-first production preparation](local-first-production-preparation.md#l4--local-database-authoring-and-admin-access-boundary). Prerequisites: [completed L3](../done/L3-postgres-schema-migration-parity-plan.md), [L4 handoff](../../L4-authoring-handoff.md), [authentication contract](../../decisions/0004-single-editor-authentication.md), and [paired-release contract](../../decisions/0005-paired-content-releases-and-postgres-schema.md). Follow the [work tracking gates](../README.md): implement one step, record evidence and limitations, then stop until continuation is authorized. The authority cutover has its own explicit approval gate.

## Outcome and scope

The existing admin edits one paired quiz/flashcard draft in local Postgres through an authenticated HTTP gateway. Saving preserves unpublished work; publishing explicitly creates and activates an immutable paired release. Every private operation verifies editor identity and session protection. Stale tabs cannot overwrite newer drafts or publish an outdated preview. Recovery, deterministic exports and authority-aware tooling must work before Postgres becomes the only writable canonical source.

Retain the current editor, JSON record/bulk workflows, stable IDs, exact authored strings/order, sparse fields, source/verified answer distinction and change reasons. Learner reads remain public and published-only; progress stays in browser storage. Preserve active-attempt change detection and transient post-submit review without re-scoring historical results.

No cloud provisioning, public launch, learner accounts, runtime generative AI, multi-editor approval system, historical review feature, media hosting, distributed cache service or broad editor redesign. L5 retains wider resilience/load tuning; L6 retains release-candidate acceptance. L4 must still test the failures necessary to establish safe authoring.

## Current implementation and ownership

- [AdminQuestionBankGateway](../../../src/admin/data/AdminQuestionBankGateway.ts) is asynchronous for quiz operations, but `getFlashcardBank()` and `appliedOperations()` are synchronous. [AdminApp](../../../src/admin/AdminApp.tsx) constructs the in-memory gateway from bundled JSON and coordinates separate flashcard state. HTTP integration must replace that bootstrap and return a coherent paired snapshot.
- [InMemoryQuestionBankGateway](../../../src/admin/data/InMemoryQuestionBankGateway.ts) owns a bounded in-memory undo history and initial-snapshot reset. [useAdminEditor](../../../src/admin/useAdminEditor.ts) assumes staging/export rather than durable save/publication. Existing local ID helpers cannot allocate authoritative database IDs.
- [Database operations](../../../backend/src/meducation_api/db/operations.py) already provide independently committed reservations, revision-checked draft save, trusted file import and activation. The importer is not an authored-publication API: it registers unseen IDs and records file provenance. Add a dedicated authored publication path.
- L3 learner adapters pin one release per response and select the publication pointer on each content request. Preserve this behavior; publication should not require worker restarts or background polling.
- Backend `auth/` will own identity, assurance adapters, sessions and authorization. Focused backend admin modules will own request contracts and authoring services; `db/` and packaged migrations own transactions/privileges. Admin `data` owns transport/decoding; admin `core` remains independent of React. Shared validation policy belongs with content validation, not presentation. Create modules only as implementation needs them.
- Fixture contracts belong in `tests/fixtures`, backend tests in `backend/tests`, controller tests beside their owners, browser flows in `e2e`, and operational wrappers in `scripts/containers`. Follow [architecture boundaries](../../architecture.md#repository-ownership), [content management](../../content-management.md), [design conventions](../../design-system.md), and [testing](../../testing.md).

## Step 1 — Freeze the paired editor and access contracts

- [ ] Capture current authoring flows, source hashes and L3 primitive behavior. Inventory quiz/flashcard creates, bulk/import, shared-subject deletion, preview, undo, reset and exports; identify every synchronous snapshot and max-current-ID dependency.
- [ ] Specify one loaded snapshot containing both banks, draft revision, base release/publication sequence, current publication context and server-derived capabilities. Keep draft revision, operation UUID, release ID, publication sequence and content digests distinct.
- [ ] Define the HTTP operations for session status, paired load, reservation, preview, save, undo/reset, publish preview/publish, release listing/activation, export and operation-result lookup. Specify bounded payloads, validation paths, conflict/precondition behavior and safe errors. Actor identity comes only from the verified principal; a browser-supplied reason cannot supply identity.
- [ ] Define local unsaved record text versus saved unpublished draft versus published release. Proposed behavior: Stage becomes an explicit durable draft save; preview does not save content; navigation retains unstaged text under existing safeguards. Present each state clearly without exposing protocol details in ordinary UI copy.
- [ ] Specify paired Undo as a new revision restoring a bounded prior paired draft snapshot, never deleting audit or release records. Decide durable history storage and its retention before migration; preserve the current ten-batch bound unless evidence requires a change. Reset explicitly restores the current published pair after confirmation and checks both revision and publication sequence. A publication/activation change invalidates old previews and undo context; preserve displaced drafts in audit/recovery evidence.
- [ ] Define preview fingerprints over exact candidate pair, reason, reservations and revision/publication context. Editing either section invalidates preview. Save/publish revalidate on the server; no transaction stays open while a human reviews.
- [ ] Define durable UUID replay and uncertain-write recovery. Same UUID and fingerprint returns the original result without repeating effects; changed input fails. After timeout, query operation status/reload authoritative state before deciding whether to retry. Never generate a new UUID merely because the response was lost.
- [ ] Record authentication adapter acceptance separately from local simulation. ADR0004's provisional provider is not accepted by this plan. Recheck official documentation and Python 3.14 library compatibility when selecting dependencies; establish exact MFA evidence/freshness requirements before implementing a production provider adapter.

Gate: reviewable request/state contracts and ownership decisions cover all existing flows. Provider tenant/MFA evidence may remain a named hosted gate, but must not be represented as passed or bypassed. Provider-neutral local work can proceed with explicit test identity; a production adapter remains disabled until accepted.

## Step 2 — Implement server content-policy validation

- [ ] Add an HTTP-safe paired validator covering stored structure, shared-subject references, ordering, provenance, Markdown/limited HTML, URLs/images and LaTeX policy. L3's development-time Node CLI is not the request validation boundary. Select and document the maintained parser/render-validation approach before locking dependencies; do not replace parser policy with permissive regex checks.
- [ ] Extend shared TypeScript/Python cases for omitted versus null fields, Unicode, duplicate JSON keys, non-finite numbers, dangerous keys, malformed markup/math, image origins, answer references, empty/invalid descendants and coordinated deletes/moves. Preserve exact accepted content rather than normalizing it silently.
- [ ] Bound request bytes before parsing, collection/string/depth limits and expensive parser work. Size limits must accommodate measured actual-bank edits/exports; return actionable errors without truncation. Apply equivalent limits through the real proxy.
- [ ] Make preview, save and authored publish use this validator. Prove rejected input leaves draft, active release and audit mutation outcome consistent; already committed ID reservations remain burned.

Gate: shared fixture policy parity and read-only actual-bank acceptance pass. Any validator difference is resolved or explicitly blocks affected authoring; authentication is not treated as validation.

## Step 3 — Add authenticated sessions and least-privilege access

- [ ] Implement ADR0004's maintained-library OIDC code/PKCE flow, single-use state/nonce/browser binding, fixed endpoints/redirects, issuer/audience/azp/signature/date checks and bounded JWKS handling. Pin dependencies after clean Python 3.14 verification.
- [ ] Add packaged migrations for private Postgres sessions/login transactions, distinct session-store credentials and the restricted editor role. API startup never migrates. Reader credentials cannot inspect drafts/auth/audit; editor credentials cannot use trusted import registration, arbitrary DML or owner privileges.
- [ ] Enforce exact issuer/subject allowlisting and verified provider assurance. Implement idle/absolute expiry, session rotation, policy epoch, revocation and sensitive-action freshness per ADR0004. Serialize session checks and protected mutations safely against logout/revocation; document already-committed writes.
- [ ] Enforce session-bound CSRF and exact Origin on browser writes, secure host-only HttpOnly cookies, private no-store responses, safe redirects, callback/log redaction, rate/body limits and admin CSP/frame policy. Public learner reads ignore admin cookies and remain available when admin identity is unavailable.
- [ ] Supply injected test tokens and, where practical, a loopback standards-based OIDC harness for login/logout/step-up. Production refuses development issuer/cookie/bypass settings. Do not build a production password/MFA service or enable a header-based identity shortcut.
- [ ] Exercise every negative case in [ADR0004's acceptance list](../../decisions/0004-single-editor-authentication.md#local-test-identity-and-verification-gates), including token-purpose confusion, key rotation/outage, replay, wrong editor, missing MFA, expired/revoked sessions, CSRF, session-store outage and old restore epochs. Add provider logout behavior when implementing an accepted adapter.

Gate: direct HTTP tests prove every private operation is denied without a valid editor session; local flow tests pass through cookies/redirects. Record separately what synthetic identity proves and which real provider/fresh-factor behaviors remain unverified.

## Step 4 — Implement paired draft and publication services

- [ ] Add private load/reserve/preview/save/undo/reset operations using Steps 1–3 contracts. Use one paired revision for quiz and flashcard edits. Server reservations bind creation intent and expected context; reject unowned/unreserved creates and preserve established IDs.
- [ ] Add a dedicated authored-release transaction that locks/captures one draft, checks expected draft revision and current base publication sequence, validates/finalizes both banks, records verified actor/reason, creates/activates the release and advances the draft base/revision atomically. Do not invent file-import provenance.
- [ ] Preserve append-only audit, operation ledger and allocation history through reset/undo/publication/rollback. Test failed transactions at each meaningful boundary, concurrent saves/publications/reservations and lost-response replay.
- [ ] Implement fresh-auth protected activation of a retained release with expected publication sequence. Activation preserves newer releases and allocations; it does not silently overwrite the draft. An out-of-date draft requires an explicit reset/rebase decision before publication; no automatic merge.
- [ ] Add deterministic paired release export with manifest, IDs, digests, sequence and validation evidence. Label any draft export explicitly as unpublished with its revision; it is not a substitute for full DB backup. Keep private authentication data out of content exports.
- [ ] Verify publication becomes visible to request-driven readers without restarting workers, including rollback to identical digests. Prove concurrent responses never mix banks and learner routes never disclose drafts.

Gate: real PG17 integration, role attacks, concurrency and failure/replay tests pass. Ordinary fixture pytest skips do not count as database acceptance. No authority change yet.

## Step 5 — Connect the existing admin to the HTTP gateway

- [ ] Replace production admin bundled-bank bootstrap with session-aware asynchronous paired loading and explicit loading/error states. Retain the in-memory adapter only for clearly separate JSON development/fixtures before cutover; prevent two writable authoritative modes afterward.
- [ ] Adapt the gateway/controller and flashcard panel to one paired snapshot and server reservation path. Reuse pure preview/edit helpers where their semantics still fit. Do not add auth dependencies to learner/domain code or store private drafts/tokens in learner persistence.
- [ ] Preserve single/bulk/import flows, shared-subject cascade review, ordered moves, bounded diagnostics, hidden-section dirty guards and paired Undo. Imported operations cannot bypass server allocation, validation or stale checks; specify how legacy creates with client-generated IDs are rejected or explicitly converted for re-preview.
- [ ] Add save/publication status, publish review, release activation and export actions. Make it clear that saving does not publish and Undo/Reset changes only drafts. Confirmation shows the exact affected content/revision context.
- [ ] Preserve unsaved text on expiry/network failure/conflict. Reauthentication must keep that in-memory text available (for example via a same-origin completion window), rather than destroying it with a full-page login redirect. Refresh CSRF/session state, invalidate stale previews and require renewed confirmation; never automatically resend a sensitive mutation.
- [ ] Remove automatic generic write retries; use operation status reconciliation. Test pending preview edits, two tabs, stale reset/undo, uncertain commits, another tab publishing, logout during save and canceled step-up.

Gate: browser tests through the actual API/reverse proxy edit both banks, reload saved drafts, publish and activate/export successfully. Test keyboard/focus and existing 390/1048/1440px layouts. Learner bundle omits admin/private content; unchanged local progress, active-content guards and post-submit review still pass.

## Step 6 — Rehearse authoritative recovery and prepare tooling

- [ ] Define an operator backup schedule after meaningful authoring sessions/publishing and at least daily while authoring. Record an off-volume destination, protected access, retention schedule and restore procedure; measure provisional content RPO <=24h and RTO <=4h. Keep an independent off-device copy; a temporary test archive or Docker volume is not retained recovery.
- [ ] Settle recovery of allocations made after the last DB backup. Choose durable off-volume allocation evidence/high-water protection and test reconciliation before enabling authoritative creates. If evidence is incomplete, fail closed on allocation until resolved; RPO data loss cannot silently permit ID reuse.
- [ ] Rehearse PG17 custom dump/fresh separate-DB restore with draft, release, audit, operation/reservation history, counters, schema and explicit role/ACL parity. Include auth schema as appropriate but rotate the external auth epoch and clear login transactions before restoring admin access. Restart application caches after replacement.
- [ ] Obtain deterministic exports from selected drafts/releases and implement authority-aware validation/audit commands. Keep fixture CI independent of production credentials; update operator commands and admin bootstrapping so stale repository JSON is never mistaken for current authored content.
- [ ] Inventory private PDFs, extracted source material, local media and external URLs separately; content DB backups do not contain them or learner browser progress. Document recovery ownership and limitations.
- [ ] Prepare the exact cutover checklist and documentation patch for AGENTS.md, architecture, both schema guides, content management, testing, backend/container runbooks and affected validation/audit tooling. Preserve the original canonical source hashes and identity history limitations.

Gate: a recoverable retained copy exists, fresh restoration is measured and verified, allocation recovery is enforced, and current export/tooling commands work. Record destination identifiers and evidence without committing secrets or private content. If the required backup destination or provider evidence is unavailable, keep cutover pending.

## Step 7 — Explicitly cut over content authority

- [ ] Present the concrete verification evidence, remaining provider/launch limitations, source comparison and recovery artifacts for explicit cutover approval. Do not change authority as an incidental consequence of implementing the gateway.
- [ ] Freeze JSON authoring, capture/hash the final paired canonical files and import/reconcile that reviewed pair into the designated local authoritative DB. Discard experimental fixture/copy drafts from the cutover target; do not silently promote test edits.
- [ ] Verify exact data/order/provenance/revision parity and obtain a retained full backup plus deterministic export. Enable the authenticated local database authoring workflow and apply the prepared authority/tooling documentation together.
- [ ] Postgres becomes the only writable canonical source. JSON is a labeled deterministic export/archive/local read fallback; operator import is restricted recovery/migration. Record the first DB-only edit/publication and regenerate its export as a rehearsal. A stale JSON snapshot cannot roll back subsequent DB-only work.
- [ ] Test compatible app/schema recovery and previous-release activation without deleting later content. Record cutover time, schema/release/sequence, hashes, backup evidence and allowed fallback procedure.

Gate: separately authorized cutover completed with current recoverable content and no second writable canonical source. Local test identity remains visibly development-only; hosted provider acceptance is still required before production enablement. No deployment is authorized by this step.

## Step 8 — Verify L4 and hand off to L5

- [ ] Run `npm run verify:full` with updated authoring coverage, required learner/admin builds, and the new authentication/content validation suites. Run real-Postgres authoring/concurrency/privilege tests, actual-content parity, full restore and real-proxy browser acceptance separately where not included by the runner.
- [ ] Extend existing native AMD64/ARM64 container CI to include packaged migrations, auth dependencies and L4 acceptance; verify both jobs against the final implementation commit. Do not reuse L3's CI result as evidence for changed code.
- [ ] Complete an outcome/invariant audit against every parent L4 checkbox and the handoff requirements. Record commands, versions/commit, observed outcomes, skipped checks, advisories and provider/backup limitations. Relevant failures keep the step open.
- [ ] Update the parent tracker only for demonstrated results. Move this tracker and supporting evidence to `docs/work/done` only after L4 implementation, recovery and authorized cutover gates pass; update incoming links at that time.
- [ ] Carry real hosted identity/MFA/TLS/routing acceptance to deployment, Firefox/mobile/assistive-technology obligations to the existing [browser tracker](L0-browser-acceptance.md), and resilience/load tuning to L5. Deferred tests remain explicit, not implied passes.

Gate: L4 is locally complete and reproducible, with a secure development authoring boundary, recoverable canonical content and a precise L5 handoff. Hosted readiness is a separate claim.

## Progress and verification log

- [x] 2026-10-14: inspected the parent L4 scope, L3 handoff/ADRs, current gateway/controller/bootstrap, database wrappers and repository verification guidance; created this eight-step plan. All implementation checkboxes remain open.
- [x] Planning verification: 45 relative document link/anchor checks and `git diff --check` passed; `npm run build` passed, including TypeScript checking. The existing Vite chunk-size advisory remains. These checks validate the documentation handoff/current build, not any unimplemented L4 behavior.

Next action after authorization: Step 1 only. No application code, canonical content, database, identity configuration or authority is changed by this planning task.

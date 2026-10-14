# L4 — Local database authoring and admin access

Created: 2026-10-14. Status: Steps 1–5 local gates complete. Steps 6–7 locally complete under the user's 2026-10-14 local-only retention override: the designated PostgreSQL database is authoritative, protected local dumps/exports and allocation journals are retained and a fresh separate-target restore passed. Off-device/hardware-loss recovery is explicitly deferred. Step 8 full local verification/audit and all five changed-source CI jobs pass at `bc90d75`, including native AMD64/ARM64. Final tracker archival remains pending (earlier CI at `f99a18e` is historical). Hosted provider/fresh-factor and manual device/accessibility acceptance remain separate open gates.

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

- [x] Capture current authoring flows, source hashes and L3 primitive behavior. Inventory quiz/flashcard creates, bulk/import, shared-subject deletion, preview, undo, reset and exports; identify every synchronous snapshot and max-current-ID dependency.
- [x] Specify one loaded snapshot containing both banks, draft revision, base release/publication sequence, current publication context and server-derived capabilities. Keep draft revision, operation UUID, release ID, publication sequence and content digests distinct.
- [x] Define the HTTP operations for session status, paired load, reservation, preview, save, undo/reset, publish preview/publish, release listing/activation, export and operation-result lookup. Specify bounded payloads, validation paths, conflict/precondition behavior and safe errors. Actor identity comes only from the verified principal; a browser-supplied reason cannot supply identity.
- [x] Define local unsaved record text versus saved unpublished draft versus published release. Proposed behavior: Stage becomes an explicit durable draft save; preview does not save content; navigation retains unstaged text under existing safeguards. Present each state clearly without exposing protocol details in ordinary UI copy.
- [x] Specify paired Undo as a new revision restoring a bounded prior paired draft snapshot, never deleting audit or release records. Decide durable history storage and its retention before migration; preserve the current ten-batch bound unless evidence requires a change. Reset explicitly restores the current published pair after confirmation and checks both revision and publication sequence. A publication/activation change invalidates old previews and undo context; preserve displaced drafts in audit/recovery evidence.
- [x] Define preview fingerprints over exact candidate pair, reason, reservations and revision/publication context. Editing either section invalidates preview. Save/publish revalidate on the server; no transaction stays open while a human reviews.
- [x] Define durable UUID replay and uncertain-write recovery. Same UUID and fingerprint returns the original result without repeating effects; changed input fails. After timeout, query operation status/reload authoritative state before deciding whether to retry. Never generate a new UUID merely because the response was lost.
- [x] Record authentication adapter acceptance separately from local simulation. ADR0004's provisional provider is not accepted by this plan. Recheck official documentation and Python 3.14 library compatibility when selecting dependencies; establish exact MFA evidence/freshness requirements before implementing a production provider adapter.

Gate: reviewable request/state contracts and ownership decisions cover all existing flows. Provider tenant/MFA evidence may remain a named hosted gate, but must not be represented as passed or bypassed. Provider-neutral local work can proceed with explicit test identity; a production adapter remains disabled until accepted.

## Step 2 — Implement server content-policy validation

- [x] Add an HTTP-safe paired validator covering stored structure, shared-subject references, ordering, provenance, Markdown/limited HTML, URLs/images and LaTeX policy. L3's development-time Node CLI is not the request validation boundary. Select and document the maintained parser/render-validation approach before locking dependencies; do not replace parser policy with permissive regex checks.
- [x] Extend shared TypeScript/Python cases for omitted versus null fields, Unicode, duplicate JSON keys, non-finite numbers, dangerous keys, malformed markup/math, image origins, answer references, empty/invalid descendants and coordinated deletes/moves. Preserve exact accepted content rather than normalizing it silently.
- [x] Bound request bytes before parsing, collection/string/depth limits and expensive parser work. Size limits must accommodate measured actual-bank edits/exports; return actionable errors without truncation. Apply equivalent limits through the real proxy.
- [x] Make preview, save and authored publish use this validator. Prove rejected input leaves draft, active release and audit mutation outcome consistent; already committed ID reservations remain burned.

Gate: shared fixture policy parity and read-only actual-bank acceptance pass. Any validator difference is resolved or explicitly blocks affected authoring; authentication is not treated as validation.

## Step 3 — Add authenticated sessions and least-privilege access

- [x] Implement ADR0004's maintained-library OIDC code/PKCE flow, single-use state/nonce/browser binding, fixed endpoints/redirects, issuer/audience/azp/signature/date checks and bounded JWKS handling. Pin dependencies after clean Python 3.14 verification.
- [x] Add packaged migrations for private Postgres sessions/login transactions, distinct session-store credentials and the restricted editor role. API startup never migrates. Reader credentials cannot inspect drafts/auth/audit; editor credentials cannot use trusted import registration, arbitrary DML or owner privileges.
- [x] Enforce exact issuer/subject allowlisting and verified provider assurance. Implement idle/absolute expiry, session rotation, policy epoch, revocation and sensitive-action freshness per ADR0004. Serialize session checks and protected mutations safely against logout/revocation; document already-committed writes.
- [x] Enforce session-bound CSRF and exact Origin on browser writes, secure host-only HttpOnly cookies, private no-store responses, safe redirects, callback/log redaction, rate/body limits and admin CSP/frame policy. Public learner reads ignore admin cookies and remain available when admin identity is unavailable.
- [x] Supply injected test tokens and, where practical, a loopback standards-based OIDC harness for login/logout/step-up. Production refuses development issuer/cookie/bypass settings. Do not build a production password/MFA service or enable a header-based identity shortcut.
- [x] Exercise every negative case in [ADR0004's acceptance list](../../decisions/0004-single-editor-authentication.md#local-test-identity-and-verification-gates), including token-purpose confusion, key rotation/outage, replay, wrong editor, missing MFA, expired/revoked sessions, CSRF, session-store outage and old restore epochs. Add provider logout behavior when implementing an accepted adapter.

Gate: direct HTTP tests prove every private operation is denied without a valid editor session; local flow tests pass through cookies/redirects. Record separately what synthetic identity proves and which real provider/fresh-factor behaviors remain unverified.

Step 3 scope note: the direct HTTP/cookie-flow backend gate is verified.
ADR0004's editor-flow acceptance requires the HTTP editor scheduled in Step 5;
those UI cases are not claimed as passed. Provider logout/back-channel and real
factor freshness remain conditional on an accepted production adapter, which is
disabled. No hosted or UI requirement is waived by local backend completion.

## Step 4 — Implement paired draft and publication services

- [x] Add private load/reserve/preview/save/undo/reset operations using Steps 1–3 contracts. Use one paired revision for quiz and flashcard edits. Server reservations bind creation intent and expected context; reject unowned/unreserved creates and preserve established IDs.
- [x] Add a dedicated authored-release transaction that locks/captures one draft, checks expected draft revision and current base publication sequence, validates/finalizes both banks, records verified actor/reason, creates/activates the release and advances the draft base/revision atomically. Do not invent file-import provenance.
- [x] Preserve append-only audit, operation ledger and allocation history through reset/undo/publication/rollback. Test failed transactions at each meaningful boundary, concurrent saves/publications/reservations and lost-response replay.
- [x] Implement fresh-auth protected activation of a retained release with expected publication sequence. Activation preserves newer releases and allocations; it does not silently overwrite the draft. An out-of-date draft requires an explicit reset/rebase decision before publication; no automatic merge.
- [x] Add deterministic paired release export with manifest, IDs, digests, sequence and validation evidence. Label any draft export explicitly as unpublished with its revision; it is not a substitute for full DB backup. Keep private authentication data out of content exports.
- [x] Verify publication becomes visible to request-driven readers without restarting workers, including rollback to identical digests. Prove concurrent responses never mix banks and learner routes never disclose drafts.

Gate: real PG17 integration, role attacks, concurrency and failure/replay tests pass. Ordinary fixture pytest skips do not count as database acceptance. No authority change yet.

## Step 5 — Connect the existing admin to the HTTP gateway

- [x] Replace production admin bundled-bank bootstrap with session-aware asynchronous paired loading and explicit loading/error states. Retain the in-memory adapter only for clearly separate JSON development/fixtures before cutover; prevent two writable authoritative modes afterward.
- [x] Adapt the gateway/controller and flashcard panel to one paired snapshot and server reservation path. Reuse pure preview/edit helpers where their semantics still fit. Do not add auth dependencies to learner/domain code or store private drafts/tokens in learner persistence.
- [x] Preserve single/bulk/import flows, shared-subject cascade review, ordered moves, bounded diagnostics, hidden-section dirty guards and paired Undo. Imported operations cannot bypass server allocation, validation or stale checks; specify how legacy creates with client-generated IDs are rejected or explicitly converted for re-preview.
- [x] Add save/publication status, publish review, release activation and export actions. Make it clear that saving does not publish and Undo/Reset changes only drafts. Confirmation shows the exact affected content/revision context.
- [x] Preserve unsaved text on expiry/network failure/conflict. Reauthentication must keep that in-memory text available (for example via a same-origin completion window), rather than destroying it with a full-page login redirect. Refresh CSRF/session state, invalidate stale previews and require renewed confirmation; never automatically resend a sensitive mutation.
- [x] Remove automatic generic write retries; use operation status reconciliation. Test pending preview edits, two tabs, stale reset/undo, uncertain commits, another tab publishing, logout during save and canceled step-up.

Gate: browser tests through the actual API/reverse proxy edit both banks, reload saved drafts, publish and activate/export successfully. Test keyboard/focus and existing 390/1048/1440px layouts. Learner bundle omits admin/private content; unchanged local progress, active-content guards and post-submit review still pass.

## Step 6 — Rehearse authoritative recovery and prepare tooling

- [x] Define an operator backup schedule after meaningful authoring sessions/publishing and at least daily while authoring. Record an off-volume destination, protected access, retention schedule and restore procedure; measure provisional content RPO <=24h and RTO <=4h. Independent off-device retention is user-deferred for this local cutover; a temporary test archive or Docker volume is not retained recovery.
- [x] Settle recovery of allocations made after the last DB backup. Choose durable local off-volume allocation evidence/high-water protection (off-device deferred) and test reconciliation before enabling authoritative creates. If evidence is incomplete, fail closed on allocation until resolved; RPO data loss cannot silently permit ID reuse.
- [x] Rehearse PG17 custom dump/fresh separate-DB restore with draft, release, audit, operation/reservation history, counters, schema and explicit role/ACL parity. Include auth schema as appropriate but rotate the external auth epoch and clear login transactions before restoring admin access. Restart application caches after replacement.
- [x] Obtain deterministic exports from selected drafts/releases and implement authority-aware validation/audit commands. Keep fixture CI independent of production credentials; update operator commands and admin bootstrapping so stale repository JSON is never mistaken for current authored content.
- [x] Inventory private PDFs, extracted source material, local media and external URLs separately; content DB backups do not contain them or learner browser progress. Document recovery ownership and limitations.
- [x] Prepare the exact cutover checklist and documentation patch for AGENTS.md, architecture, both schema guides, content management, testing, backend/container runbooks and affected validation/audit tooling. Preserve the original canonical source hashes and identity history limitations.

Gate: a recoverable retained copy exists, fresh restoration is measured and verified, allocation recovery is enforced, and current export/tooling commands work. Record destination identifiers and evidence without committing secrets or private content. The user-approved local-only policy closes the local cutover gate; hardware-loss and hosted-provider acceptance remain open.

## Step 7 — Explicitly cut over content authority

- [x] Present the concrete verification evidence, remaining provider/launch limitations, source comparison and recovery artifacts for explicit cutover approval. Do not change authority as an incidental consequence of implementing the gateway.
- [x] Freeze JSON authoring, capture/hash the final paired canonical files and import/reconcile that reviewed pair into the designated local authoritative DB. Discard experimental fixture/copy drafts from the cutover target; do not silently promote test edits.
- [x] Verify exact data/order/provenance/revision parity and obtain a retained full backup plus deterministic export. Enable the authenticated local database authoring workflow and apply the prepared authority/tooling documentation together.
- [x] Postgres becomes the only writable canonical source. JSON is a labeled deterministic export/archive/local read fallback; operator import is restricted recovery/migration. Record the first DB-only edit/publication and regenerate its export as a rehearsal. A stale JSON snapshot cannot roll back subsequent DB-only work.
- [x] Test compatible app/schema recovery and previous-release activation without deleting later content. Record cutover time, schema/release/sequence, hashes, backup evidence and allowed fallback procedure.

Gate: separately authorized cutover completed with current recoverable content and no second writable canonical source. Local test identity remains visibly development-only; hosted provider acceptance is still required before production enablement. No deployment is authorized by this step.

## Step 8 — Verify L4 and hand off to L5

- [x] Run `npm run verify:full` with updated authoring coverage, required learner/admin builds, and the new authentication/content validation suites. Run real-Postgres authoring/concurrency/privilege tests, actual-content parity, full restore and real-proxy browser acceptance separately where not included by the runner.
- [x] Extend existing native AMD64/ARM64 container CI to include packaged migrations, auth dependencies and L4 acceptance; verify both jobs against the final implementation commit. Do not reuse L3's CI result as evidence for changed code.
- [x] Complete an outcome/invariant audit against every parent L4 checkbox and the handoff requirements. Record commands, versions/commit, observed outcomes, skipped checks, advisories and provider/backup limitations. Relevant failures keep the step open.
- [ ] Update the parent tracker only for demonstrated results. Move this tracker and supporting evidence to `docs/work/done` only after L4 implementation, recovery and authorized cutover gates pass; update incoming links at that time.
- [x] Carry real hosted identity/MFA/TLS/routing acceptance to deployment, Firefox/mobile/assistive-technology obligations to the existing [browser tracker](L0-browser-acceptance.md), and resilience/load tuning to L5. Deferred tests remain explicit, not implied passes.

Gate: L4 is locally complete and reproducible, with a secure development authoring boundary, recoverable canonical content and a precise L5 handoff. Hosted readiness is a separate claim.

## Progress and verification log

- [x] 2026-10-14: inspected the parent L4 scope, L3 handoff/ADRs, current gateway/controller/bootstrap, database wrappers and repository verification guidance; created this eight-step plan. All implementation checkboxes remain open.
- [x] Planning verification: 45 relative document link/anchor checks and `git diff --check` passed; `npm run build` passed, including TypeScript checking. The existing Vite chunk-size advisory remains. These checks validate the documentation handoff/current build, not any unimplemented L4 behavior.

### Step 1 — 2026-10-14

- [x] Completed [paired authoring/access contracts](../../L4-paired-authoring-contract.md), including the existing-flow inventory, asynchronous paired state, wire identities, bounded HTTP operations/errors, durable paired Undo/history, reset/publication semantics, exact preview bindings and uncertain-write reconciliation.
- [x] Captured [source baseline](L4-step1-source-baseline.json) at `4104f120712be2e1333f9780de4548f24dc0a729`: 13 inspected file hashes, actual-bank sizes/counts and focused test commands/results. Quiz source: 16,456,246 bytes, SHA-256 `11b3fd084f4462c16805069883f53defd538a4d0bcd4d3537ab4c101bd7a3901`; flashcard source: 653,579 bytes, SHA-256 `fa6c863dd11085311111f9715a4a5e291a5e9e6a28ac03e4e51a83d0c4443ac7`. No source content is copied into the evidence.
- [x] Baseline editor/controller/core tests: 7 files / 58 tests passed. Python paired-artifact tests: 6 passed. These establish existing behavior, not unimplemented HTTP behavior.
- [x] Audited every Step 1 item using the repository completion-audit skill: no blocking contract omissions found. SQL inspection identified missing live-context checks at reservation allocation, principal/intent binding, private HTTP validation, durable paired history and dedicated authored publication. Those are explicit implementation obligations, not claimed L3 guarantees.
- [x] Final verification: `npm run build` passed (TypeScript and learner production bundle); existing >500 kB Vite chunk advisory remains. All 45 relative document links/anchors passed, all 13 captured source hashes remain unchanged, and `git diff --check` plus new-file whitespace checks passed. No runtime changes require browser/DB acceptance in this step.

The provisional provider remains unaccepted. No dependencies/provider settings were selected; official documentation and Python 3.14 compatibility must be rechecked when selecting them. New real-PG, real-proxy browser, native container CI, provider and retained-recovery acceptance were not run in this documentation step. No application code, canonical content, database, identity configuration or authority changed.

### Step 2 — 2026-10-14

- [x] Implemented [packaged paired content-policy validation](../../L4-content-policy.md): strict UTF-8/JSON/Pydantic admission plus the existing unified/GFM/currency-math/KaTeX policy in a wheel-packaged Node worker. Selected/pinned parse5 8.0.1 for raw HTML tokenization and esbuild 0.28.2 for bundling; request validation requires neither tsx nor a repository checkout. Expanded restricted-field/reference-URL/HTML/math checks and closed app-local backslash image-origin escape.
- [x] Added shared paired/wire fixtures and TypeScript/Python tests for sparse/null fields, Unicode/NUL, duplicate/dangerous keys, non-finite values, malformed rich content, images, answer provenance/references, empty descendants and coordinated changes. Added immutable captured-pair, safe-path, bounded-error, slot release/outage/timeout and trusted-origin tests.
- [x] Implemented shared 64 MiB request, field/collection/depth/node budgets, two body readers and two validation slots per process, 120-second worker timeout and 512 MiB V8 old-space ceiling. Real nginx accepts exact 64 MiB chunked bodies, rejects one extra byte and denies compressed bodies; learner timeouts remain ten seconds. Total process RSS/load tuning remains L5.
- [x] `save_draft` now invokes the validator before SQL; rejected real-PG saves preserve draft/publication/releases/audit/ledger/reservations and never reclaim independently committed allocations. Authenticated preview and authored-publish services do not exist until Steps 3–4: the fourth Step 2 checkbox stays open. The implementation was deferred to Step 4 because those services are not implemented; this dependency does not satisfy or remove the Step 2 requirement. No public validation route was added; proxy tests mount a disposable test-only app.
- [x] Measured actual-bank acceptance: exact quiz/flashcard artifacts and source SHA-256 values from Step 1, 32 existing review warnings; initial host run 27.62 seconds (measurement, not capacity assurance). Both banks remain unchanged. Request/export limits accommodate the measured pair; export implementation/enforcement remains Step 4.
- [x] Clean image installation surfaced nested dependency advisories; focused KaTeX/source-map-js overrides now produce zero audit findings. Rendering regressions passed; no auth provider/library selection or settings changed.
- [x] `npm run verify:full` passed: lint/format/architecture (10 tests), 93 frontend files / 583 tests, actual-bank validation, Ruff/mypy, 138 backend tests (81 PG cases skipped in ordinary pytest), typecheck, fresh learner/admin builds, 41 learner/progress and 12 admin Chromium browser tests. Ran the skipped real-PG17 suite separately: all 81 passed. Focused final-source checks: 49 TS authoring-policy plus 6 Markdown tests and 64 Python authoring/artifact tests passed. Final diagnostic-path fixes were rechecked with current lint/format, Ruff/mypy, typecheck, rebuilt worker and rebuilt-image proxy smoke.
- [x] Native ARM64 API image build passed with packaged Node 22/Python 3.14 resources. Installed-wheel/actual-nginx smoke passed all seven transport/policy checks, including read-only actual-bank acceptance. [Step 2 evidence](L4-step2-validation-evidence.json) captures source hashes and results. Native AMD64 CI and the changed ARM64 CI job remain unrun until a future commit/run; local ARM64 evidence is not both-architecture acceptance.
- [x] Completion audit applied the repository completion-audit skill to source/diffs and Step 2 outcomes. Foundation verification passed, but the open preview/authored-publish integration requirement blocks full Step 2 completion. The prior handoff overstated readiness to advance past Step 2. Existing Vite chunk-size and Starlette/httpx deprecation advisories remain; provider acceptance, retained recovery and authority cutover are still pending.

### Completion-status correction — 2026-10-14

The user identified the unchecked Step 2 requirement after the handoff. Step 2 is **partial**, not complete. Passing validator, fixture, corpus, draft-save and proxy checks does not establish validation/rejection behavior in unimplemented preview and authored-publish services. The earlier proposal to advance to Step 3 treated a subset of the gate as full step completion; that conclusion is withdrawn.

Remaining work: integrate the validator into the actual preview and captured authored-publication paths and prove their rejected-input behavior preserves draft, active release and audit outcomes, with committed allocations remaining burned. The plan places authentication in Step 3 and those services in Step 4, creating a sequencing dependency for this Step 2 item. Resolve that dependency explicitly before claiming completion or treating the stage boundary as passed. Keep the original checkbox open; no requirement has been waived or silently moved.

### Step 2 integration completed — 2026-10-14

The user authorized continuation to close the original unchecked requirement.
The sequencing dependency is resolved by implementing internal services and
transactions before HTTP exposure. The foundation/correction entries above and
[foundation evidence](L4-step2-validation-evidence.json) are preserved as history;
[new integration evidence](L4-step2-authoring-evidence.json) records this gate.

- [x] Added internal paired candidate/publication preview and fresh save/publish validation. Captures bind exact artifacts, actor/reason, policy version, reservations and revision/publication context. Completed operation replay returns the original outcome before stale-context checks; new operations revalidate and SQL checks captured context under locks. No browser actor or preview proof is trusted.
- [x] Added packaged migration `0002_authored_publish`, atomic reviewed save and distinct authored releases/receipts with no invented import provenance. Save requires owned allocations for creates; ordinary save cannot resurrect deleted materialized IDs. Publish finalizes both banks and advances pointer/draft base/revision/audit/result atomically. Existing file imports retain earliest-match digest deduplication; populated L3 upgrades preserve content/ledger state.
- [x] All 98 real PG17 tests passed, including all four invalid preview/save/publish paths with complete state snapshots and burned reservations, exact paired reconstruction/provenance, stale/foreign ownership, original-result replay, repeated identical releases, concurrent save/publish and failure injection at six transaction/commit boundaries. Ordinary backend tests: 139 passed, 98 skipped; those skipped cases passed in the separate PG run. Ruff and mypy passed; `npm run build` passed TypeScript and learner production build. Earlier frontend/policy/proxy verification applies to unchanged code; those suites were not rerun for this backend-only continuation.
- [x] Rebuilt native ARM64 API image and passed installed-wheel/resource/migration/privilege/toolchain smoke at the new packaged head. Updated current runbooks, architecture, recovery grants and parent status. No routine database/volume, canonical banks, hosted service or authority was changed. New CI architectures, retained authored-backup recovery and provider acceptance remain later gates.
- [x] Completion audit matched all four original Step 2 checkboxes to implementation/evidence; no blocking findings remain for Step 2. Step 3 sessions/least-privilege authorization is next, pending continuation. Step 4 still owns private HTTP/editor integration, verified-session actors, durable Undo/reset, creation-intent/destination binding, freshness and exports; its checkbox is not marked complete by these internal foundations.

### Step 3 local backend gate — 2026-10-14

- [x] Selected/pinned Authlib 1.8.0, joserfc 1.7.5, cryptography 50.0.2 and httpx2 2.13.1 after Python 3.14 host and clean native ARM64 wheel/image installation. Implemented maintained-library code/S256 PKCE and CodeIDToken validation, single-use encrypted state/nonce/browser binding, fixed redirects/endpoints, strict token purpose/claims/date/issuer/audience/azp/allowlist checks and bounded RSA/JWKS parsing with monotonic cache expiry.
- [x] Packaged head `0003_admin_sessions` adds private persistent login/session/rate tables; explicit bootstrap creates checked owner schemas and distinct session/editor roles. Optional auth roles default NOLOGIN; already enabled roles require explicit credentials for repeated bootstrap. Reader/operator cannot inspect auth; editor cannot inspect auth, import/register unseen IDs, perform arbitrary DML or become owner. No worker migration hook was added.
- [x] Implemented opaque hashed sessions, independent encrypted login material, thirty-minute idle/eight-hour absolute expiry, session/CSRF rotation with preserved absolute expiry, current allowlist/policy epoch, fifteen-minute sensitive-action checks and cross-worker revocation. Guard holds a row lock through protected work; logout cannot undo already committed writes. Step-up reuses its held connection; store/pool/lock/query failures deny access. Explicit emergency revoke clears sessions/login transactions without provider availability.
- [x] Installed prefix-wide authorization before private lookup, exact Origin/CSRF/JSON/encoding admission, bounded flow bodies/rates, cookie flags, fixed clean redirects, private no-store/CSP/frame/no-referrer responses and callback/API/nginx query redaction. Learner routes ignore admin cookies and remain available during identity/session-role outage. Synthetic local flow requires explicit local application/database mode and loopback ASGI binding; production refuses the unaccepted adapter.
- [x] Verification passed: 63 token/config/key/network/log fixtures in the 202-test ordinary backend suite; all 135 separate real PG17 cases, including every planned private path with revoked/expired/wrong-editor/old-epoch sessions, CSRF/Origin/body/encoding/rate failures, nonce/state/browser replay, failed MFA/step-up, rotation, actual loopback HTTP code/Basic/PKCE/cookie redirects, emergency revoke and serialized protected work/logout. Ruff and mypy (31 source files) passed; `npm run build` passed type-check and learner production build. No frontend changes were made; browser/UI suites are not claimed rerun.
- [x] Native ARM64 image build and installed-wheel migration/privilege/toolchain and actual-nginx/packaged-policy checks passed. Actual-bank parity (348 routes), backup-role dump of both schemas, explicit fresh restore/grants and repeated parity passed in a separate disposable cluster. Auth tables are present but empty in that corpus recovery fixture; retained live auth/session/authoring recovery acceptance still belongs to Step 6. [Step 3 evidence](L4-step3-auth-evidence.json) records source hashes and exact results.
- [x] Completion audit matched the local backend Step 3 contract/gate to implementation and evidence, with no blocking local backend findings. Canonical hashes remain unchanged. Existing Vite chunk and recovery SQLAlchemy tuple deprecation advisories plus intentional weak-key test warnings are recorded. Production provider/tenant/fresh-factor/logout, editor UX, new native CI and authority/recovery gates remain unverified. Step 4 is next, pending continuation.

## Step 4 implementation and verification — 2026-10-14

- [x] Private verified-session load/reserve/preview/save/Undo/reset services now use one paired revision. Reservation receipts bind actor, expected context, exact structured slot intent and creation destination; invalid saves preserve independently burned IDs. Raw authored records retain ordering, stable IDs and answer provenance.
- [x] Packaged `0004_editor_operations` dispatches one global operation receipt per mutation. Authored publication validates both captured banks, checks draft/base/current publication, creates a distinct finalized release/activation and advances draft base/revision atomically; importer provenance remains separate.
- [x] Immutable before/after paired history preserves displaced content beyond the bounded ten-entry Undo stack. Reset/activation/publication invalidate Undo epochs explicitly. Retained activation preserves the draft, releases and allocations; stale-base publication requires explicit reset. Identical replay returns the original immutable result/snapshot after later changes.
- [x] Session request identity locks and independent SQL session locks serialize mutations against revocation. Freshness/expiry are rechecked after validation and in SQL; server-derived multi-entity deletion requires fresh authentication. Editor functions remain guarded; editor/reader/session/backup cannot execute internal mutations or bypass role ownership boundaries.
- [x] Deterministic paired ZIP export includes exact artifacts, IDs/digests/publication and validation evidence, with unpublished draft labels and bounded 128 MiB total size. No private authentication material is included. Request-driven reader snapshots expose paired publication without restart and retain the prior pair during concurrent publication.
- [x] Final real PG17 regression: **155 passed in 191.94s**, including failure injection at release finalization, authored/publication events, draft/history/audit and deferred commit; concurrent saves/publications/reservations; stale/replay/ownership cases and reader isolation. Initial extended run failed in a newly added reader test's field names; corrected and rerun in full. Ordinary backend: **202 passed, 155 PostgreSQL skips**, two intentional weak-key fixture warnings. Skips are not database acceptance.
- [x] Ruff and mypy (35 source files), `npm run build` (TypeScript plus production learner build), installed native ARM64 API image migration/toolchain and actual Nginx packaged-policy/limits checks passed. Actual-corpus paired reconstruction/all learner route parity matched before and after isolated full backup/restore with the new schema/grants. This compatibility check does not close Step 6 authored-history/off-device/allocation recovery.
- [x] Completion audit matched all six original Step 4 checkboxes; no blocking local backend findings remain. Canonical bank SHA-256 values are unchanged. Changed/new whitespace, documentation links and formatting checked. Existing Vite chunk and SQLAlchemy tuple deprecation advisories remain recorded. [Service runbook](../../L4-paired-editor-services.md) and [frozen Step 4 evidence](L4-step4-editor-evidence.json) record the tested inputs and limits.

Step 4 is complete at its local backend gate. Step 5 browser editor integration is next, pending continuation. Production provider/fresh-factor acceptance remains disabled; full authored recovery, allocation protection, authority cutover and new native CI are later gates. No content authority or routine database/volume changed; L4 overall remains open.

## Step 5 work in progress — 2026-10-14

The user authorized continuation after Step 4. Private HTTP/session transport,
asynchronous paired bootstrap, existing workspace adaptation and explicit
publication/activation/export/reconciliation controls are being implemented.
Packaged `0005_reserved_parents` adds owned same-context parent reservation support
for atomic grouped creates; no canonical record or prior migration is rewritten.
Browser and complete regression acceptance are still running; Step 5 checkboxes
remain open until those gates pass. Hosted identity and authority cutover remain
disabled/pending.

## Step 5 implementation and verification — 2026-10-14

- [x] Optional production admin defaults to asynchronous verified-session/paired HTTP loading with explicit sign-in/retry/error states. HTTP builds exclude the canonical banks and JSON development entry; there is no bundled fallback or in-app writable-mode switch. The JSON adapter remains a separate development/fixture reviewed-download mode before cutover.
- [x] Existing quiz/controller and flashcard panels now consume the paired server state and reservation/save path. Migration `0005_reserved_parents` permits owned same-context reserved parents for one atomic grouped save. Optional protocol nulls reject instead of silently normalizing; SQL rechecks session expiry/freshness after writes before final receipt. Public learner/domain/progress code receives no auth dependency.
- [x] Record, grouped/bulk and import paths retain ordering, sparse fields, source/verified answers, bounded issues, shared-subject cascade review and hidden-section guards. Valid legacy creates are converted to reserved IDs/references and privately re-previewed/confirmed; invalid schemas/identifier spellings reject. Paired imports adopt actual returned server IDs. Shared server Undo/reset replaces section-local history in HTTP mode; displaced saved content remains durable.
- [x] Shared status distinguishes saved unpublished drafts from active publication. Captured publication/retained activation review shows reason, revision/sequence and bounded affected content; activation preserves drafts. Deterministic draft/retained ZIP downloads use server freshness/limits, label drafts unpublished and never imply publication/full backup or clear unpublished state. Experimental DB publication does not replace canonical JSON/default JSON readers.
- [x] Expiry/conflict/network/logout and canceled step-up preserve text. A checked same-origin completion window refreshes session/CSRF and invalidates previews; no protected write is resent automatically. Newer text/reasons typed during imported/coordinated commits remain unsaved after the captured pair commits. Requests/body reads are bounded; uncertain UUID receipts remain available for explicit status reconciliation, including aborts and auth failures.
- [x] Final real PG17 gate: **157 passed** (262.72 seconds); ordinary backend **204 passed, 157 database skips**. Skips are not database acceptance. Native ARM64 installed-image migration/toolchain/role checks and **11 actual API/PG17/Nginx browser tests** passed against the final image. Browser cases cover both-bank edits/reload, publication, retained activation/export, grouped/import conversion, cascade/paired Undo, pending text, stale tabs/reset, lost commit responses, expiry, canceled step-up, logout during save and keyboard/overflow at 390/1048/1440px.
- [x] Verification stages passed: lint/format, **10 architecture tests**, **592 frontend units**, actual-bank validation, packaged policy, Ruff/mypy (36 source files), TypeScript, learner/HTTP-admin builds, **41 learner Chromium tests** and **12 JSON-admin browser tests**. The full runner stopped on leftover owned fixture ports; after exact-command/workspace cleanup its remaining browser/build stages were run separately and passed. No claim that the complete runner itself exited successfully. Initial dashboard timing/test-selector/native-fetch/admission/pending-text defects were corrected and reverified.
- [x] Completion audit matched every original Step 5 outcome to implementation/evidence with no blocking local findings. Canonical hashes remain unchanged; changed/new whitespace, local links and formatting checked. [HTTP editor runbook](../../L4-http-editor.md) and [Step 5 evidence](L4-step5-editor-evidence.json) capture the final sources, image, observed checks, advisories and limits. Historical stage evidence is preserved.

Step 5 is complete at its local HTTP editor gate. Step 6 recovery/tooling is next, pending continuation. Hosted provider/fresh-factor/TLS/routing, durable authored recovery/allocation protection, authority cutover, new native CI and manual device/assistive-technology acceptance remain open. No canonical bank, routine DB/volume or hosted resource changed; L4 overall remains open.


## Step 6 implementation progress — 2026-10-14

The user authorized starting Step 6. After discussing the backup requirement, scope
stays local: prepare and rehearse the tools without provisioning a new backup
service. Retained destination selection/acceptance remains pending; JSON remains
authoritative. No routine DB/volume, hosted resource or canonical content changed.

- [x] Added explicit offline `validate-export`/`audit-export` jobs for selected
  operator release directories and extracted HTTP draft/release ZIPs. Captured
  byte hashes, normalized revisions, ordered HTTP identity inventories, paired
  policy checks and source/context reports prevent silent bundled-bank fallback.
  Reports are private, exclusive-create and do not claim live database currency.
  Existing npm validators/audits identify their repository JSON source.
- [x] Added explicit migrator-only `restore-permissions` and
  `invalidate-restored-sessions` jobs. Unsupported schema heads fail. Session
  quarantine revokes restored sessions/clears login transactions in one transaction
  without modifying content/history/allocations; external epoch rotation remains
  an operator requirement before startup.
- [x] Added a small proposed backup/retention schedule, role-separated fresh-target
  restore procedure, private-source/media recovery inventory and file-by-file
  cutover documentation checklist in [the recovery runbook](../../L4-authoritative-recovery.md).
  This is preparation: no authority or admin build-mode cutover was applied.
- [x] Extended actual-bank PG17 fresh-restore rehearsal passed:
  paired editor history/authored publication/newer unpublished draft, editor slots,
  live session/pending login, exact all-table/sequence/effective-ACL parity, session
  quarantine, independent authored export and fresh learner readers.
- [ ] Select/verify retained off-volume and independent off-device copies; measure
  achieved RPO/RTO. Temporary test archives do not meet this gate.
- [ ] Implement and test allocation recovery enforcement. The runbook proposes
  independently durable pre-issued numeric ceilings; periodic counter snapshots
  alone cannot prevent reuse. Missing/incomplete evidence must fail closed before
  authoritative creates. No such enforcement is claimed implemented.
- [ ] Finish exact cutover documentation patch and retire dual writable modes only
  at separately authorized Step 7. Hosted provider/fresh-factor acceptance and
  native CI/manual device/assistive-technology gates remain pending.

- [x] Verification: 13 final offline-export tests, 4 real PG17 recovery tests and
  2 final real HTTP export checks passed; ordinary backend 215 passed at the earlier
  source stage. TypeScript/learner build, lint/architecture, changed Python
  Ruff/mypy, changed TypeScript format, whitespace and new local doc links passed.
  Actual-bank source/restored API parity checked 348 routes on each side, with
  exact content/history/counter/sequence and effective role permission parity.

Step 6 remains open. [Step 6 evidence](L4-step6-recovery-evidence.json) records
sources, observed checks, provisional rehearsal timing and remaining acceptance
gates. Retained-copy acceptance and allocation enforcement are not passed.


## Step 6 continuation — allocation protection — 2026-10-14

The user authorized continuing Step 6. Migration `0006_allocation_fence` and explicit
migrator jobs now implement independently retained ID ceilings. Protection is
opt-in before the separate authority cutover; no routine schema, destination,
canonical file or writable authority changed.

- [x] `allocation-range` durably records a complete immutable hash-chained range in
  two private journal directories before DB admission. Records bind lineage,
  generation, schema, floors and ceilings. Operator attestation is required for
  real off-device durability; `--rehearsal` is restricted to isolated loopback
  test/verification DBs. No automatic off-device acceptance is claimed.
- [x] DB triggers reject IDs outside admitted ranges and unseen trusted-import
  IDs while protection is enabled. Private application roles cannot edit/disable
  the fence. Range events are append-only and record the verified DB maintenance
  role/reason. Existing registered IDs, answers and authored strings are preserved.
- [x] Restore session quarantine pauses protected allocations. Explicit
  `allocation-recover` verifies complete agreeing journals against the retained DB
  prefix and burns all previous permitted ranges, including ranges absent from a
  backup. Missing/older/foreign/divergent evidence refuses admission. An initial
  failed admission with complete ahead journals can also be reconciled explicitly.
- [x] Failed filesystem/commit admission preserves evidence and admits no new
  range. Ahead/partial journals require explicit review/repair/recovery, never an
  automatic extension retry. Existing journal prefixes are re-flushed before
  admission so a repaired record cannot bypass the durability boundary.
- [x] Full real PG17 suite passed **167 tests** before the final prefix-flush
  safeguard; final focused allocation suite passed **7 tests**. Ordinary backend
  passed **229 tests** at the earlier source stage; skips/deselections do not count
  as PG acceptance. TypeScript, learner build, lint/architecture and Python
  Ruff/mypy (39 source files) passed. Final ordinary backend **230 passed**, journal units **13 passed**, wheel
  packaging/isolated CLI head, all changed source formatting and doc links also
  passed. [Allocation continuation evidence](L4-step6-allocation-evidence.json)
  records exact source stages; temporary journals are not retained recovery.
- [x] Updated full actual-bank restore rehearsal passed: deliberately lost four
  post-backup allocations and a later admitted range, verified quarantine blocks
  creation, then reconciled current independent test journals and proved no ID
  reuse. Source/restored learner parity covered 348 routes each; exact raw
  table/sequence/role-ACL parity passed. Temporary journals do not prove retained
  off-device recovery.
- [x] Prepared [cutover documentation patch](L4-cutover-documentation.patch) and
  [base file hashes](L4-cutover-documentation-base.json); `git apply --check` passes.
  The patch is not applied. Final runtime/build retirement and actual operational
  identifiers remain separately approved Step 7 implementation.

Step 6 remains open until a protected retained off-volume copy and independently
retained off-device backup/journals are selected and verified, with measured
operational RPO/RTO. Historical Step 6 evidence remains unchanged; the
[continuation snapshot](L4-step6-allocation-evidence.json) records the new migration,
final source stages and remaining acceptance.


- [x] Final completion audit found no blocking local implementation defect. Required
  frontend regressions passed **592 tests / 94 files**. Actual-bank validation
  passed through the direct Node/tsx loader with existing review warnings; the npm
  tsx CLI itself was blocked by sandbox IPC permissions, not content rejection.
  All backend source/test Ruff checks, current source formatting, local file links,
  prepared-patch applicability and whitespace passed. Removed only this task's
  wheel build staging output. The tracker stays ongoing for retained destinations,
  real independent durability and measured operational RPO/RTO; no cutover occurred.


## Step 6 operator policy decision — 2026-10-14

The user delegated selection of the retained-copy approach and recovery targets.
The selected approach is a private local root at `var/backups/postgres/` plus a
synchronously written independent recovery root on an encrypted external SSD.
Use an existing suitable drive, or 1 TB initial capacity if one must be acquired;
no device purchase/erase or new cloud service was performed. Bind the independent
configuration to its verified volume UUID before acceptance. No suitable external
destination has been verified in this session; disk-management inspection was
unavailable in the current tool environment.

Policy: full PG17 dump and independently verified copy after meaningful authoring
sessions/publications and at least every 24 hours while authoring (eventual daily
21:00 Asia/Manila schedule); 7 daily/4 weekly/3 monthly copies, permanent allocation
journal chains. Content RPO <=24 hours is measured from the retained snapshot's
capture time. RTO <=4 hours covers recovery from the external copy through checked
learner/editor service restoration on an available compatible machine, including
configuration/key retrieval. Replacement hardware procurement is outside that
clock. Allocation recovery must permit zero ID reuse. Rehearse before cutover,
monthly and after material recovery/schema changes; do not claim a clean-host
recovery target until that scenario is measured.

[The updated runbook](../../L4-authoritative-recovery.md#selected-recovery-targets-and-measurement)
records this decision and the measurement procedure. The decisions are settled;
physical destination verification, retained copies, actual measurements and any
backup scheduling implementation remain open. No recovery/retention gate was
marked passed on the strength of a policy choice.


## Retained-copy deferral and independent CI continuation — 2026-10-14

The user accepted the recovery policy but explicitly deferred connecting an
external drive and asked to continue other work. Retained/off-device acceptance
and operational RPO/RTO remain open; the deferral is not a passed backup gate or
an authority-cutover approval. JSON remains authoritative. No external drive,
cloud service, backup automation or routine database change is being configured.

Proceed with the independent native CI portion of Step 8 while Step 7 stays
pending. The existing AMD64/ARM64 acceptance pipeline already runs current
Postgres/auth/concurrency tests and full recovery. Extend it with fresh HTTP admin
build and installed API/PG17/Nginx editor acceptance, after learner browser stages
that share `dist`. Increase the whole job budget and PG test subprocess timeout
to accommodate measured L4 duration; freeze HTTP fixture/admin inputs in evidence.
Actual final-commit native CI results must still be obtained; local ARM64 checks
cannot certify AMD64 or close the whole Step 8 gate.


### Independent CI preparation verification — 2026-10-14

- [x] Native acceptance now fingerprints the workflow, HTTP fixture module,
  admin/shared frontend inputs and browser config/specs; runs HTTP admin build
  and installed API/PG17/Nginx editor acceptance after learner browser stages;
  records scoped reports and retains HTTP traces under the container artifact tree.
  PG suite timeout is 600 seconds; whole matrix job budget is 60 minutes.
- [x] Fresh ARM64 API image built with installed `0006_allocation_fence` and pinned
  auth dependencies. Installed-wheel/schema/role/toolchain smoke passed; the full
  HTTP editor browser suite passed **11 tests**. Final trace output directory was
  checked with the Playwright config loader after the artifact-only setting change.
  TypeScript, learner/HTTP-admin builds, lint/architecture, container-helper Ruff,
  syntax, whitespace and prepared cutover patch applicability passed. Original
  canonical hashes remain unchanged.
- [ ] Execute both native GitHub jobs against a final implementation commit. The
  full repeated-clean-build runner was not rerun locally; this evidence proves
  the new local ARM64 stages, not the complete matrix or L4 completion.

[CI preparation evidence](L4-step8-ci-preparation-evidence.json) freezes sources,
image and observed checks. Backup/cutover/provider gates remain explicitly open;
no deployment, retained backup or change in canonical authority occurred.


## Final implementation native CI verification — 2026-10-14

The user reported [run 38562572275](https://github.com/mfranco1/meducation/actions/runs/38562572275)
passed and authorized continued work. Read-only GitHub REST metadata independently
confirms all five jobs succeeded, including native AMD64/ARM64 repeated clean
builds and acceptance, at `f99a18e60e22dbe23e698d4521e126aac85bd4b7`, matching the
local checkout before continuation. [Frozen metadata](L4-final-native-ci-evidence.json)
records the run, jobs and steps. This closes the independent native CI requirement
for that L4 implementation commit, not retained-copy/RPO/RTO, provider acceptance,
authority cutover or the entire L4 outcome audit.

Proceed with independent L5 resilience work under the user's continuation request.
Retained external setup remains user-deferred; JSON remains authoritative and the
L4 tracker stays ongoing. New L5 changes require their own CI evidence.


## Local verification closeout before further L5 work — 2026-10-14

The user asked to finish remaining locally executable L4 work first. The
[local outcome audit](L4-local-outcome-audit.md) maps every parent L4 outcome and
handoff requirement to its implementation, evidence and remaining gate.
Parent checkboxes now reflect demonstrated local implementation instead of the
outdated Step 3 status; authority, tooling cutover, retained recovery and hosted
assurance stay open.

- [x] `npm run verify:full` exited successfully as one complete runner: lint/format,
  10 architecture tests, 592 frontend tests, actual-bank validation, packaged policy,
  Ruff, mypy (39 files), 230 backend tests, TypeScript, fresh learner/admin builds,
  41 learner and 12 JSON-editor Chromium tests. Its 173 PG skips are not database
  acceptance; real-PG evidence is recorded separately.
- [x] Prepared cutover patch still passes `git apply --check`. Original base hashes
  are preserved; `docs/testing.md` and `backend/README.md` have changed since that
  snapshot. Current hashes are captured separately for review at actual cutover.
- [x] Updated HTTP suite: **12 passed** against fresh production HTTP admin assets
  and installed API/PG17/Nginx on native ARM64. The new case proves successful
  fresh step-up preserves unsaved text, makes no automatic write and still rejects
  a stale save after another tab commits. Signed synthetic assurance is not hosted
  MFA acceptance; the new test needs changed-source native CI.
- [x] Fresh actual-bank full authoring/session/allocation recovery passed against
  current source: **348 routes each** before/after restore, exact ordered content,
  all-table/sequence/effective-role parity, safe session quarantine/epoch rotation,
  selected authored export validation/audit, and lost-allocation recovery with zero
  ID reuse. Temporary archives/journals were cleaned and do not prove retention.
- [x] [Closeout evidence](L4-local-closeout-evidence.json) freezes observed results,
  current source/target hashes and versions. Completion audit found no blocking
  local implementation issue in this scope; L4 overall is still incomplete.

No further L5 implementation was started in this closeout. JSON remains
canonical, the patch is not applied, and no routine DB or retained destination is
modified. Step 6 retained-copy acceptance and separately approved Step 7 remain
open; the L4 tracker stays ongoing.


## Step 7 local authority cutover — 2026-10-14

The user explicitly authorized Step 7 and stated that off-device backup is not a
priority, allowing a local backup instead. This supersedes the external-copy
prerequisite for the local cutover only. No off-device attestation or hosted
identity acceptance is claimed. [Cutover evidence](L4-step7-cutover-evidence.json),
[authority identifiers](../../../ops/content-authority.json) and the
[local authoring runbook](../../local-authoring.md) record the concrete target.

- [x] Initialized a new dedicated PG17 persistent target from the captured reviewed
  pair, with protected role-separated credentials, schema `0006_allocation_fence`,
  exact normalized reconstruction and unchanged source hashes. No experimental
  fixture draft was promoted or existing DB/volume replaced.
- [x] Admitted a protected allocation range backed by two agreeing, fsynced local
  journal chains. New explicit `--local-copy-only` reports user-deferred off-device
  retention and refuses other targets/production CLI configuration/mixed policies.
- [x] Rehearsed DB-only publication with a temporary nonmedical subject-label
  change, then restored the exact original pair. The original import and later
  rehearsal release remain retained; final publication sequence is **3**, draft
  revision **5**. Medical text/choices/numbers/provenance/IDs were unchanged.
  An incorrect result-field reference stopped the first script after commit;
  guarded continuation restored the original metadata without resetting/reimporting.
- [x] Retained full local PG17 dumps and deterministic exports outside the volume.
  Fresh restoration from a retained dump passed exact all-table/sequence/effective
  ACL and paired-artifact parity, session quarantine, copied-journal recovery and
  burning every previously admitted range. Final same-machine measurement: **29.69s**, including compatible restored reader
  startup and previous-release activation/return without deletion;
  not hardware-loss RTO or off-device acceptance. Verification DB was removed;
  the original authority was checked unchanged.
- [x] Applied and reconciled authority documentation; production and ordinary
  development authoring select HTTP. JSON editing requires explicit development
  fixture flags and is omitted from production even if those flags are set.
  Authority CLI imports require reviewed recovery intent. Archive validation is
  labeled; selected current exports have explicit validation/audit commands.
- [x] Explicit loopback development identity launcher and actual-authority browser
  acceptance passed: denial before sign-in, signed code/PKCE confirmation, exact
  draft, fresh session, direct readiness and logout. No real MFA is simulated as
  hosted acceptance; production still refuses this identity adapter.
- [x] Vite proxy now preserves the frontend Host, satisfying the existing strict
  admin host check. API uses loopback **8001** because an existing process occupies
  8000; that process was not stopped. UI runs at **127.0.0.1:5173**.
- [x] Full verification runner exited 0; additional allocation units **17 passed**,
  real-PG allocation cases **9 passed**, Ruff/mypy and fresh build passed. Native
  acceptance of these changed sources remains pending after commit.

Step 7 is complete at its approved local gate. L4 stays ongoing for final native
CI/outcome closure and explicitly carried hosted/manual/off-device obligations.
The original cutover patch/base snapshots and earlier JSON-authoritative progress
logs are historical and remain preserved. Do not overwrite DB-only edits with
these frozen repository exports. No cloud deployment or further L5 work occurred.


## Cutover implementation CI verified — 2026-10-14

Independently verified [run 38585464434](https://github.com/mfranco1/meducation/actions/runs/38585464434) against current implementation HEAD
`bc90d751c48fc42b97a3aca4717a2b94a0f47e2c`. All five jobs completed successfully:
frontend, backend, browser-smoke, Containers (amd64), and Containers (arm64).
[Cutover CI evidence](L4-cutover-native-ci-evidence.json) freezes job and step results;
earlier CI evidence remains historical. This closes the changed-source native CI
gap after Step 7 and covers the committed L5 Step 1 changes as well.
No application or authoritative content changed during this evidence update.
Hosted identity/MFA/TLS/routing, manual browser/device/accessibility acceptance,
and user-deferred off-device recovery remain explicit external obligations.
Final tracker archival/handoff is still to be completed.

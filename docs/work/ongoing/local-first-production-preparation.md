# Local-first production preparation

Created: 2026-10-12. Status: L0 design/evidence complete; L1 complete with user-deferred Firefox acceptance; L2 Steps 1–3 implemented and verified on native ARM64, remaining L2 acceptance pending; L3–L6 not started. This is the current next-phase tracker and supersedes the stage ordering and hosting recommendation in the [earlier planning snapshot](../done/production-deployment-roadmap.md). Move this tracker to done only when implementation and relevant checks are complete. No cloud services are provisioned by this plan.

## Confirmed scope

- Free guest study, no learner signup. Learner progress and analytics stay in localStorage.
- Internet-required study; no offline sync, cloud learner data, payments, or rankings in this phase.
- Safe local progress download/upload for quizzes and flashcards.
- Existing React/Vite/MUI and Python 3.14 FastAPI implementation retained.
- Local PostgreSQL for content and an adaptation of the existing admin panel for one editor.
- Private authenticated admin, paired-bank drafts, explicit validated publication, immutable releases and audit trail.
- Philippine audience, initially up to a few hundred total users. Concurrency must be measured separately.
- Prefer inexpensive managed hosting later; local development must not depend on a hosted account or provider-specific database features.

## Execution sequence

After the short L0 design prerequisite, stages L1–L6 are development work that can be completed before deploying. Each stage is a coherent implementation slice with its own checks. Complete the relevant checks before marking a stage done; record results below. Respect agreed stage gates as described in [work tracking](../README.md).

### L0 — Resolve local contracts (short prerequisite, no provisioning)

Detailed sequence: [L0 local contracts plan](../done/L0-local-contracts-plan.md). L0-A gates L1; database/auth decisions gate their respective later stages.

- [x] Record the backup restore protocol and browser support target, including how all local progress readers/writers participate in restore/recovery. Specify export timer normalization, quota/oversize behavior, and legacy-tab limitations before UI work.
- [x] Choose a PostgreSQL major supported by the intended managed host and pin the same major in local/CI images and compatible dump/restore tooling. Check Python 3.14 driver/image availability before committing packaging.
- [x] Define the single-editor authentication contract before L4: authorization-code flow with PKCE or a backend session, issuer/audience/algorithm/key validation, stable subject allowlist, required MFA evidence, expiry/logout and credential recovery. Select a provider/adapter capable of that contract by L4; account provisioning can wait. Do not invent provider-independent MFA claims and assume a hosted provider will emit them. [Selected contract](../../decisions/0004-single-editor-authentication.md): backend OIDC/PKCE with opaque server sessions; final provider acceptance remains pending before L4.

Gate: these implementation-affecting decisions are documented. No hosted account or deployment is required.

### L1 — Progress download/upload (first feature slice)

Detailed sequence: [L1 progress backup plan](../done/L1-progress-backup-plan.md), including module ownership, schema, recovery protocol, UI and test matrix.

- [x] Define a versioned backup envelope for quiz and flashcard progress, app identity, export timestamp, and required content-reference metadata. Include retained history, durable scores/counts/activity, completed IDs, checkpoints, and flashcard daily aggregates. Do not include arbitrary browser storage, admin tokens, or content banks.
- [x] Add export/import logic behind persistence abstractions, reusing existing codecs as a baseline and adding strict import-specific validation. The quiz codec currently accepts extra keys, loosely validated date strings, and inconsistent score/map data; it is not already a safe file-import boundary. Preserve current progress keys/schema contracts where possible.
- [x] Bound file bytes before reading/parsing and bound supported strings, arrays, maps, numbers and timestamps. Validate allowlisted fields and versions; reject dangerous property names recursively; reconstruct fresh typed data rather than merging arbitrary parsed objects. Imported IDs must not become unsafe object-property assignments.
- [x] Implement replace/restore only initially. Validate both progress systems before writes; ignore imported storage revisions and issue fresh local revisions. Preserve unknown/removed-content history; changed-content active sessions/checkpoints obey current signature/restart rules.
- [x] Normalize exported active timers: checkpoint/pause the current editable session first, serialize a paused snapshot with timerStartedAt cleared, and never count time between export and later restore. For inactive saved records, preserve accumulated elapsedMs without adding unobserved wall-clock time. Reject invalid timestamps and impossible score totals, duplicate completed IDs, response-key/ID mismatches and contradictory active/completed records. Do not recompute historical scores against today's answer key.
- [x] Define consistent export capture across both repositories; fail visibly on unreadable/corrupt storage rather than exporting an empty fallback. A separate raw recovery download may preserve malformed bytes but must not be presented as a valid importable backup. Preserve daily-stat calendar dates without timezone rebucketing on transfer.
- [x] Set compatible export/import limits from real stored sizes. Durable completed IDs are unbounded today, so a valid current state can eventually exceed an arbitrary import cap. Never silently truncate it or produce a supposedly supported backup that cannot be restored; show an actionable size error and defer retention redesign explicitly.
- [x] Provide a settings entry with download, selected-file validation, restore summary, overwrite confirmation, and an existing-data backup option. Restore must coordinate with active study and refresh subscriptions/session state.
- [x] Design recoverable multi-key restore using staging/journaling or an equivalent proven strategy. Exercise quota failure, interrupted writes, recovery on startup, and stale-tab editing. localStorage has no atomic cross-key transaction. A journal alone is insufficient: normal quiz and flashcard readers/writers must recognize pending restore/recovery, avoid mixed snapshots and honor the coordination protocol. Recheck revisions after preview, reserve the journal before mutation, and leave original data intact if staging exceeds quota. Coordinate simultaneous operations in supported current-version tabs; document that already-open legacy builds do not cooperate and require closing/reloading them before restore. Do not claim protection from arbitrary simultaneous writers without implementing and testing it. Ordinary synchronous repositories may need narrowly scoped coordination changes; explicitly assess that cost in L0.
- [x] Test round-trip of both progress systems, durable statistics beyond pruned history, invalid/oversized/prototype-key files, unsupported versions, failed writes and restart recovery. Browser-test download/upload and preservation of study behavior.

Implementation requirements above are complete in code and local evidence. L1 is complete under the user-approved Firefox testing deferral recorded on 2026-10-13; its completed tracker records all passing checks. Firefox remains an open acceptance follow-up, not a pass. Mobile/assistive-technology checks are separate public-launch gates.

Gate: local backup/restore works without a backend and hostile/failed restores do not silently lose progress or inflate totals. Imported personal statistics are untrusted; a checksum is not proof of authenticity. No imported string is executed or rendered as HTML, and backup data never leaves the browser.

### L2 — Reproducible containers and local services

Detailed sequence: [L2 containers and local services plan](L2-containers-local-services-plan.md), including seven gated steps, file ownership, JSON-only/default and optional-DB modes, native-platform evidence, real-proxy browser checks and the L3 handoff. Steps 1–3 are implemented; the API and learner containers passed native ARM64 runtime/proxy checks, including 17 container learner browser cases. Orchestration, DB tooling, CI, container backup acceptance and native AMD64 remain pending in Steps 4–7. Observed npm dependency advisories remain maintenance/release follow-ups.

- [ ] Follow [selected local toolchain](../../decisions/0003-local-postgres-toolchain.md) and verify native ARM64/AMD64 builds and daemon availability. Add a production FastAPI container using pinned Python 3.14, locked dependencies, a non-root runtime, explicit settings, and existing liveness/readiness routes. Include canonical banks for initial JSON mode at known paths.
- [ ] Pin Postgres/local tools to the L0 version; use explicit readiness/wait behavior rather than assuming container start means DB readiness. Document amd64/arm64 image support for local Macs and hosted Linux. Image-version pinning needs an intentional security-update procedure.
- [x] Add a multi-stage frontend build/static-serving container for production-like local tests with explicit /api routing. Keep fast host-based Vite development available; do not require containerized Vite for routine UI work.
- [ ] Add Docker Compose for API, frontend and pinned local Postgres with a named data volume. Postgres is optional for JSON mode and becomes required in DB mode; retain a simple JSON-only development path.
- [ ] Bind development services to loopback. Keep database ports optional/local-only. Provide example configuration with development-only credentials, never real secrets.
- [ ] Add a narrow .dockerignore excluding private PDFs/extraction data, .env secrets, .git, caches, node_modules and build/test output while retaining required application/content/lock files.
- [ ] Document build/start/stop, health, logs, reset, and backup/restore commands. Destructive volume deletion is a separate explicit command, not part of routine reset/start.
- [ ] Smoke-test learner workflows through the container's real reverse proxy, admin omission from learner artifacts, health, restart persistence, and reproducible image builds. Add relevant container checks to CI.

Gate: a fresh checkout can build and run the local stack from documented commands; no cloud credentials or hosting selection required. Check Docker availability during implementation and report any runtime validation limitation honestly.

### L3 — Local Postgres schema, migration and parity

- [ ] Write an architecture decision for content schema/versioning and the staged authority transition. Keep domain and frontend API contracts independent of the DB provider.
- [ ] Start with the [selected dependency baseline](../../decisions/0003-local-postgres-toolchain.md) (Psycopg binary 3.3.6, SQLAlchemy 2.1.4, Alembic 1.20.0); verify clean resolution/install. Add SQLAlchemy/Alembic and a supported Python-3.14 Postgres driver with updated locks. Run migrations as a controlled explicit job, not automatically in every API worker.
- [ ] Model immutable paired-bank releases, active release reference, subjects/quizzes/questions/decks/cards, explicit ordinal positions, one draft and audit events. Preserve stable entity IDs across versions; use relational constraints and selective JSONB for nested choices/sparse metadata.
- [ ] Allocate new content IDs with a durable server-side registry/counter or equivalent never-reuse policy across drafts, deleted records and all releases. Seed it from imported IDs; retain allocations across rollback. Existing max-current-ID-plus-one helpers must not remain authoritative for persistent authoring. Preview/apply retries must keep the same reserved IDs.
- [ ] Keep a publication sequence distinct from content digests: rollback may reactivate an identical old digest but must still trigger current-publication cache refresh. Define quiz/flashcard digest mapping to a paired release. DB transactions/foreign keys must prevent cross-release references; paired reads/publication must be consistent.
- [ ] Implement a transactional, idempotent JSON importer with paired validation, exact optional-field semantics, provenance and canonical order. Failed imports must leave the active release intact. Never modify authored JSON as a side effect.
- [ ] Implement both backend repository adapters and a configuration switch between JSON and Postgres. Refactor the current path-based repository factory, startup-cached subjects and lifecycle disposal as needed; this is more than swapping a constructor. Reads within an API response use one consistent release; cache subject/catalog data by release.
- [ ] Verify reconstructed JSON and every API contract against the canonical source for IDs, exact text/formatting, choice order, source/verified answers, metadata, relationships, counts and quiz/flashcard revision hashes. Use small fixtures in normal tests and an explicit actual-bank parity command.
- [ ] Add real-Postgres integration tests and local CI service; test constraints, repeat imports, rollback, migrations and connection failures. Keep SQLite substitution out of Postgres-specific verification.

Gate: local Postgres serves the existing learner without content drift or gratuitous invalidation of unchanged-content local attempts. JSON remains authoritative until L4's explicit authoring cutover; JSON read rollback is valid only before DB-only authoring.

### L4 — Local database authoring and admin access boundary

- [ ] Adapt AdminQuestionBankGateway and existing editor/core logic to HTTP-backed paired-bank drafts. Resolve existing synchronous flashcard snapshot and undo/reset semantics explicitly.
- [ ] Save drafts directly to Postgres; revalidate on save and publish. Publish atomically creates/activates a complete immutable release. Retain source answers, verified answers, change reasons, editor identity and append-only audit history.
- [ ] Reject stale revisions from multiple tabs, including preview/save/publish races. Undo/reset affects drafts only; it must not erase published releases or audit history. Support deterministic export and activation of a previous release.
- [ ] Invalidate release-scoped API caches after publication without restarting workers. Preserve current active-attempt changed-content behavior and the current post-submit review flow. Do not add a history-review feature implicitly: completed attempts contain responses/scores and an optional revision, not question snapshots, and the UI does not support arbitrary historical review. Preserve completed results without re-scoring them; retain old releases for rollback/future use. If a content version is unavailable, report that explicitly rather than interpreting old answers against new content. Historical review UI/API expansion is deferred.
- [ ] Follow the [single-editor authentication contract](../../decisions/0004-single-editor-authentication.md), resolve the provider assurance/freshness acceptance gate, and build a provider-independent backend admin authorization boundary: verify identity, privileges and required MFA assurance before all admin operations. Use the identity contract/provider adapter selected by L4; test token-validation failures locally with test-issued tokens, and exercise login/logout/session behavior with a local standards-based identity service when practical. Fixtures cannot certify real provider MFA/login behavior; that remains a hosted release gate.
- [ ] Specify browser-session protection: CSRF defense and origin checks for cookie-based writes, secure/HttpOnly/SameSite cookie settings, or a deliberate bearer-token storage/refresh strategy; CORS alone is not authorization or CSRF protection. Keep learner read caching separate from private admin no-store responses, and do not cache auth headers/tokens in shared caches. Test direct API calls as well as hidden/disabled UI actions.
- [ ] Any local-only identity substitute must be loopback/development-only and impossible to enable silently in production. Production configuration must refuse a dev identity/bypass. Learner routes stay unauthenticated and published-only. Hiding admin.html is not authorization.
- [ ] Add authentication-failure/expired-token/non-editor/MFA tests alongside paired draft, stale revision, publish, export, undo and rollback tests. Reuse cross-runtime validation fixtures; server validation must enforce the same content policy as authoring validation.
- [ ] At the explicit local DB-authoring cutover, update AGENTS.md, architecture, schema and content-management docs: Postgres becomes authoritative; JSON becomes a deterministic export/archive/local fallback. Before that cutover, use disposable imported copies/fixtures for authoring experiments; do not rely on experimental DB drafts as the only copy of real edits. Never operate two independently writable canonical sources.
- [ ] Migrate tooling at the authority cutover too: validate a selected DB draft/release and deterministic export, update admin bootstrap so it no longer loads stale bundled JSON, retain fixture-based CI without production DB access, and label export snapshots with a release manifest/checksum outside the existing schema if needed. Document how a current export is obtained and restored; validating the repository's old JSON alone no longer validates authored content. Inventory private PDFs/media separately—DB backups do not include those files or external image URLs.
- [ ] Define content backup operations before cutover: backup after meaningful authoring sessions/publishing, keep an off-volume copy and retention policy, and measure restoration against provisional content RPO <=24h/RTO <=4h. Published-release exports cannot recover unpublished drafts or audit history; full DB backups are required for those.
- [ ] Before making DB-only authoring authoritative, test pg_dump/restore and maintain a recoverable off-volume copy/export. A Docker volume is not a backup. A stale JSON file cannot roll back later DB-only edits.

Gate: the current admin can edit/save/publish locally against Postgres with authorization, validation, audit and rollback; canonical authority and backup responsibilities are explicit. Hosted identity provisioning remains deferred, but the security boundary is implemented and exercised locally.

### L5 — Resilience, scale-to-zero readiness and local operations

- [ ] Start with one API process/instance for the initial small deployment, while retaining transactional concurrency tests. Define a concrete current-release freshness target (initially <=30 seconds for new content launches). Never mix versions during an active quiz. Requests discovering a changed catalog must use the existing revision-conflict/reload behavior; cached active sessions must not switch underneath the learner. Test future multi-worker behavior before enabling multiple workers.
- [ ] Configure small bounded database pools, timeouts, connection invalidation/reconnect, and safe idempotent retries. Do not retry uncertain non-idempotent admin writes blindly; use transactional operation IDs/revision preconditions.
- [ ] Separate runtime and migration/backup connection configuration; validate pooled-endpoint compatibility if used on Neon, and use direct connections for operations needing session semantics. Aggregate pool limits across processes; require DB TLS with verified settings outside local development.
- [ ] Test Postgres restart/outage and stale pooled connections locally. These approximate connection-loss behavior; they do not prove Neon wake latency. Actual suspend/wake tests belong to deployment verification.
- [ ] Ensure liveness does not query Postgres. Define lightweight readiness as process/configuration/schema initialization readiness, not a continuous guarantee of DB reachability. Expose a separate authenticated deep-dependency diagnostic for explicit checks. Route/telemetry errors must report DB outages promptly. Do not configure host keepalive probes to run SQL continually just to prove dependency reachability; if deployment requires continuous DB probes, accept the resulting loss of scale-to-zero savings.
- [ ] Avoid background release polling and recurring DB pings that defeat idle suspension. Use publication-triggered local invalidation plus documented request-driven bounded-freshness checks for other workers; measure the query/consistency tradeoff. Preserve one-release consistency.
- [ ] Add configuration validation, safe structured logs, token/secret redaction, request/body limits and intentional public error messages. Document production TLS/CORS settings and separate migration/editor/read privileges.
- [ ] Provide and rehearse local DB backup/restore, previous-release rollback and compatible app/schema rollback. Restore to a separate DB; protect authored content during tests.
- [ ] Add a provisional fixture-based load test for 20 concurrent learner content launches and characterize latency/errors/pool saturation. This is a test target, not a production capacity promise.

Gate: local restart/failure/recovery and concurrency tests pass; no designed-in keepalive defeats Neon suspension; operator recovery is documented.

### L6 — Local release candidate

- [ ] Run npm run verify:full and required learner/admin build checks, plus added Postgres integration, backup-restore, authorization and container smoke tests. Ensure CI can repeat relevant local gates.
- [ ] Validate actual canonical/exported content and exact migration parity with protected sources. Verify rich text and math rendering, mobile admin/learner usability, progress restore, retry/revision failures and authoring regressions.
- [ ] Prepare provider-neutral deployment inputs: images, migration/import/export jobs, example environment variables, secret inventory, build separation, routing requirements and smoke-test/runbook commands. No cloud credentials or hosted resources needed.
- [ ] Record outstanding deployment-only checks and confirm hosting/database and the already-designed admin identity adapter against the tested requirements. Keep a stable production domain on the deployment checklist; backups enable manual origin transfer.

Gate: release candidate is locally verified; cloud deployment is a subsequent stage, not a dependency of L1–L6.

## Review corrections and scope control

Reviewed against current persistence, quiz timing, ID allocation, backend lifecycle, authoring and test code on 2026-10-12. The sequence is sound after these corrections:

1. Upload validation must be stronger than the current quiz decoder; timer normalization, export consistency, size/retention limits and recoverable cross-key writes are explicit L0/L1 work.
2. Persistent authoring must never reuse deleted IDs; publication identity and content digests serve different purposes.
3. Historical answer-review UI is not part of current behavior and is deferred. Preserve results/revisions without promising a new history feature.
4. Auth/session/MFA semantics must be selected before the admin integration; local mock tokens do not establish hosted security behavior.
5. Canonical-source cutover includes tooling, admin bootstrap, export manifests and backup operations—not only documentation edits.
6. Readiness/freshness and scale-to-zero have a tradeoff. Start with one API instance and a bounded freshness policy, then measure rather than overbuilding distributed cache infrastructure.
7. Deployment verification remains necessary even after L6: no local test proves hosted TLS/routing, managed identity, cold starts or actual recovery retention.

Small release defaults: one editor, one paired draft, explicit publish, one API process, ordinary Postgres, replace-only local restores. Do not add multi-editor approval workflows, an identity product, historical review UI, Redis, or a custom distributed lock service to satisfy this plan.

## Deployment decision — Neon is the provisional first choice

With learner data kept local, database traffic is public content reads plus one editor's intermittent writes. Neon scale-to-zero is a good fit to evaluate and may be cheaper than the previously recommended always-on Supabase Pro baseline. Use ordinary Postgres locally so choosing Neon, Supabase or Render does not change the content schema/domain contracts.

Neon's official documentation describes suspension after five idle minutes and automatic reactivation on access. Storage/history can still be billed while compute sleeps. Frequent real reads, scheduled queries, idle-in-transaction sessions or other activity may prevent suspension; merely having idle open connections is not sufficient to conclude compute stays awake. Pool reconnection and cold requests must be tested. Published cache freshness must remain correct rather than hiding live content updates solely to save compute.

Current official plans documentation describes usage-based paid plans with no monthly minimum. Advertised Launch compute is $0.106/CU-hour. Illustration: 0.25 CU × 60 active hours/month is about $1.59 compute; 0.25 CU × 730 hours is about $19.35 compute. These are conditional arithmetic examples, not forecasts; storage, history, branches, egress, authentication and the separately hosted API add costs. Every query can extend the idle window; hundreds of users do not automatically mean hundreds of compute hours or a low invoice. Verify the current quote before provisioning.

Do not choose a production plan solely because it is free or scales to zero. Confirm storage/compute quotas, configured recovery retention, region availability near the Philippines, and monitoring/budget controls. Free restore-history limits may not meet the recovery target. Neon does not turn off the FastAPI host; that service has its own invoice.

Admin identity is a distinct decision. Evaluate Neon Auth's current ability to meet invite-only administration, backend token verification and required MFA, or use another managed OIDC provider. Do not assume a database choice supplies those guarantees. Supabase remains a valid alternative if integrated identity/recovery convenience outweighs expected idle compute savings.

## Deferred cloud stage (after local release candidate)

Provision managed Postgres and the chosen admin identity; deploy static learner/admin builds and paid FastAPI (Render remains a candidate). Select a nearby compatible region, enforce TLS/network/roles, install secrets and migrate/import/export the exact locally verified content. Test actual Neon suspend/wake if selected, hosted identity/MFA, Philippine latency, email if used, backups/restore, uptime/budget alerts, real /api routing and deployed smoke workflows. Then launch free guest access. Do not provision or publish as a side effect of local preparation.

## Sources checked 2026-10-12

- [Neon scale-to-zero documentation source](https://github.com/neondatabase/website/blob/main/content/docs/introduction/scale-to-zero.md)
- [Neon current plans documentation source](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md)
- [Neon history-window documentation source](https://github.com/neondatabase/website/blob/main/content/docs/postgres/backup-restore/history-window.md)
- [Neon long-running application pool behavior](https://neon.com/blog/using-neons-auto-suspend-with-long-running-applications)
- [Neon published compute rate/examples](https://neon.com/blog/major-compute-price-reduction-on-neon)
- [Neon connection guidance](https://github.com/neondatabase/website/blob/main/content/docs/get-start/connect-neon.md)
- [PostgreSQL dump-version compatibility](https://www.postgresql.org/docs/17/app-pgdump.html)
- [Neon regional availability API](https://api-docs.neon.tech/reference/getactiveregions)
- [Supabase pricing](https://supabase.com/pricing)
- [Render pricing](https://render.com/pricing)

## Progress and verification log

- [x] Reordered the plan around local development and separated provisioning/deployment.
- [x] Retained guest/local-progress scope and changed database preference to provisional Neon.
- [x] Reviewed plan against current code and corrected sequencing/safety/scope gaps.
- [x] Review verification: build/typecheck and canvas TSX syntax passed; existing bundle-size advisory remains. Runtime stages are still unimplemented.
- [x] L0 decisions recorded and handoff audited; runtime stage gates remain pending.
- [x] L0 Step 1 current-contract evidence captured and audited; 49 baseline tests/build passed. Remaining L0 steps await user continuation one step at a time.
- [x] L0 Step 2 backup-format/user-flow contract selected and audited; field/link/diff checks and build passed. Step 3 awaits user continuation.
- [x] L0 Step 3 coordination design/prototype selected and audited; 21 Chromium/WebKit probes and lint/format/build passed. Firefox and actual BFCache validation remain release obligations. Step 4 awaits user continuation.
- [x] L0 Step 4 journal/recovery contract selected and audited; fault model and lint/format/build passed. Step 5 awaits user continuation.
- [x] L0 Step 5 strict validation/limits/timer-normalization selected and audited; synthetic sizing/invariants and lint/format/build passed. Step 6 awaits user continuation.
- [x] L1 implemented, audited and verified in Chromium/WebKit; the user explicitly deferred Firefox testing on 2026-10-13. Production fault/quota tests and final verification are recorded in its completed tracker. Firefox, mobile/assistive-technology and unobserved persisted-return acceptance remain open in the browser checklist.
- [ ] L2 implemented and verified.
- [ ] L3 implemented and verified.
- [ ] L4 implemented and verified.
- [ ] L5 implemented and verified.
- [ ] L6 implemented and verified.

L1 runtime work is complete in its own tracker with passing verification and the explicit Firefox deferral. Outstanding browser and public-launch acceptance stays in the ongoing browser checklist. No content edits, schema migrations, Docker setup or cloud provisioning occurred in that stage. Historical checks in the earlier snapshot are not implementation evidence for later stages.

- [x] L0 Step 6 capability/lifecycle/accessibility acceptance selected and audited; L0-A design gate met. Application multi-browser, quota, BFCache and manual mobile/assistive-technology verification remain L1/release gates. Step 7 awaits user continuation.

- [x] L0 Step 7 database/toolchain contract selected and audited; L0-B design gate met. PG17/Python3.14 image digests and ARM64/AMD64 metadata verified; host pg_dump14 mismatch and unreachable Docker daemon documented. L2/L3 runtime verification remains pending. Step 8 awaits user continuation.

- [x] L0 Step 8 auth/session contract and provider capability status recorded and audited. Neon managed MFA is coming soon; ZITADEL Cloud is provisional, with final adapter/fresh-MFA acceptance pending before L4. Local and hosted acceptance cases are explicit; no accounts/secrets/configuration created. Step 9 awaits user continuation.


## L0 final handoff — 2026-10-13

[Completed L0 tracker](../done/L0-local-contracts-plan.md) records all nine design/evidence steps and the independent gates. L0-A implementation is complete in L1; Firefox acceptance is user-deferred and public-launch checks remain pending. L0-B is ready for L2/L3 implementation with container/dependency/runtime tests still pending. L0-C contract/capability status is recorded, but final provider/fresh-MFA acceptance remains required before production integration in L4. [Browser acceptance](L0-browser-acceptance.md) stays ongoing until its application/manual gates pass. L1 runtime implementation, audit and Chromium/WebKit acceptance are complete; the user-approved Firefox deferral is recorded separately. No hosted provisioning has occurred.

Completed L1 work and evidence are tracked in [the progress backup plan](../done/L1-progress-backup-plan.md). Firefox acceptance was explicitly deferred by the user; [browser acceptance](L0-browser-acceptance.md) owns outstanding checks. L2 is underway: its [implementation tracker](L2-containers-local-services-plan.md) records Steps 1–3 inputs/API/learner evidence and remaining acceptance. Step 4 Compose/optional Postgres awaits continuation at the staged-work gate.

- [x] L0 Step 9 final handoff/audit complete; completed tracker/evidence archived. Build/typecheck, architecture graph, 105 link/anchor checks, immutable evidence/canonical hashes and diff checks passed; existing chunk-size advisory remains. L1 runtime implementation is underway; see its current tracker and browser checklist.

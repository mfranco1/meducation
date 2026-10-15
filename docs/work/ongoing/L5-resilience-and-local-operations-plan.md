# L5 — Resilience and local operations

Started: 2026-10-14. Plan reviewed and revised: 2026-10-14 for implementation
on 2026-10-15 (Asia/Manila). Status: Steps 1–4 local gates complete;
Step 5 pending. The plan review alone
did not establish runtime behavior or L5 acceptance.

The designated local PostgreSQL database is now the only writable paired-bank
authority. JSON files are exports/archives or explicit read-only fallbacks and may
be stale. Follow [local authoring](../../local-authoring.md) and the current
[recovery policy](../../L4-authoritative-recovery.md#current-local-only-policy-override--2026-10-14).
Off-device retention remains user-deferred; the local cutover is no longer pending.
The existing [post-cutover CI evidence](L4-cutover-native-ci-evidence.json) records
native AMD64/ARM64 success at `bc90d75`; it does not certify future L5 changes.
The older Step 1 evidence below remains a historical record.

Parent: [production preparation](local-first-production-preparation.md#l5--resilience-scale-to-zero-readiness-and-local-operations).
Follow [work tracking](../README.md): implement a coherent step, record results and
limitations, then stop at its gate until continuation is authorized. The prior
request prepared the plan only; subsequent continuation on 2026-10-15 authorized
Steps 2–4 in sequence. Step 5 awaits continuation.

## Scope and implementation baseline

- Protect the routine authority container, volume, credentials, dumps and allocation
  journals. All outage, load, publication and restore tests use uniquely labeled,
  disposable PG17 fixtures. Never restore over or stop the routine authority for a test.
- No hosting/provider provisioning, runtime AI, learner cloud persistence, new
  background workers, increased worker count, bank edits or schema redesign.
  Keep source/verified answers, stable IDs, canonical ordering and paired releases.
- `backend/src/meducation_api/repositories/postgres.py` already selects the active
  publication on **every content request**, pins both adapters to that release,
  and bounds immutable catalog caching. Keep this stronger-than-30-second server
  policy initially. No extra publication invalidation bus or pointer TTL is needed.
- `src/content/api/runtimeQuestionBank.ts` and `runtimeFlashcardBank.ts` return
  ready catalogs/bodies indefinitely. This is the remaining freshness gap.
  `useQuizLaunch` and `useFlashcardSession` are the launch paths; quiz sessions
  also read repository arrays during answering/scoring/review. Therefore a global
  cache reset during study is unsafe even if an attempt has a content signature.
- Content/API code owns transport, revision validation and cache lifecycle;
  feature sessions own launch/cancellation and study state; `src/app` wires them.
  No sibling-feature imports or React in content/domain. Preserve existing checked
  boundaries in `scripts/architecture/boundaries.mjs` and lazy loading.
- Current top-level authority notices and AGENTS.md supersede pre-cutover passages
  still present in architecture/product/testing docs. Update affected current
  passages when implementing their contract; do not copy old JSON-authority or
  “read-only backend” descriptions into new code/runbooks. Historical evidence
  and completed trackers remain unchanged.

## Step 1 — Bounded connections and local restart recovery

- [x] Keep one initial API process explicit in the container command. Document
  aggregate pools: at most two reader, two session and two editor connections per
  enabled API process, zero overflow, five-second pool/connection admission. Jobs
  use separate unpooled owner/operator connections; hosted endpoint/TLS acceptance
  remains separate.
- [x] Repair stale checked-in sockets on request-driven checkout, with no idle
  polling, background pings or transaction replay. Bound reader initialization and
  request SQL with 10-second statements and 3-second lock waits. Explain that SQL
  limits are not an absolute network-blackhole/request deadline.
- [x] Test stale reader/session/editor sockets, safe SQL lock timeout cleanup,
  actual Postgres stop/start, health routes without DB checkout during outage,
  no stale-file fallback and successful reader recovery with preserved content.
  Use only uniquely labeled disposable fixtures and owned storage.
- [x] Integrate the restartable fixture stage into native CI and record local
  checks separately from later changed-source GitHub acceptance. Existing tests
  retain mid-transaction failure/replay semantics; no uncertain write retry is added.

Gate: focused real PG17 recovery tests, ordinary backend, style/types and relevant
build checks pass; fresh installed image verifies one-process startup. No hosted
suspend/wake or complete L5 capacity claim.

## Step 2 — Request-driven release freshness

### Contract and smallest implementation

- [x] Define a launch as starting/retaking, resuming, or browsing a quiz, or
  opening/resuming a flashcard deck, including a previously cached body in a tab
  that has remained open. Revalidate the applicable current subject catalog on
  **every explicit launch** before allowing the cached-body fast path. Coalesce
  concurrent checks within a launch generation. Do not add a timer, focus polling
  or background SQL; explicit local fallback mode remains network-free.
- [x] Use the existing catalog endpoints and content revisions first. If the
  revision is unchanged, retain validated catalog/body caches. If changed, reject
  the launch through the existing revision-conflict/reload recovery UI; do not
  silently combine a new body with the clicked old quiz/deck or overwrite progress.
  Deleted/moved items, changed membership and shared subjects must use the same
  recovery path. A reload must obtain a coherent new catalog before retry.
- [x] Interpret <=30 seconds as maximum age of successful current-content
  validation at launch admission, not a network-response SLA. Record a conservative
  monotonic check-start time; an excessively delayed check/body/retry cannot admit
  a launch using expired evidence. Bound rechecks and surface recovery on failure
  rather than retrying indefinitely. A publication after the successful check may
  be observed by the next launch; a body request crossing publication must still
  enforce revision preconditions. With the service reachable, a launch beginning
  >=30 seconds after publication cannot silently use the prior changed content.
- [x] A failed revalidation blocks the new launch with existing retry/reload UX;
  cached content is not an outage fallback. Existing on-screen study, timers,
  answers, checkpoints and transient post-submit review stay unchanged. Do not
  revalidate from answer/render/checkpoint paths or refresh their backing arrays.
  Saved resume signatures and explicit restart confirmations retain their current
  semantics; completed scores are never recomputed. No historical-review feature.
- [x] Preserve generation/cancellation guards so late catalog/body responses,
  back navigation and rapid successive launches cannot populate a newer cache or
  start the wrong activity. Pending restart confirmations must not bypass launch
  freshness if the user leaves them open past the budget.
- [x] Keep one-release-per-response backend pinning and publication sequence
  distinct from hashes. Test A → B → A activation and publication with only the
  other bank changed: identical content need not invalidate valid attempts, while
  server publication selection must advance. Do not require unrelated quiz and
  flashcard HTTP requests to share a transaction or add history endpoints.

### Acceptance

- [x] Deterministic clock/transport tests cover same/changed revision, just-before
  and at/after 30 seconds, slow responses, retries, failed checks, cache hits,
  cancellation, concurrent callers, stale replies and delayed restart confirmation
  for both banks. Assert request counts and no work while idle.
- [x] Real PG17 tests retain publication during pinned reads, next-request
  visibility, A → B → A, and two independent source instances observing publication
  without restart. This is future-worker consistency coverage, not permission to
  increase production workers.
- [x] Browser fixture: cache quiz and deck in an open learner tab, publish from
  the isolated editor, then launch/resume/browse without manually refreshing first.
  Observe conflict/reload and current content; verify an active quiz/deck and quiz
  results review remain unchanged through publication. Cover an outage at launch,
  unchanged-content resume and changed-content explicit restart with saved bytes.
- [x] Measure incremental HTTP/SQL requests for cold and cached launches, including
  checkout pre-ping, with idle request/query counts. Retain one current-pointer
  read per server request unless measured evidence justifies another design.

Gate: runtime repository/session tests, isolated PG/browser freshness scenarios,
architecture checks and both relevant build modes pass. Update product/API/runbook
freshness wording with the measured policy. No freshness claim during an outage.

## Step 3 — Diagnostics, configuration and failure visibility

- [x] Add an explicit operator-triggered read-only diagnostic under the existing
  protected `/api/admin/` boundary, using existing session/editor authorization,
  origin/CSRF policy where applicable and `no-store`. Do not add an unauthenticated
  exemption, a second credential scheme or a periodic health client.
- [x] Report bounded, sanitized dependency outcomes for reader connectivity,
  supported schema and active publication, and enabled session/editor connectivity
  using their existing role pools. Do not perform a test write or create another
  pool. Account for the session guard already holding a connection: avoid nested
  session checkout that can exhaust the two-slot pool under concurrent diagnostics.
- [x] Session authorization itself depends on Postgres. If that dependency is down,
  the diagnostic may fail with the existing sanitized auth-unavailable response
  before it runs. Document this limitation and the explicit local operator checks;
  never bypass auth to make an outage diagnostic succeed. Disabled admin stays closed.
- [x] Keep `/health/live` and `/health/ready` free of DB checkout after initialization.
  Document ready-during-outage versus failed startup. Diagnostic SQL/lock/connection
  limits and cleanup must be bounded; distinguish them from a hard end-to-end
  network-blackhole deadline, as in Step 1.
- [x] Add safe structured operational events with request correlation, route
  template, status, duration and stable failure category. Cover pool timeout,
  connection failure and recovery on real requests. Exclude raw URLs/query strings,
  cookies, tokens, CSRF/OIDC codes, DB credentials, request bodies, authored text,
  SQL parameters and unsanitized exception traces. Exercise proxy/access logs as
  well as application handlers; use injected secret canaries in failure tests.
- [x] Audit existing settings and limits before adding new ones: verified DB TLS
  outside local mode, explicit public CORS versus private same-origin policy,
  trusted proxy assumptions, bounded request bodies/timeouts and separate reader,
  session, editor, backup and migrator credentials. Record aggregate connection
  budget including diagnostics/jobs. No new grants without a demonstrated need.
- [x] Document direct versus transaction-pooled endpoint requirements for the
  existing SQL/session-lock/transaction behavior. Unverified provider compatibility
  stays a deployment gate; do not claim Neon/TLS/suspend acceptance from local PG.

Gate: negative auth/origin/CSRF and disabled-admin tests, redaction canaries,
concurrent diagnostic pool cleanup, DB outage/recovery, SQL-free health tests,
backend Ruff/mypy/pytest and affected installed-image/proxy checks pass. Update
backend/container runbooks; preserve uncertain-write reconciliation with no replay.

## Step 4 — Provisional concurrency/load characterization

- [x] Add a reproducible isolated fixture harness using the installed API and real
  PG17, one API worker and the existing two-reader pool. Exercise **20 simultaneous
  learner launches**, each performing catalog → membership → body with revision
  validation; include quiz and flashcard traffic, not 20 health requests.
- [x] Run separate cold-cache and warm-cache rounds with synchronized starts;
  record fixture size/digests, seed, environment/architecture, image/source hashes,
  concurrency, round count, p50/p95/max launch latency, HTTP/SQL counts, status/error
  counts, checked-out/peak connections and pool admission failures. Separate warmup
  from measured rounds. Use scoped test instrumentation, not a telemetry service.
- [x] Healthy fixed-release rounds require all 20 launches to finish correctly
  within a declared harness deadline, zero unexpected errors/timeouts and no pool
  leaks or limit violations. Start with a 60-second per-round harness deadline;
  latency percentiles are characterization, not a promised production SLO.
- [x] Separately exercise publication during load and DB outage/recovery. Classify
  expected 409/503 responses separately; never count failures as successful fast
  launches. Assert no mixed content, no hung harness and successful subsequent
  recovery. No automatic admin write replay. Tune only after measuring a failure;
  repeat the relevant baseline after each justified adjustment.

Gate: repeatable reports and all correctness/resource assertions pass. Include the
bounded smoke in native acceptance if it fits the job budget; keep longer samples
explicit operator commands. Do not relax assertions to hide saturation. A failed
20-launch target remains open even if the measurement itself completed.

## Step 5 — Operational regression and L6 handoff

- [ ] Reuse existing isolated backup/recovery tooling and separate three drills:
  retained-release activation, backup restoration into a fresh DB, and compatible
  application/schema rollback. Record source and target image/commit, schema head,
  publication sequence, paired hashes, draft/history/allocation state and timings.
- [ ] For retained activation, prove the old paired release becomes current with a
  new publication sequence while later releases, draft/history and reservations
  remain intact. Reactivate the later release to prove reversibility; verify both
  new learner launches and preserved in-flight views.
- [ ] For restore, verify exact paired content/history and effective grants, restored
  session quarantine, external auth-epoch rotation and allocation reconciliation
  against current fixture journals before any new fixture ID is issued. Do not
  run two writable restored authorities of the same lineage. Preserve the current
  local-only retention policy; disposable archives do not certify off-device RPO/RTO.
- [ ] Select a concrete prior application image and schema compatibility pair
  before rehearsing app rollback. The runtime currently requires the exact packaged
  migration head. Prefer an application rollback compatible with the retained
  schema; prove incompatible startup fails closed and document roll-forward
  recovery. Do not invent an unsafe schema downgrade or restore an older snapshot
  over newer authoring. If no prior compatible image exists, record that limitation
  explicitly and retain this gate until a supported recovery path is demonstrated.
- [ ] Update affected operational docs and map every parent L5 checkbox to evidence
  (Steps 1/4 pools and concurrency; Step 2 freshness/no polling; Step 3 config,
  diagnostics/logs; Steps 1/5 outage and recovery). Record commands, source hashes,
  results, skips, fixture ownership and cleanup; never overwrite frozen evidence.
- [ ] Run applicable regression/container checks below and obtain changed-source
  native AMD64/ARM64 CI acceptance. Record hosted suspend/wake, provider pooling/TLS,
  real identity/MFA, off-device retention and manual-device limitations for L6.
  They remain distinct from the local L5 gate. Archive only after complete L5
  implementation acceptance, not merely after this plan review.

## Verification and next implementation session

Start Step 5 by recording `git status`, the current commit and protected export
hashes. Select the concrete compatible prior application/schema pair before the
rollback drill; use only owned disposable restore/publication fixtures. Preserve
existing uncommitted tracker/evidence work. Confirm Docker is available before
fixture tests; report unavailable prerequisites as unrun gates. Never manipulate
the routine authority to reproduce an outage or restore.

Use [testing guidance](../../testing.md) for exact environment setup and suite
ownership. The implementation evidence must include:

- `npm run check:architecture`, `npm run build` (includes typecheck), and the
  appropriate HTTP admin build plus learner/admin browser regressions when loading
  or shared entry behavior changes. Run suites sharing `dist` sequentially.
- Focused Vitest repository/session cases during development, then the affected
  complete suites; backend Ruff/mypy/ordinary pytest when backend code changes.
  Build content-policy resources before backend/authoring tests as documented.
- `.venv/bin/python scripts/containers/test-postgres-content.py` and the separate
  restart gate with `--restartable --keyword l5 --output /tmp/meducation-resilience.json`.
  Focused `--keyword` runs aid development but do not replace final PG acceptance.
- Fresh installed-image API, migration/policy, proxy/browser and HTTP editor smokes
  for affected behavior; Step 4 load and Step 5 recovery reports. Final native CI
  must cover the changed inputs, not reuse `bc90d75` as evidence for new code.
- `git diff --check` and unchanged protected export hashes. If content validation
  is run, label JSON results as export/fixture validation, never proof of the live
  authoritative DB. No content changes are planned.

## Plan review — 2026-10-14

Required changes incorporated: corrected post-cutover authority/CI baseline;
identified browser cache fast paths and active-session repository coupling;
specified launch freshness/failure/cancellation gates; avoided redundant server
cache infrastructure; accounted for DB-dependent diagnostic authorization and
pool occupancy; made load success measurable; separated non-destructive rollback
and restore scenarios. Implementation starts with Step 2; Steps 2–5 remain unchecked.
Plan-review validation: `npm run check:architecture` passed (286 modules, 1,250
imports); `npm run build` passed TypeScript checking and production bundling;
`git diff --check` passed; all local Markdown link targets in this plan exist.
Vite reported its >500 kB chunk-size advisory. These checks validate the current
repository baseline, not the unimplemented L5 behavior. No backend/browser/load
or recovery acceptance was run for this documentation-only review.

## Step 1 verification — 2026-10-14

[Local evidence](L5-step1-local-evidence.json) freezes relevant implementation
inputs, unchanged canonical hashes and fixture/image reports:

- Full isolated PG17 suite: **172 passed, 1 skipped**, 229.02 seconds. The skipped
  real restart case is covered by the dedicated owned-volume stage below.
- Dedicated restart suite: **5 passed**, 10.98 seconds, including stale sockets
  for reader/session/editor, lock timeout cleanup, outage and real stop/start.
- Ordinary backend: **230 passed**; Ruff and mypy (39 source files) passed.
- `npm run build` passed TypeScript checking and production bundling;
  `git diff --check` passed.
- Fresh installed API image `meducation-api:l5-step1`, Linux ARM64, passed all
  **8 smoke groups**. Image command explicitly has `--workers 1`.
- Native acceptance now includes the separate `postgres-resilience` stage. The
  successful GitHub run at `f99a18e` predates these changes; changed-source native
  AMD64/ARM64 CI remains pending.

Completion audit found no blocking issue for this local step. No runtime write
replay, background SQL, bank edits, routine volume operations or authority change
were introduced. The runbook explains connection inventory and timeout limits.
The whole L5 gate remains open; proceed next with Step 2 request-driven release
freshness on further continuation.

## Step 2 implementation and local acceptance — 2026-10-15

Continuation authorized. Baseline: clean working tree at
`d6756de368dad70a04da21613d78263fc0e02020`. Protected exports:
quiz `11b3fd084f4462c16805069883f53defd538a4d0bcd4d3537ab4c101bd7a3901`;
flashcard `fa6c863dd11085311111f9715a4a5e291a5e9e6a28ac03e4e51a83d0c4443ac7`.
Docker 29.8.2 reachable with sandbox access. Only disposable fixtures are authorized
for database/browser acceptance; routine authority remains protected.

Launch admission validates the current bank subject catalog before cached bodies,
without replacing any study arrays. Evidence ages from monotonic request start;
30 seconds or older fails admission. Explicit retry/confirmation obtains new
evidence. Pending checks for the same item coalesce; cancellation invalidates
pending checks and completed admission closures. Final local verification passed; [frozen evidence](L5-step2-local-evidence.json)
records source hashes, image identity, commands, results and limitations.

Step 2 acceptance:

- Runtime/feature/App suites: **605 tests passed across 95 files**. An earlier
  five-second contention timeout passed in isolation and in the final full rerun;
  no assertion or timeout was relaxed.
- Full isolated PG17: **175 passed, 1 skipped** (379.33s); the restart-only case
  passes in the separate owned-volume run: **8 passed** (16.84s). Coverage includes
  pinned publication, next-request visibility, two independent sources, A → B → A,
  other-bank-only updates, and SQL/pre-ping resource counts.
- Ordinary backend: **234 passed, 176 skipped** (PG cases accepted separately);
  Ruff and mypy (39 files) pass. Two existing weak-RSA fixture warnings remain.
- Fresh installed ARM64 API image plus optional HTTP admin/learner bundle:
  **13 browser cases passed**, including the new freshness scenario. New launches
  in an already open tab detect publication without a manual refresh. Tests cover
  saved-byte preservation, cached resume/browse, explicit reload/restart,
  publication while confirmation is open, active quiz/deck preservation and
  unchanged transient results review. Browser outage is an intercepted **503**;
  actual PG outage/restart is covered separately by the real-PG gate.
- Fresh ordinary learner build/typecheck and **41 learner browser cases passed**;
  optional admin build and **12 JSON-fixture admin browser cases passed**.
- Lint, formatting, checked architecture (**288 modules / 1,255 imports**),
  **10 architecture tests**, typecheck and `git diff --check` pass. Existing
  learner bundle-size advisory remains. Protected export hashes are unchanged.
- A cold browser launch sends four HTTP requests (startup subjects, membership,
  launch validation, body). Cold server catalog: quiz **18 SQL + 4 pre-pings**;
  one-deck flashcards **19 SQL + 4 pre-pings**. A fully cached launch adds only
  **1 HTTP, 3 SQL (two SET LOCAL + one pointer), 1 pre-ping**. Health calls add no
  SQL/pre-pings. No recurring launch validation or publication polling was added;
  local fallback admission makes no HTTP requests. Keep the current pointer policy.
- All uniquely named tmpfs/editor fixtures and the owned restart volume were
  removed; final scoped container/volume listings were empty. Routine authority,
  its volume/credentials/journals and content were not manipulated.

Completion audit: **Step 2 local gate complete, no blocking findings**. Stop here
under the staged-work contract; Step 3 diagnostics/configuration/failure visibility
is next. L5 remains ongoing. Changed-source native AMD64/ARM64 CI belongs to Step 5;
hosted suspend/wake/provider/TLS/identity, off-device retention and manual-device
acceptance are not established by these local results. Firefox remains user-deferred.

## Step 3 implementation and local acceptance — 2026-10-15

Continuation authorized. Baseline: clean `bb8f354971cf5914eaad50feb24671b833ae679c`.
Protected export hashes remain those frozen in Step 2. No routine authority,
volume, credential, journal or content changes are authorized for verification.

Implement explicit POST `/api/admin/diagnostics` behind the existing prefix
session/Origin/CSRF policy and bounded empty-JSON envelope. Reuse the guard's
session connection without interactive activity writes or nested checkout; use
existing reader/editor pools for read-only checks. Health remains SQL-free.
Structured request events and safe access/error logging exclude raw request and
exception data. Verification passed; [frozen evidence](L5-step3-local-evidence.json)
binds source hashes to installed API modules and proxy files. Steps 4–5 remain open.

Step 3 acceptance:

- Explicit read-only diagnostic uses existing verified-editor session/Origin/CSRF,
  `no-store`, bounded empty JSON and existing role pools. Two concurrent diagnostic
  requests use exactly two session checkouts, no nested checkout or activity/test
  writes; all role pools return to zero checked-out connections. Disabled admin,
  missing session and denied Origin/CSRF remain closed.
- Full isolated PG17 suite: **183 passed, 2 skipped**, 495.58s. Both actual-restart
  skips pass in the separate owned-volume stage: **17 passed**, 38.73s. This proves
  diagnostic auth closure during DB stop/start, SQL-free health, role pool/connection
  failures, SQL-timeout cleanup, safe categories and request-driven recovery.
- Ordinary backend: **238 passed, 185 skipped**, 66.68s; PG cases accepted above.
  Ruff on backend/tests/container scripts and mypy (**41 source files**) pass.
  Two existing weak-RSA fixture warnings remain. Development tests were adjusted
  for intentional sanitized 500 behavior and real ownership/recovery timing;
  no timeout or assertion was relaxed.
- Fresh installed ARM64 API plus HTTP admin/learner bundle: **14 browser cases
  passed**, including diagnostics and prior editor/freshness regressions. Actual
  API/Nginx log canaries cover request fields and exception text, rejected method
  400, ingress 413, API 500 and refused-upstream 502. Startup path/body canaries and
  trace suppression pass in the API smoke (**8 groups**).
- Fresh learner image and API through shipped Nginx: **43 browser cases passed,
  1 skipped**, plus **6 proxy smoke groups** (outage/DNS recovery included). The
  skipped dedicated PG source-switch case does not run in this JSON-fixture smoke;
  real PG behavior is covered by the separate HTTP/PG gates, not counted as a pass.
- Network-free installed-source inspection matches all **8 changed API modules**
  and both proxy files byte-for-byte. The packaged command retains **one worker**
  and explicitly disables proxy-header trust.
- `npm run build` (typecheck), fresh HTTP admin build, Docker learner typecheck/
  bundle exclusion, lint, formatting, architecture graph (**288 modules / 1,255
  imports**), **10 architecture tests**, documentation links and diff checks pass.
  Existing learner chunk-size advisory remains; protected export hashes are unchanged.
- [Operations runbook](../../L5-local-operations.md) records response states, safe
  log/recovery semantics, six-connection aggregate budget plus independent jobs,
  timeout limitations, TLS/CORS/proxy/body/credential audit and unverified pooled
  provider requirements. No new grants, engines, workers, background SQL or write
  replay were introduced. Readiness remains initialization readiness during outage.
- All fixtures/owned volumes were cleaned. An exited, unmounted tmpfs fixture left
  by the full-run cleanup was verified by exact metadata and removed; final scoped
  listings were empty. No routine authority, volume, journal or credential operation.

Completion audit: **Step 3 local gate complete, no blocking findings**. Stop at this
stage gate. Step 4's reproducible twenty-learner load characterization is next;
Step 5 rollback/restore/native CI and overall L5 acceptance remain open. Local
verification does not establish hosted TLS/pooling/identity/suspend behavior or
off-device retention. Existing Firefox/manual-device obligations remain separate.

## Step 4 implementation and local acceptance — 2026-10-15

Continuation authorized Step 4. Started from clean HEAD `8c6400480ef174d1d9b218f9b7304b5273decdab`;
both protected export hashes still match the Step 3 baseline. Added
`scripts/containers/load-postgres.py`, its synchronized HTTP round helper, a mounted
fixture-only instrumentation module and five negative harness contracts. The
[operations runbook](../../L5-local-operations.md#twenty-learner-api-launch-characterization)
defines commands, cold/warm semantics, counters, deadlines and limitations.

The harness creates an exact owned labeled PG17 volume/network/container pair,
uses the installed API wheel in one worker with the existing two-reader pool,
and binds fixture services only to loopback. It verifies every installed Python
module against current source before measuring. A deterministic fixture contains
one subject/quiz/deck, 200 questions and 200 cards (47,083/30,811 input bytes);
fixture hashes, seed 50420, source/image fingerprints and environment are retained
in [frozen Step 4 evidence](L5-step4-local-evidence.json). The routine authority,
content, journals and credentials were never used or modified.

Step 4 acceptance:

- Two independent `--rounds 3` characterizations and the final `--rounds 1` smoke
  passed: **32 measured twenty-launch rounds**, **460 successful launches**,
  **120 expected 409 launches**, **60 expected 503 launches**, and **1,800 measured
  HTTP requests**. Three separate twenty-launch warmups are excluded from those
  totals and from measured percentiles.
- Every successful launch checks its subject catalog, membership IDs/counts,
  ETags/revisions and exact ordered bodies. Publication crosses both catalog →
  membership and membership → body boundaries, followed by successful launches
  of the current release. Actual owned-DB stop/start produces explicit unavailable
  responses followed by successful recovery; there is no automatic write replay.
- All cohorts finish within the 60-second round deadline; the largest measured
  round was **2.647 seconds**. Peak checked-out reader connections remained **2**,
  end occupancy was **0**, overflow stayed disabled and pool admission failures
  were **0**. Separate SQL cursor/pre-ping/connection counts are retained. Cold
  fixed-release rounds used 215 cursor statements; warm rounds used 210. This
  counts complete launch traffic, not readiness requests.
- The first characterization shared the host with normal build/lint/type checks:
  aggregate cold p50/p95/max was 1,106.5/2,396.8/2,442.5 ms and warm was
  1,279.5/2,337.6/2,405.6 ms. The independent repetition after those checks completed
  measured cold 272.5/373.1/383.8 ms and warm 254.8/324.5/337.9 ms. Retain both;
  these machine/workload observations do not define a production SLO. No runtime
  tuning was justified or performed.
- The final native-sized smoke completed in **52.924 seconds**, including setup,
  source verification, all transition/recovery cohorts and cleanup. Native
  acceptance now runs the five negative harness tests and `--rounds 1` with a
  600-second subprocess budget. Full changed-source native jobs remain Step 5.
- Harness negative tests **5 passed** (wrong revision, reordered membership,
  incorrect body, unexpected conflict, timeout). Build/typecheck, lint/architecture
  (288 modules/1,255 imports), architecture tests **10 passed**, formatting, all
  backend/container-helper Ruff checks, mypy (41 runtime source files), Python
  compilation and diff checks passed. The existing bundle-size advisory remains.
- No production runtime or UI code changed. The existing Step 3 image was reused
  only after installed-module/source equality passed; unchanged frontend unit/
  browser and full PG content suites were not rerun for this tooling-only stage.
  Each accepted report confirms owned-fixture cleanup; the final labeled Docker
  container, volume and network inventories are empty.

During harness development, a real outage exposed SQLAlchemy check-ins after
failed pre-pings without matching checkouts. Fixture accounting now tracks actual
checkout records; the accepted outage/recovery runs verify both that counter and
the engine's own checked-out count return to zero. This did not require a runtime
pool change or weaker assertions.

Completion audit: **Step 4 local gate complete, no blocking findings**. Stop at
this agreed stage gate. Step 5 retained-release activation, fresh-DB restoration,
compatible application/schema rollback and changed-source AMD64/ARM64 CI are next;
overall L5 remains ongoing. Hosted networking/TLS/suspend/MFA, concurrent editor
load, broader catalog scale, real devices and off-device retention remain distinct
obligations. The synthetic API measurements do not certify them.

## Native CI authentication isolation follow-up — 2026-10-15

Run [38677611981](https://github.com/mfranco1/meducation/actions/runs/38677611981)
at `d17347b91ed3356aae7dc4267dabb50d5755a26f` failed in the final HTTP editor
browser stage on both native architectures. The retained reports show both image
builds and every preceding container stage passed, including the new twenty-launch
smoke (AMD64 14.146 seconds, ARM64 16.877 seconds). This is partial changed-source
CI evidence, not acceptance of the overall jobs.

The downloaded browser traces confirm `POST /api/admin/auth/login` returned 429
for the imported-save test on both architectures and for the following freshness
test on AMD64. The page remained signed out, so the missing Quizzes button was a
consequence of authentication admission. The serial suite shared a database-wide
30-request/minute bucket across fresh browser contexts. Login and step-up routes
consume that budget independently of browser-context isolation; quicker runners
can exhaust it before the last scenarios.

The fixture-only `editor_http.py` now provides explicit rate-bucket cleanup, and
all HTTP editor specs import the auto fixture from `e2e/admin-http/fixtures.ts`.
It clears only disposable rate-limit rows before each test. Production limiter
thresholds, auth/session logic and timeouts are unchanged. Two consecutive
regressions each consume all thirty global slots, check the per-browser six-call
limit and require a new browser to receive 429 at the global limit. This proves
within-test enforcement alongside isolation between tests. Tests remain serial;
parallel workers would need independent fixture databases. No raw CI trace,
credential, cookie or request payload is copied into repository evidence.

Follow-up verification: the full isolated HTTP editor suite **16 passed (1.8m)**,
including both originally failing cases and both rate-budget regressions. The
post-browser operational logging/proxy canaries also passed, and the disposable
editor container/network inventories are empty. An earlier run alongside
build/type/lint checks passed the auth regressions and original failures but hit
a first-save polling deadline while the save was still pending; that run is not
counted as acceptance. The serial rerun retained the same assertions/timeouts.

HTTP admin build, build/typecheck, lint/architecture (288 modules/1,255 imports),
formatting, backend/container-helper Ruff, fixture Python compilation and diff
checks passed. Protected export hashes remain unchanged. Sanitized failed-run
trace observations, passing local output and implementation fingerprints are in
[follow-up evidence](L5-ci-auth-rate-isolation-evidence.json).

Completion audit: **local CI-failure fix verified, no blocking local findings**.
Corrected-source full AMD64/ARM64 jobs still require a new run after commit/push;
this fix does not close the overall native CI gate. Step 5 operational recovery
and rollback acceptance remain open. No production authentication threshold,
runtime service, routine authority or authored content changed.

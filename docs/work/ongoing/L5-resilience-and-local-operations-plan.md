# L5 — Resilience and local operations

Started: 2026-10-14. Plan reviewed and revised: 2026-10-14 for implementation
on 2026-10-15 (Asia/Manila). Status: Steps 1–2 local gates complete;
Steps 3–5 pending. The plan review alone
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
request prepared the plan only; continuation on 2026-10-15 authorizes Step 2.

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

- [ ] Add an explicit operator-triggered read-only diagnostic under the existing
  protected `/api/admin/` boundary, using existing session/editor authorization,
  origin/CSRF policy where applicable and `no-store`. Do not add an unauthenticated
  exemption, a second credential scheme or a periodic health client.
- [ ] Report bounded, sanitized dependency outcomes for reader connectivity,
  supported schema and active publication, and enabled session/editor connectivity
  using their existing role pools. Do not perform a test write or create another
  pool. Account for the session guard already holding a connection: avoid nested
  session checkout that can exhaust the two-slot pool under concurrent diagnostics.
- [ ] Session authorization itself depends on Postgres. If that dependency is down,
  the diagnostic may fail with the existing sanitized auth-unavailable response
  before it runs. Document this limitation and the explicit local operator checks;
  never bypass auth to make an outage diagnostic succeed. Disabled admin stays closed.
- [ ] Keep `/health/live` and `/health/ready` free of DB checkout after initialization.
  Document ready-during-outage versus failed startup. Diagnostic SQL/lock/connection
  limits and cleanup must be bounded; distinguish them from a hard end-to-end
  network-blackhole deadline, as in Step 1.
- [ ] Add safe structured operational events with request correlation, route
  template, status, duration and stable failure category. Cover pool timeout,
  connection failure and recovery on real requests. Exclude raw URLs/query strings,
  cookies, tokens, CSRF/OIDC codes, DB credentials, request bodies, authored text,
  SQL parameters and unsanitized exception traces. Exercise proxy/access logs as
  well as application handlers; use injected secret canaries in failure tests.
- [ ] Audit existing settings and limits before adding new ones: verified DB TLS
  outside local mode, explicit public CORS versus private same-origin policy,
  trusted proxy assumptions, bounded request bodies/timeouts and separate reader,
  session, editor, backup and migrator credentials. Record aggregate connection
  budget including diagnostics/jobs. No new grants without a demonstrated need.
- [ ] Document direct versus transaction-pooled endpoint requirements for the
  existing SQL/session-lock/transaction behavior. Unverified provider compatibility
  stays a deployment gate; do not claim Neon/TLS/suspend acceptance from local PG.

Gate: negative auth/origin/CSRF and disabled-admin tests, redaction canaries,
concurrent diagnostic pool cleanup, DB outage/recovery, SQL-free health tests,
backend Ruff/mypy/pytest and affected installed-image/proxy checks pass. Update
backend/container runbooks; preserve uncertain-write reconciliation with no replay.

## Step 4 — Provisional concurrency/load characterization

- [ ] Add a reproducible isolated fixture harness using the installed API and real
  PG17, one API worker and the existing two-reader pool. Exercise **20 simultaneous
  learner launches**, each performing catalog → membership → body with revision
  validation; include quiz and flashcard traffic, not 20 health requests.
- [ ] Run separate cold-cache and warm-cache rounds with synchronized starts;
  record fixture size/digests, seed, environment/architecture, image/source hashes,
  concurrency, round count, p50/p95/max launch latency, HTTP/SQL counts, status/error
  counts, checked-out/peak connections and pool admission failures. Separate warmup
  from measured rounds. Use scoped test instrumentation, not a telemetry service.
- [ ] Healthy fixed-release rounds require all 20 launches to finish correctly
  within a declared harness deadline, zero unexpected errors/timeouts and no pool
  leaks or limit violations. Start with a 60-second per-round harness deadline;
  latency percentiles are characterization, not a promised production SLO.
- [ ] Separately exercise publication during load and DB outage/recovery. Classify
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

Start Step 2 by recording `git status`, the current commit and protected export
hashes, then add focused failing freshness tests around the existing launch paths.
Do not rerun or manipulate the routine DB to reproduce Step 1. Preserve existing
uncommitted tracker/evidence work. Confirm Docker is available before fixture tests;
if it is unavailable, report the unrun gate rather than counting skipped DB tests.

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

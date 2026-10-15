# L5 local diagnostics and operational events

The local PostgreSQL database remains the only writable paired-bank authority.
These checks inspect dependencies; they do not publish, repair, restore, allocate
IDs or replay writes. See [local authoring](local-authoring.md),
[recovery policy](L4-authoritative-recovery.md) and the
[L5 tracker](work/done/L5-resilience-and-local-operations-plan.md).
Hosted identity/TLS/pooling/suspend acceptance remains a deployment gate.

## Explicit protected diagnostic

After signing in to the configured local HTTP editor, an operator may explicitly
POST `{}` to `/api/admin/diagnostics`. Use the existing session cookie and current
CSRF token; the request must have the exact configured Host and Origin, JSON
content type and identity content encoding. It has the same prefix-wide editor
authorization as other private routes, with no anonymous diagnostic exemption.
No automatic diagnostic client, timer or new credential is installed.

For a one-time check in the signed-in editor's browser console:

```js
const session = await (await fetch('/api/admin/session', { cache: 'no-store' })).json();
const diagnostic = await fetch('/api/admin/diagnostics', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
  body: '{}',
});
({ status: diagnostic.status, response: await diagnostic.json() });
```

Do not print or copy `session`, cookies or the CSRF token into logs or support
reports. The diagnostic response itself contains only bounded outcome strings.
A healthy response is HTTP 200; failed enabled checks return 503. Every response
is `no-store` and has a server-generated `X-Request-ID`. Auth errors also put that
same ID in `error.requestId`.

The result reports reader `connectivity`, supported PG17/packaged `schema`, and
complete active `publication`, plus session/editor connectivity. Values are
`ok`, `unavailable`, `unsupported`, `missing`, `not_checked` or `not_applicable`.
JSON fallback mode has no reader dependency, so its reader fields are
`not_applicable`; this does not certify a writable authority. No URLs, credentials,
SQL, authored text, content hashes or release IDs are returned. A schema mismatch
stops publication inspection. A failed transaction is closed/rolled back before
subsequent requests use its pool.

Authorization itself requires PostgreSQL. When the session dependency is down,
the request can return the existing sanitized `session_unavailable` 503 before
the diagnostic runs. It cannot enumerate the other dependencies in that case.
Expired/missing sessions, denied Origin/CSRF, disabled admin and the production
identity gate retain their existing behavior; never bypass them to diagnose an
outage. Diagnostics do not extend session idle expiry or perform an activity write.

## Resource and timing contract

The diagnostic reuses the session guard's already checked-out connection. It
never nests a session checkout. Reader and editor checks use their existing pools
and explicit read-only transactions; session checks use SELECT on the guard's
existing transaction. There is no test write, additional engine or new SQL grant.

One API process retains at most two reader, two session and two editor connections,
zero overflow: **six pooled connections total** when admin is enabled. Two
concurrent diagnostics fit this budget; each holds one connection per role during
its work. Other requests may wait for the same slots. Pool admission and connection
establishment each have five-second bounds. Reader/editor diagnostic statements
have a ten-second statement timeout and three-second lock timeout; session
statements retain the guard's ten-second statement/five-second lock limits.
The empty JSON envelope is limited to 8 KiB and ten seconds. These are per-stage
limits, not a hard end-to-end deadline against a network blackhole. Nginx private
proxy read timeout remains 155 seconds between reads, not a total execution SLA.

Aggregate capacity is six times the number of enabled API processes, plus active
operator jobs. One worker remains configured. Migrator, backup, bootstrap and
operator jobs use separate credentials and unpooled connections; each concurrent
job may add its own connection. The database's own maintenance/provider reserve
must be budgeted separately. Diagnostics do not authorize more workers or close
the Step 4 twenty-launch concurrency gate.

`/health/live` checks process responsiveness; `/health/ready` checks successful
initialization/configuration. Neither checks out a DB connection after startup.
A previously initialized API can remain ready during an outage. Failed startup
(schema/version/publication/connectivity) refuses serving and uses no JSON fallback.
Do not add SQL keepalives to compensate for this distinction.

## Safe request and proxy events

Application JSON `request_complete` events contain only generated request ID,
registered route template (or `<unmatched>`), allowlisted method, status, duration,
stable failure category, fixed dependency names/outcomes, and recovered dependency
names. Request headers, raw paths/IDs, queries, cookies, CSRF/OIDC values, bodies,
authored content, SQL parameters and exception text/tracebacks are excluded.
Unexpected request failures return a sanitized 500. If failure happens after
headers have been sent, delivery fails without replay; the server log filter
removes the resulting traceback. Existing uncertain-write reconciliation remains
required. An operational event never establishes whether an uncertain write committed.

Database failure categories distinguish `pool_timeout`, `connection_failure`,
`sql_timeout` and `database_failure`. Successful real work after an observed role
failure adds that role to `recovered_dependencies`, once per observed transition
in that process. This means a successful operation after a failure; it is not a
continuous or global health guarantee. No recurring SQL is used for recovery checks.

Uvicorn access records replace path/query/client fields with fixed redacted
values. Its error records with tracebacks or ERROR severity use a fixed safe
server-error event, including preformatted startup traces. SQLAlchemy worker
engine/pool logs do not propagate raw driver exceptions; request events provide
safe categories instead. Do not enable SQL echo, raw library debug logging or
custom handlers that bypass these boundaries in a deployed worker.

Nginx access JSON records use a generated proxy ID, upstream application request
ID when present, fixed route family, allowlisted method, status, elapsed time and
failure category. `escape=json` prevents control-character injection. Native HTTP
error logs can embed the full request, so the HTTP error channel is directed to
`/dev/null`; structured access events retain 400/408/413/502/504 failure visibility.
Master startup/configuration diagnostics remain on stderr. No secrets belong in
Nginx configuration. The installed-image canaries exercise rejected methods,
path/query/header/body/exception values, API 500, ingress 413 and refused-upstream
502; the test harness does not retain raw logs or echo a failing canary.

## Existing configuration and deployment gates

- Database URL validation requires the assigned role, explicit host/database and
  password, `postgresql+psycopg`, and `sslmode=verify-full` outside explicit local
  mode. Connection/query options cannot override role/host/password through libpq
  aliases; GSS negotiation is disabled and connect timeout is forced to five
  seconds. Local exceptions are restricted to loopback or the Postgres service.
  This verifies configuration, not an actual managed-provider TLS handshake.
- Public CORS uses `MEDUCATION_ALLOWED_ORIGINS` (explicit CSV; local defaults).
  Only GET/HEAD and the existing conditional/content headers are exposed, without
  credentialed CORS. Public content remains unauthenticated. Private responses
  have no CORS surface and require exact configured Origin/Host for writes;
  public CORS is never private authorization. Same-origin production routing can
  use an empty public allowlist.
- The packaged API disables Uvicorn proxy-header trust. Nginx forwards Host and
  its own forwarding headers, but auth does not derive redirects, origin or local
  binding from client forwarding headers. Keep the API private behind the proxy;
  deploying a different trusted-proxy topology requires separate verification.
- Nginx retains its public 1 MiB body admission and private 64 MiB authoring limit,
  with ten-second header and 35-second body-idle limits. API auth/diagnostic bodies
  use 8 KiB/ten seconds; paired bodies use 64 MiB/thirty seconds plus existing
  structural/worker/SQL limits. Direct API deployments require equivalent ingress
  byte/idle limits; public GET handlers do not consume arbitrary request bodies.
- Reader, session and editor worker credentials are distinct roles; bootstrap
  requires distinct role passwords. Backup, migrator and trusted operator
  credentials are separate and never injected into learner assets. Auth session
  and content/editor connections must target the same authority database.
  Connectivity diagnostics do not certify role grants, target equivalence, MFA,
  export recovery or allocation journal admission.

Use direct PostgreSQL endpoints for migration/bootstrap, dump/restore, allocation
and recovery jobs. Their session/role/advisory-lock/snapshot semantics must not be
split between physical sessions. Existing workers also use direct local endpoints.
Transaction-pooling compatibility is unverified: check whole-transaction pinning,
row/advisory lock lifetime, SET LOCAL/reset, psycopg prepared-statement support,
pre-ping/reconnect and auth guard/editor transaction interaction before adopting
one. No provider, Neon suspend/wake or hosted identity acceptance follows from
local PG17 success. No downgrade or uncertain-write retry is introduced here.

## Local outage checks

When session authorization cannot reach PostgreSQL, use explicit local operator
checks: inspect the designated container's state/health without printing its env,
then use the configured matching PG17 tool/assigned role for a bounded `SELECT 1`.
Use protected credential files, not shell command arguments or shared logs.
Check supported schema/current publication only after connectivity succeeds.
Follow [local authoring](local-authoring.md) and the existing recovery runbook for
exact target selection; do not stop, restore or mutate the routine database to
reproduce an incident. L5 tests use separately named disposable fixtures only.

Do not infer data loss from readiness, a 503 or a log category. Preserve authored
state, retained dumps and allocation journals. Reconcile an uncertain editor
operation through its existing operation ID and current context before deciding
whether another explicit attempt is safe. No automatic write replay is permitted.

## Twenty-learner API launch characterization

Use the installed API image and disposable fixtures only:

```sh
.venv/bin/python scripts/containers/load-postgres.py --api-image meducation-api:local --rounds 3 --output test-results/l5-load.json
```

`--rounds 1` is the bounded native acceptance smoke; `--rounds 10` collects longer
samples. `--items-per-bank` defaults to 200 and accepts 2–2000. This creates one
synthetic subject, quiz and deck, with deterministic clones of the existing
browser fixture records and new fixture-only IDs. It never imports or edits the
routine bank. PG17 runs on an exact owned labeled volume so stop/start preserves
the disposable publication. Cleanup verifies ownership and removes that volume,
both containers and their network. HTTP and PostgreSQL bind only to loopback;
credentials live in private temporary files and are excluded from reports.

The host, engine and installed image must share a native architecture. The fixture
runs one Uvicorn worker and the installed PostgreSQL reader with two connections,
zero overflow. A mounted fixture module adds counters and reset endpoints only
to this isolated process; it is absent from the shipped image. Installed Python
module hashes must match the recorded source before measurements begin.

Each round synchronizes twenty starts: ten quiz launches and ten flashcard
launches. Every successful launch reads subjects, selected membership and ordered
bodies, checks ETags/revisions at every step, and compares membership, counts and
complete returned bodies with the expected fixture. All twenty must finish
within a 60-second round deadline. Requests have at most fifteen seconds each
and use the remaining round budget; the harness performs no automatic retries.
The fixed seed controls launch-kind order, not thread scheduling.

A separate warmup is excluded from measured samples. Each cold round clears the
API catalog cache and disposes idle reader connections; each following warm round
retains them. **Cold means API caches/connections, not PostgreSQL or OS buffer
caches.** Reports record p50/p95/max for successful launches only, individual launch
outcomes, round duration, HTTP statuses, SQL cursor statements, separate pre-pings,
connection establishment/checkouts, peak/end occupancy, and admission failures.
Driver startup/transaction-control protocol traffic is outside the SQL cursor
counter. Both occupancy counters must return to zero, peak occupancy must stay
within two, overflow must remain disabled and admission failures must be zero.

Separate synchronized cohorts cross A→B publication after catalogs and B→A
reactivation after membership. Each requires twenty explicit 409 outcomes, then a
new cohort must launch the current bodies correctly. Another cohort loads catalogs
before a real owned-PG stop; twenty expected 503 outcomes must be followed by
successful launches after restarting that same fixture database. Writes are
single explicit fixture operator calls, never automatic admin write replay.
409/503 outcomes retain their own durations and never enter success percentiles.
The five harness contract tests also require rejection of wrong revisions,
reordered membership, wrong bodies, unexpected conflicts and timeouts.

These measurements characterize this synthetic API workload on the recorded
machine. They do not measure browser rendering, proxy throughput, broad catalog
scale, hosted networking or concurrent editor activity, and do not define a
production latency SLO. Keep runtime worker/pool settings unchanged unless a
measured failure supports a specific adjustment, then repeat the baseline.

## Distinct recovery and rollback drills

A retained-release activation changes the current immutable publication. It does
not rewind the paired working draft, delete later releases/history, reclaim IDs,
or restore session state. Review the retained pair and current sequence in the
HTTP editor, use explicit activation confirmation, and verify a new learner
launch. An already running quiz/deck retains its pinned content. Reactivating the
later retained release gives another new publication sequence; it is an explicit
operation, never an automatic retry of an uncertain write.

A database restoration instead reconstructs content **and** draft/history,
audit/operation records, reservations/counters, allocation-fence state and auth
records as of the dump. Follow the
[authoritative recovery procedure](L4-authoritative-recovery.md#fresh-restoration-procedure)
and [local authority operations](local-authoring.md#recovery-and-verification).
Stop source workers/writers and retire their database access before admitting the
restored lineage. Restore into a separate fresh target, verify effective grants
and exact content/history, quarantine restored sessions/pending logins, rotate the
external auth epoch, and reconcile complete journals before issuing any new ID.
Switch reader/session/editor connections together only after acceptance. Keep the
retired source unavailable to application roles; two writable authorities of the
same lineage must never issue allocations concurrently. The retained-backup
rehearsal also holds an exclusive source-database advisory lock through target
cleanup so concurrent invocations cannot admit two writable clones.

An application rollback changes the installed service image while retaining the
current database. The runtime requires the exact packaged migration head. Select
and verify a concrete prior image/source/schema pair before stopping the current
worker. Keep the newer database/draft/history/allocation state intact, start only
one worker, and verify current catalogs, ordered memberships and bodies through
fresh requests. If startup rejects a mismatched schema, keep serving stopped and
roll forward to a known compatible image/schema pair. Do not edit a real schema
version marker, invent a downgrade, or restore an older dump over newer authoring
to make an image start.

The local compatibility specimen is commit
`bb8f354971cf5914eaad50feb24671b833ae679c` (L5 Step 2), with packaged schema head
`0006_allocation_fence`. It predates Step 3 diagnostics/logging changes; the drill
establishes schema/data compatibility, not approval of those reverted behaviors
for a deployment. Future deployments need an approved retained release inventory.
The harness compares all installed Python/SQL module hashes to the chosen Git
revision before using the image. It starts current → prior → current against the
same fixture database, then temporarily corrupts **only the disposable fixture's**
schema marker to prove incompatible startup refuses content. It repairs that test
marker and proves current-image roll-forward. No actual migration downgrade runs.

Run all three drills with an installed current image and retained specimen:

```sh
.venv/bin/python scripts/containers/build-rollback-api.py
.venv/bin/python scripts/containers/verify-postgres-release.py --api-image meducation-api:local --previous-api-image meducation-api:l5-rollback-prior --output test-results/l5-operational-recovery.json
```

The builder extracts the exact historical Git commit into a temporary directory
and builds its pinned Dockerfile. It needs that Git object locally. Native CI
fetches full history, builds this specimen and passes both images to the existing
recovery stage. Omitting both image arguments retains the standalone archive
parity/restore mode but does not certify application rollback.

The rehearsal imports copies of repository archives into a uniquely labeled tmpfs
PG17 cluster. These may be older than the routine authority and are fixture data.
It demonstrates reversible retained activation and pinned-view preservation,
then compatible application rollback with exact all-table state equality. Before
restoration it deliberately creates post-dump allocations and advances retained
journals, revokes source application CONNECT privileges and drains those sessions.
Only the private bootstrap controller remains for read-only comparison. The fresh
target must restore exact pre-dump content/auth/grants before quarantine, reject
old credentials/callbacks, burn every permitted journal range, and allocate above
the lost IDs. Reports separate activation/application/dump/restore/admission
measurements and retain hashes/counts, schema/publication identity and cleanup.

Those timings describe disposable local fixtures. They do not establish retained
backup freshness, off-device RPO/RTO, hosted suspend/wake/TLS/pooling, provider MFA,
or real-device acceptance. Preserve the user's current local-only retention policy.

## L6 handoff

After the changed-source native jobs accept these drills, L6 still owns a fresh
full release-candidate verification, authoritative DB/export parity, rich-content
and real-device review, provider-neutral deployment inputs, and an explicit
remaining-deployment checklist. The routine local PostgreSQL authority and its
locally retained journals/backups remain the source of truth; a passing archive
fixture is not proof that those archives match the live bank. Learner progress
remains private browser storage and requires its separate backup/recovery path.

Preserve the existing deployment gates: verified hosted TLS and the chosen
provider's pooling/suspend/wake behavior; actual identity/MFA assurance; off-device
retention under the user's deferred policy; Firefox's explicit testing deferral;
real mobile/Safari, assistive-technology and persisted-return observations. Local
PG and synthetic identity evidence do not close them. L6 preparation does not
provision a cloud database/API, publish content or change the selected local scope.

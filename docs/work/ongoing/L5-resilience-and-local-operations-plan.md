# L5 — Resilience and local operations

Started: 2026-10-14. Status: Step 1 local gate complete; Steps 2–5 pending. The user authorized continuation
after successful L4 native CI at `f99a18e`. Work is independent of the explicitly
deferred retained external-drive setup and L4 authority cutover. JSON remains
authoritative; no routine DB, hosted service, authority or learner progress changes.

Parent: [production preparation](local-first-production-preparation.md#l5--resilience-scale-to-zero-readiness-and-local-operations).
Follow [work tracking](../README.md): implement a coherent step, record results and
limitations, then stop at its gate until continuation is authorized.

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

- [ ] Implement/measure <=30-second current-release freshness for new learner
  launches, including frontend cached content. Preserve active attempt snapshots,
  revision-conflict/reload behavior, paired content and request pinning.
- [ ] Keep background release polling absent; measure read/query overhead and
  verify future multi-worker behavior before increasing worker count.

## Step 3 — Diagnostics, configuration and failure visibility

- [ ] Add an explicit authenticated deep-dependency diagnostic, safe structured
  logs/redaction and useful outage signals. Liveness/readiness remain process and
  initialization checks, not SQL keepalives or continuous reachability promises.
- [ ] Audit TLS/CORS, direct versus pooled endpoint suitability and least-privilege
  connection inventory. Actual provider/Neon acceptance remains a deployment gate.

## Step 4 — Provisional concurrency/load characterization

- [ ] Exercise 20 concurrent fixture learner launches and characterize latency,
  errors and pool saturation. This is a provisional local target, not a production
  capacity promise. Tune only against measured evidence.

## Step 5 — Operational regression and L6 handoff

- [ ] Rehearse compatible app/schema recovery and retained-release rollback without
  deleting later content, using isolated fixtures. Preserve L4 retained-copy/RPO/RTO
  deferral; temporary archives cannot close it.
- [ ] Run affected regression/container checks, match every parent L5 outcome to
  evidence and record hosted/provider/manual-device limitations for L6. Archive
  this tracker only when L5's complete implementation gate actually passes.

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

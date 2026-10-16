# L6 deployment handoff

This is the operational entry point for the accepted local release candidate.
The [completed candidate plan](work/done/L6-local-release-candidate-plan.md) and
[final decision](work/done/L6-final-decision-evidence.json) accept source
`d54b8596a2199e8bc204d5f16927dae5c5af16d1` with full local verification and
[independently verified five-job CI](work/done/L6-step5-native-ci-evidence.json),
including native AMD64/ARM64. No provider account, domain, hosted database or
deployment was created. Public launch remains blocked by the
[ongoing deployment checklist](work/ongoing/L6-public-deployment-acceptance.md).

The designated local PostgreSQL authority remains the only writable paired bank.
The pinned content specimen is release `3e3604bf-dedf-470e-adf6-4dccc1bab5f9`,
publication sequence **3**, packaged schema **`0006_allocation_fence`**, observed
unchanged at the [Step 2 handoff](work/done/L6-step2-content-evidence.json).
Its protected export stays outside Git. It is not asserted to be the newest
publication indefinitely; recheck the active identity before transfer. Repository JSON databases and offline fallback are retired; only an explicitly
selected database export is a valid content acceptance input.
Learner progress remains browser-local, with its own [backup/restore](progress-backup.md).

## Build and serve the local artifacts

Use the committed lockfiles and digest-pinned Docker bases, a matching native
Linux AMD64 or ARM64 engine, and [pin maintenance](../ops/containers/README.md).
There is no byte-identical image promise across platforms or rebuild timestamps.
Local image IDs identify these artifacts; record registry manifest digests separately
when a later approved deployment publishes them.
Do not inject private files or secrets into Vite/build arguments. From the root:

```sh
docker build --pull -f backend/Dockerfile -t meducation-api:l6-step4 .
docker build --pull -t meducation-learner:l6-step4 .
docker build --pull --target admin -t meducation-admin:l6-step4 .
docker image inspect meducation-api:l6-step4 meducation-learner:l6-step4 meducation-admin:l6-step4 --format '{{.Id}} {{.Os}}/{{.Architecture}}'
```

The default/final Docker target is `learner`, also used by existing Compose. It
excludes admin/QA/bundled-bank modules and returns 404 for `/admin.html`. The
explicit `admin` target contains guest and HTTP editor entries, excludes
`LocalAdminApp`/fixture authoring and bundled banks, and serves `/admin.html`
(including popup completion) with `Cache-Control: no-store`. It does not enable
the private API. Real production admin remains disabled until the identity gate.

Both static targets run as 101:101, read-only with `/tmp` tmpfs, and share the
bounded proxy. Their audits are `/opt/learner-artifacts.json` or
`/opt/admin-artifacts.json`, outside `/opt/meducation/html`; maps and Vite build
manifests are removed before runtime. API packaging uses the installed wheel,
locked Python dependencies and bundled development-time content-policy worker;
it runs as 10001:10001 with one Uvicorn process. It contains no corpus archives or file-source settings.

For an owned loopback PostgreSQL preview, follow [local container setup](local-containers.md).
Supply only a protected reader env file to the API, initialize/migrate/publish
through explicit jobs, and keep the database separate from the designated
authority. Missing reader/schema/publication fails startup; there is no archive
preview mode. Private APIs remain disabled until separately configured and
accepted. Do not use synthetic fixture acceptance as proof of live DB currency.
Nginx's included upstream is `api:8000` with Docker DNS; another host topology
needs an explicit proxy configuration/resolver and its own routing acceptance.
The handoff's [Step 4 receipt](work/done/L6-step4-deployment-evidence.json)
records actual local image IDs, audits, commands, platform and limitations.

## Configuration and secret responsibility

Examples remain placeholders in [frontend](../.env.example),
[API/jobs](../backend/.env.example) and [local Compose](../ops/containers/.env.example).
An operator owns provisioning, rotation, recovery and secret-file permissions
(0700 directories, 0600 files). Do not print resolved Compose configuration,
process environments, database URLs, tokens or private authored/progress data.
Browser `VITE_*` values are public and must contain no secret. No runtime setting
below authorizes bypassing a disabled production identity adapter.

Public **build-time** settings, owned by the release operator:

- Published content is delivered through the PostgreSQL-backed API. Remove
  the retired `VITE_CONTENT_SOURCE` setting; explicit values fail the build.
- `VITE_CONTENT_MAX_RETRIES`, `VITE_CONTENT_RETRY_BASE_DELAY_MS`,
  `VITE_CONTENT_RETRY_MAX_DELAY_MS` bound public read retries (0–5 retries, delays
  capped at 30 seconds). Smoke fixtures explicitly use zero; shipped images keep
  the ordinary policy. They never authorize admin write replay.
- `VITE_BUILD_ADMIN` selects the separate optional
  entry; the Docker targets set them explicitly. Development and production
  use the HTTP editor. Remove retired `VITE_ADMIN_SOURCE` and
  `VITE_JSON_FIXTURE_AUTHORING` settings; explicit values fail the build.
- `VITE_CONTENT_IMAGE_ORIGINS` is a public image-origin allowlist; local image
  paths need no extra origin. Maintenance validator `CONTENT_IMAGE_ORIGINS` is
  an operator tool input, not an API runtime switch. API authoring supplies its
  validator's trusted origins explicitly and currently defaults to local-only.
  Remote image authoring needs matching trusted backend configuration work and
  validation, rather than only a browser flag.

**API runtime** settings, injected by the operator:

- `MEDUCATION_DATABASE_ENVIRONMENT=production`
  and secret `MEDUCATION_DATABASE_URL` select the reader. Its role must be
  `meducation_reader`, with explicit host/database/password and verified TLS
  (`postgresql+psycopg`, `sslmode=verify-full`) outside explicit local fixtures.
  A provider CA/trust-root and actual handshake are deployment acceptance items.
- `MEDUCATION_ALLOWED_ORIGINS` is a public-read CORS CSV, empty for a strictly
  same-origin installation. It never grants private authorization.
- Bank-path settings and JSON service mode are retired. The image has no corpus
  files; tests seed explicit synthetic fixtures into disposable PostgreSQL.
- `MEDUCATION_ADMIN_ENABLED=false` is the current public runtime default.
  After a real adapter exists, session/editor URLs are separate secrets in the
  same authority database; do not give the worker operator/owner credentials.

**Identity/session configuration**, owned by the identity/security operator and
consumed at API runtime, is currently accepted only for synthetic loopback tests:

- `MEDUCATION_ADMIN_ENVIRONMENT`, `MEDUCATION_ADMIN_ADAPTER` are admission gates.
  Enabled production or non-synthetic configurations currently refuse startup.
- `MEDUCATION_ADMIN_ORIGIN` is the exact public origin (no path/trailing slash).
  `MEDUCATION_ADMIN_ISSUER`, `MEDUCATION_ADMIN_AUTHORIZATION_ENDPOINT`,
  `MEDUCATION_ADMIN_TOKEN_ENDPOINT`, `MEDUCATION_ADMIN_JWKS_URI` are fixed trusted
  issuer/endpoints; `MEDUCATION_ADMIN_CLIENT_ID` and
  `MEDUCATION_ADMIN_EDITOR_SUBJECT` bind the client and exact issuer subject.
  These identifiers are not secrets, but changes affect authorization and require
  review. Current synthetic settings require loopback endpoints; hosted endpoint
  examples are not an enabled implementation.
- `MEDUCATION_ADMIN_CLIENT_SECRET` and `MEDUCATION_ADMIN_ENCRYPTION_KEY` are
  independent secrets. The latter is a Fernet key for temporary login material.
  Keep provider signing private keys at the provider; never copy them into Vite.
  Future provider rotation must be accepted with overlapping verification keys,
  issuer validation and safe pending-login/session handling.
- `MEDUCATION_ADMIN_EPOCH` is an external random revocation generation, at least
  16 characters, retained independently of dumps. Change it after restoration or
  security-policy/allowlist changes and restart all workers; restored sessions
  must also be quarantined. A database dump does not restore these external keys.
- `MEDUCATION_ADMIN_SESSION_DATABASE_URL` selects `meducation_session` for private
  auth rows; `MEDUCATION_ADMIN_EDITOR_DATABASE_URL` selects `meducation_editor`
  for controlled content operations. Rotate each role secret separately, drain
  workers/pools and verify sessions/transactions; never substitute reader or owner.

**Explicit jobs**, owned by the database/recovery operator, never worker startup:

- Secret `MEDUCATION_BOOTSTRAP_DATABASE_URL` selects the local bootstrap controller;
  secret `MEDUCATION_MIGRATION_DATABASE_URL` selects `meducation_migrator`; secret
  `MEDUCATION_OPERATOR_DATABASE_URL` selects trusted `meducation_operator` jobs.
  Owner `meducation_owner` is a NOLOGIN DDL owner assumed only by reviewed jobs,
  not another runtime URL. Direct connections preserve session/lock semantics.
- `MEDUCATION_POSTGRES_MIGRATOR_PASSWORD`, `MEDUCATION_POSTGRES_READER_PASSWORD`,
  `MEDUCATION_POSTGRES_BACKUP_PASSWORD`, `MEDUCATION_POSTGRES_OPERATOR_PASSWORD`
  and optional paired `MEDUCATION_POSTGRES_SESSION_PASSWORD` /
  `MEDUCATION_POSTGRES_EDITOR_PASSWORD` are distinct bootstrap/rotation inputs,
  each at least 16 characters. Backup role reads content and auth for PG17 dumps;
  its password belongs only to protected backup-tool credentials/pgpass, not API.
  There is no generic `MEDUCATION_BACKUP_DATABASE_URL` runtime setting.
- Local Compose `MEDUCATION_POSTGRES_BOOTSTRAP_PASSWORD` initializes a new fixture
  cluster only. `MEDUCATION_POSTGRES_PORT`, `MEDUCATION_FRONTEND_PORT` are local
  publication choices; `MEDUCATION_API_PORT` / `MEDUCATION_E2E_API_PORT` select
  host Vite/test proxy ports. These are development wiring, not deployed API
  settings. `MEDUCATION_CONTAINER_URL` and editor/test-output/export selectors
  are test harness inputs, never production identity controls.

Changing a password placeholder does not rotate an existing role. Coordinate
actual DB/provider changes, runner secret replacement, worker drain/restart,
health/content/auth checks and recovery inventory updates. Use
[session recovery](L4-admin-session-boundary.md#roles-locking-and-recovery) and
[authority recovery](L4-authoritative-recovery.md#fresh-restoration-procedure).

## Ordered bootstrap, transfer and authoring admission

These are future operator actions after target selection and approval; this
handoff executes only disposable rehearsal scripts. Supply protected credentials
through the chosen runner, not command arguments or shell expansion of env files.
Never run schema setup from each API worker.

1. Select PG17 region/host/endpoints, TLS trust, role capabilities and budgets.
   Rehearse the supported owner/migrator/reader/operator/backup/session/editor
   grants. **Hosted bootstrap is an implementation/acceptance gap:**
   `bootstrap-local` refuses production, and managed-host role restrictions need
   an explicit reviewed mapping/job. Do not set local mode to bypass remote TLS.
   Existing `smoke-db-toolchain.py` rehearses the installed local path in owned PG.
2. Bootstrap the empty disposable/local target with separate role passwords,
   then run the explicit `head` and `upgrade` jobs with the installed API package.
   Head must be `0006_allocation_fence` before workers start. For a new approved
   target, job form is `python -m meducation_api.db.cli upgrade` with only its
   migrator job configuration. Current runtime requires the exact packaged head.
3. Pin and recheck the authoritative publication. Follow [local authoring export
   commands](local-authoring.md#back-up-and-check-current-content), selecting an
   immutable published UUID, a new protected export and new validation/audit
   reports. Keep unpublished drafts distinct. Preserve the original export and
   [full paired parity](local-authoring.md#verify-a-pinned-published-content-candidate).
4. Transfer the selected paired files only as a reviewed read-only initialization
   or migration intent. `validate-pair`/`import-pair` need a checkout with `npm ci`
   plus the Python development job environment; the small installed runtime image
   lacks that tsx/repository import toolchain. Use the exported `questionBank.json`
   and `flashcardBank.json`, never stale `src/content` files. Retain one operation
   UUID/actor/reason per intent; do not automatically replay uncertain writes.
5. Explicit import does not activate. Record the new target release UUID and
   source UUID/digests separately; file import preserves entity IDs/values/order,
   but does not carry over the source release UUID, authoring history or sessions.
   Activate with a new operation UUID and current expected publication sequence
   (zero only for a genuinely unpublished target). Then independently export,
   validate/audit and compare exact paired hashes/revisions. CLI shapes are in
   [paired transfer](../backend/README.md); substitute protected selected files.
6. Take and verify a full PG17 backup with the backup role and recoverable external
   configuration. A paired export is not a backup of history/auth/grants/allocator
   state. Full authority/history migration requires the separate fresh-target
   dump/restore procedure, not pretending a paired import restores that history.
7. Before **any hosted authoring/creates**, admit the allocation fence against the
   actual latest complete independently retained journals and enforce one writable
   lineage. Retire/drain old writers before replacement admission; reconcile every
   previously admitted ceiling before new IDs. A selected read-only transfer does
   not authorize a second writer. The local `--local-copy-only` exception is
   restricted to the designated loopback authority and is not hosted recovery
   policy. Off-device retention and a retained restore must be accepted first.
8. Configure the reader, and only after real identity/MFA/grants/admission acceptance
   the session/editor worker connections, together against the accepted target.
   Keep one worker, run the smoke sequence below and recheck active release identity.

After the target/roles/TLS and protected job environment are accepted, these are
the selected-transfer CLI shapes. Replace UUID/sequence and protected path
placeholders; they are not runnable hosted bootstrap or a request to execute them:

```sh
.venv/bin/meducation-db head
.venv/bin/meducation-db upgrade
.venv/bin/meducation-db validate-pair --quiz-file PRIVATE_SELECTED_EXPORT/questionBank.json --flashcard-file PRIVATE_SELECTED_EXPORT/flashcardBank.json --repository .
.venv/bin/meducation-db import-pair --reviewed-recovery-import --quiz-file PRIVATE_SELECTED_EXPORT/questionBank.json --flashcard-file PRIVATE_SELECTED_EXPORT/flashcardBank.json --repository . --operation-id IMPORT_UUID --actor RELEASE_OPERATOR --reason "Reviewed pinned published transfer"
.venv/bin/meducation-db activate --release-id TARGET_RELEASE_UUID --expected-sequence EXPECTED_SEQUENCE --operation-id ACTIVATION_UUID --actor RELEASE_OPERATOR --reason "Reviewed initial activation"
.venv/bin/meducation-db export-release --release-id TARGET_RELEASE_UUID --output NEW_PRIVATE_TARGET_EXPORT
.venv/bin/meducation-db validate-export --directory NEW_PRIVATE_TARGET_EXPORT --repository . --report NEW_PRIVATE_VALIDATION_REPORT.json
.venv/bin/meducation-db audit-export --directory NEW_PRIVATE_TARGET_EXPORT --repository . --report NEW_PRIVATE_AUDIT_REPORT.json
```

`head` is read-only; `upgrade` uses only migrator job credentials, and transfer/
activation/export use only trusted operator job credentials. Keep those jobs
separate from the reader worker. Recheck target publication/context before
activation; do not assume zero or replay a different intent after uncertainty.

The durable local authority/journals are never stopped, reimported, granted,
revoked, restored over or allocated against to rehearse this handoff. Use the
owned fixture commands below. [Full recovery](L4-authoritative-recovery.md) owns
session quarantine, auth-epoch rotation, grants and allocator reconciliation.

## Routing, resource budget and health

Use a stable HTTPS public origin and same-origin `/api`, including
`/api/admin/auth/callback`. Public learner reads are unauthenticated; private
session/write authorization is independent of CORS/static visibility. Enforce
exact Origin/Host and CSRF on writes, with freshness on protected actions. Current cookies are HttpOnly,
SameSite=Lax, path `/`; HTTPS enables Secure and the intended production cookie
uses `__Host-`. Those intended semantics do not enable the missing production
adapter. Verify TLS termination, host/port preservation and callback behavior on
actual deployment; never trust client forwarding headers as identity.

Keep the API private behind the proxy. Uvicorn proxy-header trust is disabled.
Nginx forwards Host and forwarding headers but the app does not derive trusted
origins/redirects from them. The shipped Docker resolver/upstream recipe needs
adaptation and acceptance for a different service-discovery topology. Do not
cache private responses at a CDN or proxy. `/admin.html` is `no-store`, learner
HTML is `no-cache`, hashed assets are immutable, public catalogs/bodies are
`no-cache` with ETags/revision preconditions, and private responses are `no-store`.
Unknown `/api` paths and missing assets must never become SPA HTML.

Retain one API process: reader, session and editor pools each have at most two
connections, zero overflow (six aggregate when admin is enabled). Separate jobs
have separate unpooled budgets. Connection/pool admission is five seconds;
reader SQL uses 10-second statements/3-second lock waits. Session guards use
10-second statements/5-second lock waits; editor mutations use 120-second
statements/5-second lock waits. Reader/editor diagnostics use 10s/3s. Do not add workers,
keepalive SQL or publication polling. Verify direct versus transaction-pool
semantics, prepared statements, lock/SET LOCAL/reset behavior and suspend/wake on
the actual chosen provider before adopting pooled endpoints; use direct endpoints
for bootstrap/migration/backup/allocation jobs.

The proxy's public body default is 1 MiB; private authoring admission is 64 MiB,
with request buffering disabled. Header timeout is 10s, body idle timeout 35s,
proxy connect 2s; general read/send 10s, private read 155s/send 35s. API auth and
diagnostics admit 8 KiB/10s; paired bodies admit 64 MiB/30s plus structural,
validator/SQL limits. These bounds are not a hard end-to-end network-blackhole
SLA. An alternate ingress must preserve equivalent bounded admission and safe
logging. Access logs contain generated correlation, route family, method/status,
time and sanitized categories, never full query/path/body/tokens.

`/health/frontend` proves static serving; `/health/live` proves API liveness;
`/health/ready` means configuration/schema/content initialization completed.
After startup, live/ready do not query PG and can stay 200 during an outage.
`/api/admin/diagnostics` is an explicit authenticated read-only dependency check,
not a keepalive. A session DB outage can deny authorization before it runs.
[Operations](L5-local-operations.md) owns these limits and failure categories.

## Smoke, diagnosis and rollback order

Before a future release switch, retain exact image IDs/schema compatibility,
source/target publication metadata, the protected export/full backup and journals,
and a browser progress backup where an origin changes. Run disposable checks:

```sh
node --test scripts/containers/check-admin-artifacts.test.mjs
.venv/bin/python scripts/containers/smoke-api.py --image meducation-api:l6-step4 --report NEW_API_REPORT.json
.venv/bin/python scripts/containers/smoke-learner.py --api-image meducation-api:l6-step4 --frontend-image meducation-learner:l6-step4 --browser --report NEW_LEARNER_REPORT.json
.venv/bin/python scripts/containers/smoke-admin-static.py --api-image meducation-api:l6-step4 --frontend-image meducation-admin:l6-step4 --output NEW_ADMIN_STATIC_REPORT.json
.venv/bin/python scripts/containers/smoke-admin-http.py --image meducation-api:l6-step4 --frontend-image meducation-admin:l6-step4 --output NEW_HTTP_EDITOR_REPORT.json
```

Keep reports outside Playwright's cleaned output directories. Container learner
traces now use `test-results-containers/learner/`; HTTP editor traces use its
separate `admin-http/` sibling. These scripts use explicit synthetic PostgreSQL fixtures and
never certify the current authority by themselves. The HTTP fixture supplies
synthetic signed identity and fixture-only routes/config; its successful authoring
is not hosted MFA acceptance. The optional static smoke uses the actual shipped
Nginx config and disabled API; it checks every shipped asset and private denial.

On a selected running origin, operator read smoke order is: static entry and
health, `/api/v1/subjects` and flashcard subjects, chosen membership/body with the
returned ETag/revision (`If-Match`, then `If-None-Match` for 304), and a stale
revision for 409. Confirm private session/draft denial without credentials; the
currently disabled runtime must return `503 admin_disabled` and `no-store`.
After a future accepted real sign-in, check session status and explicitly POST
`{}` to `/api/admin/diagnostics` from the existing browser context with exact
Origin/current CSRF. Never paste cookies/tokens into shell history. Review the
protected [diagnostic contract](L5-local-operations.md#explicit-protected-diagnostic).
Finally exercise fixture authoring and synthetic progress restore separately;
never import test progress into a personal browser profile.

If unhealthy, first distinguish process-start rejection, proxy/upstream failure,
DB connection/schema/publication failure, or session/identity rejection. Use
sanitized logs/correlation, container state and bounded operator checks. Do not
interpret ready=200 as current DB connectivity or infer data loss from a 503.
Preserve uncertain operations and reconcile existing receipts before another
explicit intent. Do not replay writes automatically or silently use archives.

- **Compatible application rollback:** select a retained approved image whose
  exact packaged schema matches the current DB, stop the current worker, start
  one compatible worker and verify new reads. Incompatible startup stays closed;
  roll forward to a known compatible pair. No schema downgrade or old DB overwrite.
- **Retained content activation:** review/select the immutable paired release in
  the HTTP editor, explicitly confirm activation, then check new launches and the
  new publication sequence. This preserves later history/drafts/IDs; current study
  remains pinned. Reactivate the later pair explicitly if required.
- **Fresh-DB recovery:** follow retirement, full restore/grants, session quarantine,
  external epoch rotation, latest-journal reconciliation and admission in the
  recovery runbook. Never keep two writable authorities of the same lineage.

Rehearse the three distinct mechanisms only in owned fixtures using
`build-rollback-api.py` then `verify-postgres-release.py --small-fixture --api-image IMAGE
--previous-api-image PRIOR_IMAGE --output NEW_RECOVERY_REPORT.json` as documented
in [L5 recovery drills](L5-local-operations.md#distinct-recovery-and-rollback-drills).
The offline `scripts/local-authoring/verify-backup.py` is deliberately **not** a
routine online smoke: it requires source writer retirement and exclusive rehearsal
admission. Do not revoke routine writers to make a release check run.

## Remaining deployment gates and evidence owners

The release operator owns refreshing candidate verification when relevant inputs
change. L6 Steps 5–6 now accept the pinned local candidate with five-job CI and
exact recorded source/content/local artifact identities. The ongoing checklist
assigns each subsequent gate an evidence owner and closure condition.
The provider/database operator owns chosen region/PG17
capabilities, quotas/budgets/alerts, verified role bootstrap/TLS, direct/pool and
suspend/wake behavior, retained restore/off-device journals and measured latency
from the Philippines. Recheck official provider documentation at selection time;
provisional Neon/API-host choices are not commitments or reconfirmed prices.

The identity/security operator owns actual production adapter implementation,
trusted claim/MFA freshness mapping and forced step-up, provider key/secret
rotation, session/logout/recovery and synthetic-mode rejection. Private public
admin stays disabled until all pass. This is implementation plus acceptance,
not replacing loopback credentials with hosted credentials.

The release/domain operator owns stable HTTPS domain, same-origin callback and
private routing, CDN/cache/body/proxy policy, origin-transfer progress backup UX,
secret installation and final deployed smoke. The user/device operator owns
[Firefox, actual iOS/Android files, actual screen readers and real persisted/frozen
returns](work/ongoing/L0-browser-acceptance.md#l6-accepted-engine-refresh--2026-10-15).
These remain explicit public-launch blockers. No cloud work is executed by this
handoff, and no manual/provider gap is counted as passing local automation.

## Local Step 4 packaging receipt

[Step 4 evidence](work/done/L6-step4-deployment-evidence.json) records passing
Linux ARM64 builds/packaging: API image
`sha256:02b79878958ffa95ffd3ec9a9fca8663a0e9918f9cd3136f3ccf1cd3eb0c855d`,
learner image
`sha256:bc4baf99207130fecc952c532a52fa43b604dc74c79fe41070322f5527f5bafe`,
and optional admin image
`sha256:e3ce2cb83c34b22d7be16c8657b46bfbaf45dbd9055dced71c4b802d9d7cf363`.
The learner audit has 735 modules; admin has 862 modules and 103 shipped files.
Both exclude bundled banks; learner excludes admin/QA, and admin excludes fixture
authoring/QA. All optional admin asset hashes matched through actual Nginx. API
smoke, six learner proxy groups, 43 learner browser cases and 18 packaged-editor
cases pass. The dedicated PostgreSQL API-recreation scenario runs only in its owned browser harness;
Step 5's PG proxy/native gate must execute that case. This is neither a native
AMD64 pass nor complete candidate acceptance. No provider/device/retention gate
is closed by these local artifact checks.

## Step 5 local verification refresh

The [Step 5 receipt](work/done/L6-step5-local-evidence.json) supersedes Step 4's
focused packaging trials for full local verification. Both fresh native ARM64
clean-build rounds passed; the second API/learner images are
`sha256:18adf2da81c8bb7ddd875039ea07b543f9cb07f861f9bbafb39a6054c109b54d` and
`sha256:969bb67be7485bd468718995642cd580eb11c7d22b2231ff52cb957d38f4fea5`.
The optional admin image retains the Step 4 ID above. Full PG/proxy acceptance
passed 44 browser cases, including the previously skipped publication switch;
packaged HTTP editor acceptance passed 18. Complete recovery/rollback, dedicated
50-case Chromium/WebKit backup acceptance and selected immutable export parity
also passed. The subsequent five-job CI now passes at `d54b859`, including both
native architectures; the final decision accepts the local candidate. CI artifact
metadata/digests are frozen, with payloads retained on GitHub until 2026-10-29.
The source and protected export remain byte-identical to the passing local inputs;
local image IDs above do not identify a published registry manifest.

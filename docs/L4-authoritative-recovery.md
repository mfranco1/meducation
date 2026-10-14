# L4 authoritative recovery preparation

Status: Step 6 implementation is in progress. Repository JSON remains authoritative.
The isolated rehearsal and export tools below do not authorize cutover, certify a
retained backup, or enable a hosted identity provider. The [L4 tracker](work/ongoing/L4-local-authoring-admin-access-plan.md#step-6--rehearse-authoritative-recovery-and-prepare-tooling)
owns acceptance and remaining gates.

## Small local backup policy

Decision selected on 2026-10-14 after the user delegated the approach: use a
private local recovery folder plus a dedicated encrypted external drive. This fits
the existing durable journal implementation and requires no new cloud service.
The user explicitly deferred connecting an external drive on 2026-10-14.
Destination verification and an actual retained restore remain pending while
independent implementation/CI work proceeds. This does not authorize cutover or
certify retained recovery.

The primary root is the existing ignored `var/backups/postgres/` outside the Docker
data volume. Use dedicated `dumps/`, `manifests/` and `allocations/` subdirectories;
the allocation directory contains only its immutable records and lock file. The
independent root is a dedicated recovery folder on an encrypted external SSD.
`/Volumes/MeducationBackup/MeducationRecovery/` is the proposed mount label/path,
not a discovered or verified device. Bind the configuration to the actual verified
volume UUID when available; a pathname alone is insufficient. Never create a
missing `/Volumes/...` directory and accidentally write the independent copy onto
the Mac's internal disk.

Prefer APFS Encrypted on this Mac, with the unlock/recovery secret stored in the
owner's password manager independently of the drive. Reuse a suitable drive if
available; if purchasing one is necessary, a 1 TB SSD is a practical initial size
with headroom for retained history and approximately 1.8 GB of private source
material. This is a capacity choice, not a claim that 1 TB has been measured as
necessary. No purchase, disk erase, encryption change or system backup setting is
authorized merely by this policy decision. Existing drive contents must be
preserved. Apple's [supported backup disk guidance](https://support.apple.com/en-gb/guide/mac-help/mh15139/mac)
identifies APFS/APFS Encrypted as preferred Mac backup formats.

Write PG17 custom-format full content/auth dumps locally with the backup role,
then copy the completed archive and its manifest onto the external drive. Check
SHA-256, flush files/directories and record successful copy time before counting
that backup as independent. PostgreSQL [documents custom archives](https://www.postgresql.org/docs/17/app-pgdump.html)
as a compressed, portable format for `pg_restore`; follow the existing explicit
ownership/ACL reconstruction procedure. Git, a Docker volume and temporary test
archives do not replace these retained copies.

The external drive also holds the independent allocation journal, written and
flushed synchronously before a new ID range is admitted. Connect and unlock it
while taking backups, admitting new ranges and rehearsing recovery. Existing
admitted ranges can continue without another journal write; a new range requires
both destinations. Disconnect/store the drive separately from the Mac between
sessions to reduce shared device-loss exposure. This protects loss of the Mac,
not every event that destroys both locations. Geographically separate/cloud
retention can be added when the product's risk warrants it; it is not a required
new service for this local/private stage. Ordinary Time Machine or asynchronous
cloud sync may provide extra copies, but does not replace this explicit journal
write barrier or the measured database restore.

The selected schedule is a completed independently copied dump after each
meaningful authoring session and publication, and at least once per 24 hours while
authoring. The daily job's eventual scheduled time is 21:00 Asia/Manila; missed
runs must be surfaced and completed before relying on the 24-hour target. This
is the chosen policy, not an installed automation. Retain 7 daily, 4 weekly and
3 monthly verified copies on both destinations. Keep all allocation journal
records permanently. Never prune the last verified recoverable copy. Protect
directories with 0700, files with 0600, and the external volume with encryption.
Retain ignored PDFs/extraction/review material separately under the same external
recovery root; content DB dumps and learner progress backups remain distinct.

## Selected recovery targets and measurement

Content RPO is **<=24 hours**: at any destructive failure, the latest complete
independently retained snapshot must be no more than 24 hours old. Aim to reduce
actual loss to the last completed authoring session by backing up after sessions
and publication. Measure age from the database snapshot's capture time, not its
later copy completion time. Record source schema/release/publication/draft context,
archive SHA-256, snapshot/copy timestamps and destination identity in private
operator evidence. If a backup/snapshot time is uncertain, do not claim the target.

RTO is **<=4 hours** for restoration on an available compatible machine, starting
when recovery begins and ending only after the retained external copy is selected,
restored into a fresh target, checked for content/history/ACL parity, session and
allocation quarantine are resolved, external auth epoch is rotated, workers/caches
restart and learner/editor acceptance passes. It includes configuration/key
retrieval and validation; it excludes purchasing a replacement Mac or waiting for
hardware delivery. Record wall-clock start/end, environment, selected recovery
point and acceptance results. The prior approximately 12-minute synthetic suite
is encouraging compatibility evidence, not the achieved operational RTO.

Allocation RPO is **zero ID reuse**, enforced separately from allowed content loss:
reconcile the actual latest independently retained journal and burn through every
previously permitted range before creating new IDs. If evidence is incomplete,
allocation stays paused.

Rehearse from the actual retained external archive **before cutover**, then monthly
and after a material app/schema/recovery change. The first drill must prove the
external destination survives removal/unavailability of the original database and
local backup path. Use a separate disposable target, not the live database. A full
machine-loss rehearsal additionally starts from a clean compatible environment
with code/configuration and recovery secrets available independently. Mark the
4-hour target achieved only for the measured scenario; keep any replacement-host
scenario unverified until actually exercised.

## Allocation safety is a separate gate

A dump contains counters, global identities and reservations as of its snapshot.
An ID issued afterward may have appeared in an editor/export even if its draft
was never saved. Restoring the earlier dump can reuse that ID. Content loss within
the RPO does not permit identity reuse.

Migration `0006_allocation_fence` implements opt-in protection. Existing
JSON-authoritative fixtures keep their existing allocation mode. Before cutover,
a trusted migrator job must enable protection with a bounded range for every
kind (`s/q/i/d/f`). Once enabled, new IDs must be server-allocated numeric IDs
strictly below their admitted exclusive ceilings. The database trigger rejects
range exhaustion and unseen trusted-import IDs atomically; editor/operator roles
cannot change the fence or its append-only audit events.

The operator job writes the same immutable, numbered, hash-chained record into two
private journal directories, flushes each file and directory, and only then commits
new database ceilings. Records bind the database lineage, generation, floors,
ceilings and schema head. Both complete journals must agree with the database's
known prefix; missing, truncated, foreign, older or divergent evidence refuses
admission. Range extension intentionally burns unused tails. Journals are small
allocation evidence, not content backups; retain their complete chains permanently.

For a reviewed local authoritative target, configured with an explicit migrator
connection and two existing 0700 destinations:

```sh
PYTHONPATH=backend/src .venv/bin/python -m meducation_api.db.cli allocation-range --primary /path/to/private-primary-journal --independent /path/to/independent-journal --size 1000 --reason "Reviewed allocation range" --independent-copy-confirmed
```

The second destination must acknowledge **durable off-device writes before the job
returns** (for example a suitable mounted external/remote filesystem). Distinct
paths do not prove independence. A local cloud-sync folder or later periodic backup
does not meet this ordering until the newly permitted ceilings are independently
retained. `--independent-copy-confirmed` is an operator attestation of destination
semantics, not automatic proof. Destination acceptance remains pending; no real
range or retained destination has been configured by these tests. Do not claim
off-device acceptance merely because both paths exist.

During restore, `invalidate-restored-sessions` also pauses protected allocation.
Do not run two live writable databases of the same lineage. With workers stopped,
select the complete current independent journals, then reconcile explicitly:

```sh
PYTHONPATH=backend/src .venv/bin/python -m meducation_api.db.cli allocation-recover --primary /path/to/private-primary-journal --independent /path/to/independent-journal --size 1000 --reason "Reviewed restore reconciliation" --independent-copy-confirmed
```

Recovery advances counters beyond **all** ranges previously admitted in the latest
independent journal, including unused IDs and ranges absent from the DB backup,
before admitting a new range. It cannot recreate lost content, operations or
reservation receipts. New recovery audit evidence records the gap; original retained
identities, audit events and allocations are not deleted. Recovery rejects missing
or incomplete evidence and leaves the restored allocator paused. If both external
copies are themselves stale relative to a restored older DB, the software cannot
infer the missing history: retention of the actual latest independent journal is
an operator acceptance requirement, not a digest guarantee.

Filesystem failure prevents the DB from admitting a new range. A failed/uncertain
DB commit can leave both journals ahead of the DB; do not automatically repeat
range extension. Inspect the protected DB and journals, quarantine protected
allocation if necessary, then use explicit recovery to burn the ahead ranges. A
partial second copy or interrupted record is preserved as failure evidence; repair
only by verifying/copying the exact immutable record from a complete independent
chain, then reconcile. Never delete a newer record to make old evidence match.
A failed first activation can also be reconciled from complete ahead journals.

`--rehearsal` replaces the off-device attestation only for explicitly isolated
loopback `meducation_test_*`/`meducation_verify_*` databases. It cannot target the
routine database. Temporary same-device test journals prove the failure/recovery
protocol, not retained recovery. Full retained-copy acceptance still gates cutover.

## Fresh restoration procedure

1. Stop editor/API workers and preserve the failed database/volume and any newer
   allocation evidence. Record the incident and selected backup context. Never
   restore over the only surviving copy or use `--clean` against the routine DB.
2. Use matching PG17 clients. Dump as `meducation_backup` in custom format, including
   both `content` and `admin_auth`, with `--no-owner --no-acl`. Store credentials in
   protected libpq service/password files, outside Git and command arguments.
   Record the completed archive's SHA-256 and off-device copy evidence. A content
   ZIP omits history/auth/allocations and is not a database backup.
3. Create a separate empty database from `template0`. Bootstrap managed roles with
   distinct explicit credentials; roles/passwords/database ACLs are cluster state
   and are not in a portable content dump. Grant `meducation_owner` CREATE on only
   that empty target temporarily. Remove its empty bootstrap schemas before
   `pg_restore --role meducation_owner --single-transaction --exit-on-error
   --no-owner --no-acl`. Revoke temporary CREATE afterward, including on failure.
4. Point **job** credentials at the restored target. Reconcile role bootstrap and
   owner default privileges explicitly, then reapply packaged object ACLs:

   ```sh
   PYTHONPATH=backend/src .venv/bin/python -m meducation_api.db.cli restore-permissions
   PYTHONPATH=backend/src .venv/bin/python -m meducation_api.db.cli invalidate-restored-sessions
   ```

   These commands require the explicit migrator connection; worker credentials
   never substitute. Unsupported schema heads fail rather than guessing grants.
   Session invalidation revokes retained sessions, clears pending login
   transactions and pauses protected allocation atomically. It preserves content,
   audit, operations and allocation history.
   Rotate `MEDUCATION_ADMIN_EPOCH` in protected external configuration before any
   admin worker starts; do not restore that configuration from the old snapshot.
   Require a new login. A schema mismatch requires compatible code or an explicitly
   reviewed migration in the separate restored database.
5. Compare all content tables, draft/history, audit/operation/reservation records,
   counters/sequences and effective role privileges with recorded backup evidence.
   Independently reconstruct selected releases and validate paired exports. Compare
   the published pair through fresh learner readers. Run `allocation-recover` against the complete independent
   journals; if they are unavailable or incomplete, keep allocation disabled.
6. Deliberately switch reader/session/editor connections together to the accepted
   target and restart workers/caches. Verify public learner reads and fresh editor
   access, then record elapsed recovery time and achieved recovery point. Retain
   the old database and incident artifacts until recovery is accepted.

The existing `scripts/containers/postgres.py` is a bootstrap-credential development
helper. Its generic restore does not supply L4 ownership/ACL/quarantine/allocation
acceptance. The role-separated implementation in
`scripts/containers/verify-postgres-release.py` rehearses the fresh-target sequence
in a uniquely owned tmpfs cluster, never against routine content. Run:

```sh
.venv/bin/python scripts/containers/verify-postgres-release.py --output /private/tmp/l4-recovery.json
.venv/bin/python scripts/containers/test-postgres-content.py --keyword recovery --output /private/tmp/l4-recovery-tests.json
```

It now seeds paired editor saves, an authored publication, newer unpublished
content, editor reservation slots, a live synthetic session and pending login.
Raw restoration must exactly match all table/sequence state and effective privileges
before session/allocation quarantine. The rehearsal deliberately allocates and admits
a later range after the dump, then proves that recovery burns through those IDs. Quarantine then invalidates old session/callback use
without changing content. Fresh readers and selected authored exports repeat
parity. Archives/credentials are temporary and cleaned. Real destination retention/independence and operational RPO/RTO remain separate
requirements even when the synthetic post-backup allocation recovery passes.

## Explicit export validation and audit

Download a draft or retained release ZIP from the HTTP editor and extract its three
files into a private directory. Alternatively use the existing operator
`export-release` command (new output directory only). Select that directory
explicitly; these commands never import repository banks or require DB credentials:

```sh
PYTHONPATH=backend/src .venv/bin/python -m meducation_api.db.cli validate-export --directory /private/tmp/selected-export --repository . --report /private/tmp/export-validation.json
PYTHONPATH=backend/src .venv/bin/python -m meducation_api.db.cli audit-export --directory /private/tmp/selected-export --repository . --report /private/tmp/export-audit.json
```

Run `npm ci` and `npm run build:content-policy` first for the shared TypeScript
rich-content validation gate and packaged admission limits. The
commands accept both operator and extracted HTTP manifest formats, verify exact
artifact bytes against declared hashes and validate the captured pair. Reports
identify selected release/publication context or an explicitly unpublished draft
revision. Audit reports contain explanation/provenance/source counts and IDs;
they do not expose session/key material. Reports use 0600 and refuse overwrite.
Digests prove internal consistency, not authenticity or live database currency.
Obtain a fresh export from the selected target for a current-content check.

`npm run validate:content` and `npm run audit:explanations` currently examine
repository JSON and announce that source. They are valid canonical checks before
cutover and fixture/archive checks afterward. Do not infer current database content
from a successful check of an old JSON snapshot. Fixture CI needs no operator or
production credentials.

## Recovery ownership outside the database

The content operator owns retained DB backups, exports and allocation evidence.
The source-material owner separately retains ignored `tn-pdfs/` and historical
`content/` extraction/review files. A read-only inventory on 2026-10-14 found 171
source files (157 PDFs, approximately 1.78 GB) and 105 extracted/review JSON files
(approximately 20 MB). No private filenames or source bytes are committed here.
These folders are outside Git and the DB backup; preserve provenance independently.

The repository currently tracks 16 SVG assets under `public/`; retain their Git
history and the build/publishing workflow. The quiz bank contains 96 external URL
occurrences, not a verified inventory of unique or available assets; the flashcard
bank contains none. Neither bank currently contains `/content/` references. External
URL availability and third-party content are not recovered by a DB dump. Review
new media ownership/backup/publication in each content change rather than assuming
remote URLs are retained. Learners own browser progress and use the separate
[paired progress backup](progress-backup.md); no content backup includes it.

## Prepared cutover documentation checklist

The [prepared documentation patch](work/ongoing/L4-cutover-documentation.patch)
and [base file hashes](work/ongoing/L4-cutover-documentation-base.json) are review
artifacts only. `git apply --check` verifies applicability; do not apply them before
separate Step 7 authorization. Runtime/build retirement and operational identifiers
remain part of that approved cutover implementation.

The original base hashes are a historical snapshot. Revalidate every target file
against the current checkout at cutover: patch applicability alone does not prove
that intervening changes are reviewed. The [local outcome audit](work/ongoing/L4-local-outcome-audit.md)
records the current revalidation; the later evidence snapshot includes current
target hashes without replacing the original baseline.

Apply these changes only with separately authorized Step 7 cutover, alongside
verified recovery/allocation enforcement and the reviewed final paired import:

- `AGENTS.md`: replace JSON authority with designated Postgres-only writable
  authority; define JSON as labeled deterministic export/archive/read fallback.
  Preserve exact strings/order/provenance, stable IDs and no runtime AI.
- `docs/architecture.md`: update canonical content, local authoring and entry modes;
  retire the independent writable JSON editor in the cutover build; retain paired
  reader snapshots and browser-only learner persistence.
- `docs/question-schema.md` and `docs/flashcard-schema.md`: change authority/storage
  wording while retaining stored contracts, ordering and omission rules. Include
  release/draft/export context and allocation rules without regenerating IDs.
- `docs/content-management.md`: make HTTP durable save/publish the ordinary workflow;
  use selected-export validation/audit for current DB work; restrict trusted import
  to reviewed recovery/migration. Document reasons and source/verified answers.
- `docs/testing.md`, `backend/README.md`, `docs/local-containers.md` and root README:
  name the authority/mode explicitly, add retained-copy and allocation restore
  gates, keep JSON fixture CI independent, document credential-separated jobs and
  compatibility/cache/session recovery.
- `scripts/content` and admin bootstrap/build selection: prevent stale repository
  JSON from being treated as current writable content; keep explicit archive checks
  available. The source labels added in Step 6 are preparation, not this cutover.

Freeze/hash the final pair and compare with the preserved Step 1 baseline before
import. Record reviewed differences, IDs, schema head, release/publication/draft
context and backup/export digests. A content import cannot reconstruct pre-existing
identity/deletion/allocation history that was never recorded; preserve the original
hashes and document that limitation. Do not silently promote experimental fixture
edits. Cutover acceptance includes one reviewed database-only edit/publication and
fresh export, retained full backup, rollback to an earlier compatible release
without deleting later content, and explicit prohibition of stale-JSON rollback.

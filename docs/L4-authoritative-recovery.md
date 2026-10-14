# L4 authoritative recovery preparation

Status: Step 6 implementation is in progress. Repository JSON remains authoritative.
The isolated rehearsal and export tools below do not authorize cutover, certify a
retained backup, or enable a hosted identity provider. The [L4 tracker](work/ongoing/L4-local-authoring-admin-access-plan.md#step-6--rehearse-authoritative-recovery-and-prepare-tooling)
owns acceptance and remaining gates.

## Small local backup policy

Before database-only authoring, choose one private folder outside the Docker data
volume and include it in an existing off-device backup. The existing ignored
`var/backups/postgres/` is a possible local staging folder, but a Git clone, Docker
volume, same-device copy or temporary rehearsal archive cannot recover a lost
machine. No new hosted service is required. Destination identifiers and successful
copy/restore dates belong in operator evidence; credentials and private artifacts
stay outside Git. Owner access only (0700 directories, 0600 files); protect the
independent copy with the backup destination's access controls/encryption.

Proposed schedule, awaiting destination acceptance: take a full custom-format dump
after each meaningful authoring session and each publication, and at least daily
on days when authoring. Retain 7 daily, 4 weekly and 3 monthly verified copies. Do
not prune the last verified recoverable copy. Copy each completed dump off-device
and record its digest, source schema head/release/publication/draft context and
copy time. Verify restoration before relying on a new destination and periodically
afterward. Content RPO is provisionally <=24h and RTO <=4h; measure the age of the
last independently recoverable copy and the complete recovery-to-service duration.
A disposable rehearsal's timing is compatibility evidence, not achieved RPO/RTO.

## Allocation safety is a separate gate

A dump contains counters, global identities and reservations as of its snapshot.
An ID issued afterward may have appeared in an editor/export even if its draft
was never saved. Restoring the earlier dump can reuse that ID. Content loss within
the RPO does not permit identity reuse.

Keep authoritative creates disabled until durable off-volume allocation protection
is implemented and tested. The proposed minimal mechanism is an operator-issued
numeric ceiling for each of `s/q/i/d/f`: persist protected ceilings independently
before allowing a bounded range of IDs to be issued. Restoration burns through
all previously permitted ranges, including unused IDs, before issuing another
range. An incomplete, older or missing fence fails closed. The evidence must also
survive loss of the device; periodic counter exports alone leave an unsafe window.
Ceilings require explicit environment/lineage binding, atomic durable recording,
concurrent range exhaustion tests and a database enforcement boundary. This
mechanism is **not implemented yet**. Neither session quarantine nor export digest
checks enforce allocation safety. Do not resume restored editor/operator allocation
merely because content parity passes. Pre-cutover fixture reservations remain
isolated experiments.

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
   Session invalidation revokes retained sessions and clears pending login
   transactions atomically. It preserves content, audit, operations and allocations.
   Rotate `MEDUCATION_ADMIN_EPOCH` in protected external configuration before any
   admin worker starts; do not restore that configuration from the old snapshot.
   Require a new login. A schema mismatch requires compatible code or an explicitly
   reviewed migration in the separate restored database.
5. Compare all content tables, draft/history, audit/operation/reservation records,
   counters/sequences and effective role privileges with recorded backup evidence.
   Independently reconstruct selected releases and validate paired exports. Compare
   the published pair through fresh learner readers. Reconcile the independent
   allocation fence; if it is unavailable, keep authoring disabled.
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
before session quarantine. Quarantine then invalidates old session/callback use
without changing content. Fresh readers and selected authored exports repeat
parity. Archives/credentials are temporary and cleaned. Retained-copy and
post-backup allocation reconciliation remain separate requirements.

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

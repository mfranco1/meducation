# Local authoritative authoring

The user approved the local PostgreSQL authority cutover on 2026-10-14 and
explicitly deferred off-device backups. The dedicated target is database
`meducation_authority` in container `meducation-authority-postgres`, volume
`meducation-authority-data`, PostgreSQL 17.11, loopback port 5433. It is separate
from the old optional Compose development database. Do not remove this volume.

The authenticated HTTP editor is the normal writable workflow. The paired JSON
files in `src/content` are the initial cutover exports/archives and explicit
read-only learner fallbacks. They become stale after database-only edits; checking
those files does not validate current authored content. There is no automatic
reimport, JSON editor fallback or write retry. Public learner progress stays in
browser storage. No hosted services were provisioned.

## Start and edit

Start Docker, then run these in two terminals from the repository root:

```sh
docker start meducation-authority-postgres
.venv/bin/python scripts/local-authoring/serve.py
```

```sh
MEDUCATION_API_PORT=8001 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/admin.html`. Sign in opens the **Local development
identity** confirmation. Confirm **Continue as local editor (development only)**.
The maintained OIDC/session/CSRF boundary verifies signed synthetic tokens;
confirmation simulates identity and fresh-factor assurance. It provides no real
MFA. The launcher binds only `127.0.0.1:8001`, uses a fixed loopback origin and
is never packaged in production images. Never expose this launcher through a
public tunnel. Production admin configuration still refuses the synthetic adapter.
Real hosted provider/MFA acceptance is a separate release gate.

Save draft persists the paired unpublished banks. Review/confirm publication
activates an immutable paired release. Undo/reset changes drafts, and activating
a retained release preserves later history. New IDs come from protected server
reservations. Reauthentication never silently repeats an interrupted write.

Private runtime credentials are in ignored `var/local-authority/runtime.env`;
owner/operator/bootstrap credentials are separately in `operator.env`. Both are
0600 beneath a 0700 directory. The API never receives owner/operator credentials.
Retain these files securely; database dumps do not include configuration or keys.
Use this launcher rather than the legacy JSON archive API startup command.

## Back up and check current content

After meaningful authoring sessions/publications and at least daily while editing:

```sh
.venv/bin/python scripts/local-authoring/backup.py
```

This creates a new 0600 full PG17 archive containing `content` and `admin_auth`,
checks its table of contents, and writes a checksum/context sidecar. It never
replaces earlier archives. Backups are retained under ignored
`var/backups/postgres/`, outside the Docker volume. Keep the initial cutover dump
and exports; manually retain 7 daily/4 weekly/3 monthly recovery points. No timer
or scheduled job was installed. Local copies protect against volume loss and
mistaken DB changes; they do not survive loss of this computer.

Allocation journals are in `allocation-primary/` and `allocation-local-copy/`
beneath that backup root. Both are local copies, explicitly not off-device.
Never delete, truncate or rewind them. Extend a range only through the explicit
migrator job; unused earlier range tails remain burned:

```sh
.venv/bin/python scripts/local-authoring/job.py allocation-range --primary var/backups/postgres/allocation-primary --independent var/backups/postgres/allocation-local-copy --local-copy-only --reason "Extend local authoring range; off-device retention deferred"
```

`--local-copy-only` is limited to the designated loopback authority with explicit
local configuration. It cannot be combined with an off-device attestation or
fixture rehearsal. Allocation remains fail-closed outside admitted ranges and
when restored/quarantined or journal evidence disagrees. If the entire host and
journals are lost, never resume allocations from an older DB alone.

Obtain current content explicitly rather than validating stale repository JSON:

```sh
.venv/bin/python scripts/local-authoring/job.py export-release --release-id RELEASE_UUID --output NEW_EXPORT_DIRECTORY
.venv/bin/python scripts/local-authoring/job.py validate-export --directory NEW_EXPORT_DIRECTORY --repository . --report NEW_VALIDATION_REPORT.json
.venv/bin/python scripts/local-authoring/job.py audit-export --directory NEW_EXPORT_DIRECTORY --repository . --report NEW_AUDIT_REPORT.json
```

Select the published UUID shown by the HTTP editor or an explicitly reviewed
retained release. Use HTTP paired export for a current draft. Trusted imports into
this authority require `--reviewed-recovery-import`; ordinary edits use HTTP.
Imports are privileged maintenance, not a way to replace DB-only work with a
stale archive. See the [recovery runbook](L4-authoritative-recovery.md).

## Recovery and verification

```sh
.venv/bin/python scripts/local-authoring/verify-backup.py
```

This first retains a new full local backup, then restores it into a uniquely named
`meducation_verify_cutover_*` database. It verifies exact tables/sequences/ACLs and
paired artifacts, quarantines copied sessions and allocations, reconciles copied
journals and proves allocations burn earlier admitted ranges. It also starts the compatible restored reader and rehearses retained-release
activation/return while preserving later releases. It removes only that
disposable verification DB. It never restores over or rewinds the authority.
The observed same-machine restoration time is evidence, not a hardware-loss RTO.

For real recovery, stop writers, restore into a fresh separate target, apply
explicit role grants, quarantine sessions, rotate the external auth epoch,
reconcile the latest complete journals, verify the app/schema/content and restart
compatible workers. Preserve the original target until the replacement is verified.
See [authoritative recovery](L4-authoritative-recovery.md#fresh-restoration-procedure).

`scripts/local-authoring/check.mjs` is the initial cutover browser check: it logs
in/out and compares the initial draft with the frozen JSON pair without editing.
It intentionally fails after genuine DB-only edits; it is not ongoing health or
permission to overwrite current content. `cutover.py` initializes only a new
target and refuses existing state/containers/volumes; never rerun it as recovery.
The one-use `finish-cutover.py` records the reviewed continuation of the initial
rehearsal interruption and refuses completed or changed revisions.

Development fixture JSON editing requires both `VITE_ADMIN_SOURCE=json` and
`VITE_JSON_FIXTURE_AUTHORING=true`; production builds always use HTTP authoring,
even if those variables are set. Fixture tests remain independent of this local
DB and credentials. Manual browser/device/accessibility and changed-source native
CI obligations remain in the ongoing trackers.

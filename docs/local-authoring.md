# Local authoritative authoring

The user approved the local PostgreSQL authority cutover on 2026-10-14 and
explicitly deferred off-device backups. The dedicated target is database
`meducation_authority` in container `meducation-authority-postgres`, volume
`meducation-authority-data`, PostgreSQL 17.11, loopback port 5433. It is separate
from the old optional Compose development database. Do not remove this volume.

The authenticated HTTP editor is the normal writable workflow. Repository JSON databases and offline modes are retired. There is no automatic
import, JSON fallback or write retry. Public learner progress stays in
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
This launcher validates the designated PostgreSQL target before starting its API.

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

### Verify a pinned published content candidate

After selecting the published UUID and completing `export-release`,
`validate-export` and `audit-export` above, run:

```sh
.venv/bin/python scripts/containers/verify-postgres-release.py --export-directory NEW_EXPORT_DIRECTORY --output NEW_PRIVATE_PARITY_REPORT.json
```

Use the operator `export-release` directory, with `manifest.json`,
`questionBank.json` and `flashcardBank.json`. The report must be a new path outside
that immutable directory. The harness snapshots and validates explicit inputs
before starting Docker; missing, corrupt, unpublished or mismatched inputs fail
without falling back to repository archives. Reports and temporary files are
private. It imports into a uniquely named/labeled disposable PG17 tmpfs cluster,
checks exact authored fields, optional presence, ordered IDs/choices, provenance,
serialized bytes, revisions and every learner route/conditional contract, then
re-exports and compares paired digests. It verifies the original export and its
verification code remain unchanged and removes only its owned fixture.

Source question/deck/card IDs remain exact; the disposable fixture has its own
release UUID and publication sequence. Source release/publication identity is
recorded separately from that fixture identity. No authority history, sessions,
grants or allocation lineage are cloned. This is paired-content parity, not a
full-authority backup/recovery rehearsal. It does not run writer retirement or
change the routine database. Recheck the actual publication in the HTTP editor
at handoff; an earlier pinned export can pass while a newer release is current.

The explicit `--small-fixture` recovery regression and its CI invocation remain separate. Do not
combine `--export-directory` with `--small-fixture` or application rollback image
arguments. Current private content and authority credentials are never CI inputs.

## Recovery and verification

```sh
.venv/bin/python scripts/local-authoring/verify-backup.py
```

This is an **offline writable recovery rehearsal**. A source-database advisory
lock admits one rehearsal across processes/checkouts until clone cleanup finishes.
It then checks, without
changing source grants or stopping workers, that operator/editor/session/migrator/
owner CONNECT access is retired and existing writer connections are drained.
Read-only reader/backup access can remain available. It refuses before taking a
backup or creating a target if writers can still connect. Use `backup.py` alone
for an online backup; perform offline retirement only as an explicit recovery
operation. The rehearsal then retains a new full local backup and restores it into a uniquely named
`meducation_verify_cutover_*` database. It verifies exact tables/sequences/ACLs and
paired artifacts, quarantines copied sessions and allocations, reconciles copied
journals and proves allocations burn earlier admitted ranges. It also starts the compatible restored reader and rehearses retained-release
activation/return while preserving later releases. It removes only that
disposable verification DB. It never restores over or rewinds the authority.
The command does not re-enable source writer access when it finishes; resume the
source only after verifying disposable-target cleanup. The observed same-machine
restoration time is evidence, not a hardware-loss RTO.

For real recovery, stop writers, restore into a fresh separate target, apply
explicit role grants, quarantine sessions, rotate the external auth epoch,
reconcile the latest complete journals, verify the app/schema/content and restart
compatible workers. Preserve the original target until the replacement is verified.
See [authoritative recovery](L4-authoritative-recovery.md#fresh-restoration-procedure).

The initial cutover's one-use creation/continuation scripts and archive-comparison
browser check are retired. They are not recovery workflows. Use retained full
backups and the explicit restore/quarantine/allocation-journal procedure for recovery.

Development and production editors both use authenticated HTTP access to
PostgreSQL. The old fixture JSON editor and its source flags have been removed;
remove `VITE_ADMIN_SOURCE` and `VITE_JSON_FIXTURE_AUTHORING` from old environment
files. Standard admin browser tests use an isolated disposable PostgreSQL database
seeded from synthetic fixtures, independent of this authority and its credentials.
Manual browser/device/accessibility and changed-source native CI obligations
remain in the ongoing trackers.

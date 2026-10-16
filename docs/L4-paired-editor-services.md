# L4 paired editor services

Current content-source policy: [ADR 0006](decisions/0006-postgres-only-content.md) supersedes historical JSON authority, read modes and file-based editor workflows below. PostgreSQL is the only runtime and writable source.

Step 4 adds private HTTP services behind the verified session boundary in
[L4 admin sessions](L4-admin-session-boundary.md). This is local backend acceptance;
the hosted identity adapter remains disabled. The [HTTP browser editor](L4-http-editor.md) now uses these services, with a
JSON adapter restricted to explicit development fixtures. The designated local
PostgreSQL database is the writable authority after the user-approved local
cutover; repository JSON is an export/archive. See [local authoring](local-authoring.md).

## Wire contracts

All routes are below `/api/admin`, excluded from public OpenAPI, session protected
and `no-store`. POSTs require the existing exact Origin and session CSRF header
before their body is read. Unknown fields, including browser actor/auth fields,
are rejected without echoing input. JSON bodies use the shared 64 MiB limit and
bounded validation diagnostics. Revision and publication sequence are decimal
strings; operation and release identifiers are canonical UUID strings.

- `GET /draft` loads one paired raw snapshot with draft/base/publication metadata,
  Undo availability and capabilities. Hydrated learner answer DTOs never replace
  the authored records.
- `POST /reservations` captures `operationId`, `expected` draft/publication,
  `reason`, per-kind `counts`, and `intent.slots`. Each slot supplies `kind`,
  `count`, and a `parentId` except root subjects. A parent must exist or be an
  owned same-context reservation under migration `0005_reserved_parents`. Kinds `s/q/i/d/f`
  represent subjects, quizzes, questions, decks and cards. Counts must exactly
  match slots. Reservations burn IDs independently of later save success.
- `POST /draft/preview` accepts the exact `pair` (`quizzes` and `flashcards`),
  expected context, reason, `reservationIds` and `intent.reservations`. Each
  binding repeats its `reservationId` and original slots. The server checks
  ownership, context and every newly created ID's destination. Preview returns
  validation evidence, artifact digests, bounded ordered affected IDs and a
  fingerprint bound to actor, action, content, reason, intent and context.
- `POST /draft/save` adds `operationId` and `previewFingerprint`. Both banks
  validate and commit under one increasing revision. Saving does not publish.
- `POST /draft/undo` identifies the current stack's `targetRevision` and expected
  context; `POST /draft/reset` selects the current publication explicitly. Both
  supply operation ID and reason. Undo restores one paired snapshot as a new
  revision. Reset records displaced content and starts a new Undo epoch.
- `POST /publish/preview` and `POST /publish` review and finalize the captured
  draft. Publish adds operation ID and fingerprint, creates a distinct authored
  release, activates it and advances draft revision/base in one transaction.
  A stale draft base returns conflict and requires an explicit reset; there is
  no automatic merge or fabricated file-import provenance.
- `POST /releases/{id}/activation-preview` and `POST /releases/{id}/activate`
  review/activate a finalized retained release against expected publication.
  Activation preserves the draft content/revision/base, retained releases and
  allocations; it invalidates the Undo epoch. Its impact compares publications.
- `GET /releases` lists bounded metadata with opaque cursor pagination (default
  20, maximum 50). `GET /operations/{id}` reconciles the verified actor's own
  operation. Repeating an identical operation returns its original committed
  outcome/snapshot even after subsequent changes. Reusing its ID with a different
  action, actor or request fails. The client must reconcile uncertain outcomes;
  sensitive mutations must not be automatically resent after reauthentication.

Initial draft setup remains an explicit trusted operator job. An uninitialized
revision returns conflict instead of importing repository content implicitly.
Creating children under owned same-context reserved parents permits one atomic
grouped save under migration `0005_reserved_parents`. Legacy client-generated IDs cannot
bypass reservations and are converted and re-previewed by the HTTP editor.

## Transactions, sessions and privileges

Migration `0004_editor_operations` adds immutable before/after paired history,
reservation intent/slot records and bounded ten-entry Undo control. Append-only
history outlives the active Undo stack. One global operation ledger/audit receipt
covers each mutation; failures, including deferred constraints at commit, roll
back draft/publication/history/audit/ledger together. Existing allocation receipts
remain burned. Release artifacts retain exact serialization and record order.

The request session connection holds `FOR KEY SHARE`; explicit activity commits
before protected work. Each editor SQL transaction independently checks and locks
the session `FOR NO KEY UPDATE`, compatible with the request lock and serialized
against logout/revocation. It then locks draft, active publication and Undo control
in that order. Validation occurs before mutation and freshness/expiry are checked
again before mutation and after SQL work before receipt finalization. Session connection failure returns a safe error. Publish,
activation, reset and export require a factor within fifteen minutes; save/Undo
require freshness when the server computes more than one deleted entity, including
cascades. Replays recheck current authorization and the original freshness rule.

`meducation_editor` can execute only the guarded dispatch/read/replay/create-check
functions. It cannot mutate tables directly, invoke internal unguarded primitives,
register/import arbitrary IDs, read authentication tables or assume ownership.
Deferred integrity checks run as their fixed-search-path owner, avoiding raw ledger
SELECT grants to the editor. Server session proof/epoch is never written into the
content ledger or export. Reader, session, operator and backup roles retain their
separate boundaries. API workers do not bootstrap or migrate.

## Exports and visibility

`POST /exports` selects either a retained release (`target: release`, `releaseId`)
or the captured draft (`target: draft`, `expected`, `draftRevision`). Fresh auth
is checked before and after validation/archive creation. A deterministic ZIP holds
both generated bank filenames and `manifest.json`, with fixed timestamps/modes and
ordering. Its manifest records IDs, exact artifact SHA-256/revisions, publication
context, policy version and warnings; draft exports are explicitly unpublished.
No session, token, key or actor material is exported. Total ZIP size including
headers is limited to 128 MiB; an 8 MiB spool spills to temporary storage and closes
after streaming. Export captures exact artifacts before streaming and never reads
changing database content mid-response. This is not a full database backup.

Request-driven PostgreSQL readers select one finalized paired view for the whole
response. Publication is visible on the next view without worker restart; a pinned
view retains its previous pair. Identical-digest rollback still advances publication
sequence. Learner routes never select drafts. JSON mode retains its existing
explicit replacement/restart behavior.

Full authored-history recovery, post-backup allocation protection, off-device
retention, hosted identity/routing acceptance and new native CI remain later L4 gates.

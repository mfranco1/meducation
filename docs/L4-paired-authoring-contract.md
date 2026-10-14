# L4 paired authoring and private HTTP contract

Selected 2026-10-14 for [L4 Step 1](work/ongoing/L4-local-authoring-admin-access-plan.md#step-1--freeze-the-paired-editor-and-access-contracts).
This specifies subsequent implementation; no routes, authentication, durable
history or authority cutover are enabled by this document. Canonical JSON remains
authoritative until the separately approved Step 7 cutover. Follow
[ADR0004](decisions/0004-single-editor-authentication.md) and
[ADR0005](decisions/0005-paired-content-releases-and-postgres-schema.md).

## Existing flows and replacement boundary

- `src/admin/AdminApp.tsx` constructs the bundled in-memory gateway. Its initial
  flashcard state, workspace refs and deletion review keys call
  `getFlashcardBank()` synchronously. `appliedOperations()` and
  `coordinatedOperationCount()` drive export, dirty state and paired Undo barriers.
  Replace these reads with fields from one asynchronously loaded paired snapshot.
- `src/admin/useAdminEditor.ts` owns quiz record text, single/bulk/import previews,
  reason history, discard confirmations and local downloads. Existing version-2
  record/bulk/import operations preserve ordering through `afterId`, full stored
  records and coordinated replay. Keep these pure helpers, with server validation
  as the commit boundary. Quiz-only SHA revision becomes a content digest, never
  the concurrency token for a paired draft.
- `src/admin/FlashcardAdminPanel.tsx` owns a separate bank, ten-entry local history,
  record/bulk/import text and generation/subject/export-context preview guards.
  It communicates through synchronous bank/workspace callbacks and exports quiz,
  flashcard and coordinated manifest files. Replace bank/history ownership with
  the shared controller/gateway; retain browsing and text state in presentation.
- Subject deletion currently cascades both banks through `applyCoordinated`, with
  quiz operation-count barriers before paired Undo. Quiz/deck deletions and
  multi-item/card deletions review descendants and reasons. The HTTP editor has
  one paired save and one paired Undo even for edits to a single section; no
  intermediate orphan references may become a saved snapshot.
- `src/admin/core/templates.ts` and `bulkAddDraft.ts` allocate quiz/subject/item
  IDs using maximum currently present numeric suffixes. Flashcard single creates
  use `crypto.randomUUID()`; `flashcardBulkAddDraft.ts` accepts an ID factory with
  the same default and collision checks. All four paths must use reserved server
  IDs in DB mode. UUID operation identifiers are separate from entity identifiers.
- In-memory quiz Undo keeps ten batches; reset returns the constructor bank and
  clears history/operations. Flashcard reset restores its bundled bank, with
  shared-subject checks and a coordinated reset when independent resets fail.
  Exports are downloads, never canonical writes. DB reset instead restores the
  currently published pair, and export never clears unpublished state.
- Keep import-file/paste, all contextual bulk destinations, exact record/choice
  ordering, sparse fields, original and verified answers, navigation confirmations,
  hidden-section guards and responsive keyboard behavior. Legacy imports carrying
  client-generated creates cannot bypass authoritative allocation (see below).

## Paired state and editor semantics

The loaded snapshot is a single consistent server read of:

- `contractVersion: 1`, `pair: { quizzes, flashcards }` containing stored schema-v4
  and schema-v2 objects without hydrated defaults or text normalization.
- `draft: { revision, baseReleaseId, basePublicationSequence, digests }`.
- `publication: { releaseId, sequence, digests }`, with null release/digests and
  sequence `"0"` before initial publication; draft base uses the same convention.
- `undo: { available, targetRevision, depth }` and `capabilities` for reserve,
  preview, save, undo, reset, publish, activate and export, plus actions requiring
  renewed authentication. Capabilities are derived by the server; every request
  reauthorizes even if its cached capability was true.

Revisions/sequences are nonnegative decimal strings on the wire (Postgres bigint
must never round through JavaScript Number). Release and operation identifiers
are UUIDs; entity IDs retain their existing spelling. `digests` contains raw
SHA-256 hex artifact checksums plus the existing `quizRevision` and
`flashcardRevision` runtime identities with their `sha256-` prefix. Preserve
L3's shared-subject contribution to the flashcard revision; the flashcard artifact
checksum alone does not identify its shared subject catalog. Use the existing
cross-runtime serializer, preserving object key insertion order, two-space
indentation, Unicode and one final newline. They identify content, not publication
events. Identical content after
reactivation has a new publication sequence. Draft revision always increases,
including Undo, Reset and publication. A base release is resolved from its
publication event; callers cannot select a contradictory base release.

There are three distinct visible states: **Unsaved edits** for in-memory JSON/text
or an assembled candidate, **Saved draft · unpublished** for committed paired
content differing from the published pair, and **Published** for the active pair.
Both sections show the shared save/publication status. Rename Stage to **Save
draft** in HTTP mode; preview never saves content. Save and Undo do not publish.
Export/download completion does not mean saved, published or backed up.

Changing destination/record preserves the current discard safeguards; changing
section retains its mounted text and dirty guards. Publishing requires saving
or explicitly discarding all unsaved edits in both sections first. Reset/Undo
show the paired impact and obtain discard confirmation for affected local text.
Failure, session expiry and conflict retain that text. A same-origin login
completion window refreshes session/CSRF state without replacing the editor page.
Refresh invalidates previews; the user reviews and confirms again. Nothing
automatically resends a protected write after authentication.

## HTTP operations

All content routes below live under `/api/admin`, require the exact verified
editor session, return private `Cache-Control: no-store` responses and use the
ADR0004 session/Origin/CSRF boundary. All POSTs, including previews and exports,
require exact Origin and a session-bound CSRF header. Actor/issuer/subject never
appear as accepted request fields; the service supplies them from the principal.
Reject unknown envelope keys, duplicate JSON keys, null for omitted fields,
non-finite numbers, invalid UTF-8 and unpaired surrogates before domain parsing.

- `GET /session`: public bootstrap status only: unauthenticated or authenticated,
  expiry/freshness status and CSRF bootstrap token appropriate to that state.
  It discloses no private content and does not extend idle lifetime. Anonymous
  CSRF initialization is browser-bound. `POST /auth/login`, `GET /auth/callback`,
  `POST /auth/reauthenticate` and `POST /auth/logout` implement ADR0004; redirect
  destinations are fixed same-origin configuration, never browser-supplied URLs.
- `GET /draft`: the complete paired snapshot above. An uninitialized draft returns
  `409 draft_uninitialized`; initialize via an explicit operator job, not GET.
- `POST /reservations`: `operationId`, `expected`, `reason`, `counts` keyed by
  `s/q/i/d/f`, and structured `intent` describing destination and create slots.
  Returns reservation UUID, allocated IDs, intent digest and captured context.
  Count total is 1–10,000. Reservations commit independently, remain burned after
  cancellation/failure, and bind verified actor, intent and revision/publication.
  A stale request is rejected before allocation. No reservation retargeting.
- `POST /draft/preview`: `expected`, exact `pair`, `reason`, `reservationIds` and
  `intent` for newly allocated slots. Returns a save preview fingerprint,
  validation diagnostics, counts and ordered affected IDs for review. It does
  not change draft/operation history or allocate IDs. A reserved bulk preview can
  therefore burn IDs even if the user never saves.
- `POST /draft/save`: same candidate/context/reason/reservations/intent plus
  `operationId` and `previewFingerprint`. Revalidates the pair and preview binding,
  creates one paired revision and returns operation result plus snapshot.
- `POST /draft/undo`: `operationId`, `expected`, `targetRevision`, `reason`.
  Target must match the current server-advertised top of the paired Undo stack;
  restores one pair as a new revision and returns snapshot. Never accepts a
  caller-supplied historical pair. No redo in this scope.
- `POST /draft/reset`: `operationId`, `expected`, `reason`; after paired review,
  restores the exact current publication, advances revision and clears Undo
  eligibility. With no publication it returns `409 publication_required`.
- `POST /publish/preview`: `expected`, `reason`; captures the saved pair and
  returns a publish fingerprint, digests and diff/counts against the current
  published release. Returns `409 draft_base_stale` when draft base differs.
- `POST /publish`: `operationId`, `expected`, `reason`, `previewFingerprint`.
  Requires fresh MFA, locks/captures and revalidates the saved pair, creates an
  immutable authored release, activates it and advances draft base/revision in
  one transaction. Even identical content gets a new authored release identity
  and publication event. Never invokes the trusted file importer.
- `GET /releases?cursor=...&limit=...`: at most 50 releases per page (default 20),
  newest first with UUID, digests and publication/audit summaries. Bounded opaque
  cursor; no auth/session data. `POST /releases/{releaseId}/activation-preview`
  accepts `expected`, `reason`, captures current pointer and target and returns
  fingerprint/diff. `POST /releases/{releaseId}/activate` adds `operationId` and
  `previewFingerprint`, requires fresh MFA and advances the publication sequence.
  It preserves draft content/revision/base and all later releases/allocations.
- `POST /exports`: fresh MFA, `target` explicitly selecting a draft revision or
  immutable release UUID; draft selection also carries `expected`. Streams a
  deterministic paired archive and manifest containing contract/schema versions,
  target identity, digests, publication/base context and validation policy/result.
  A draft is labelled unpublished; a retained release is not labelled current
  unless captured as such. No tokens/sessions, no full DB backup claim. Capture
  one pair before output; a write during streaming cannot mix banks.
- `GET /operations/{operationId}`: authenticated result lookup, same actor only.
  Returns action, fingerprint and immutable result for a committed operation;
  `404 operation_not_found` otherwise. No raw SQL, draft bodies or another actor's
  ledger contents. This request does not extend interactive idle lifetime.

`expected` is `{ draftRevision, publicationSequence }` in every draft/reservation/
preview/publish/reset/undo request; it also guards the draft state shown in an
activation confirmation. Save of an out-of-date-base draft is allowed only when
the caller knows the current publication sequence and retains the existing draft
base. It preserves work while publication stays blocked. Reset is the selected
resolution in L4; automatic merge/rebase is absent. Activation can leave the draft
out of date without rewriting it. Every mutation rechecks context under locks.

Use a provisional 64 MiB uncompressed request ceiling and 128 MiB export ceiling;
the measured pair is about 16.3 MiB before envelope escaping. Step 2 must measure
worst-case accepted envelope/export representation, field/collection/depth limits
and parser budgets and prove proxy/API parity before enabling these endpoints.
Do not truncate accepted content or treat these ceilings as resource acceptance.
Bound reasons to 2,000 characters, UUID lists to 10,000, diagnostic responses to
200 issues with `totalIssues`/`truncated` and paged review details to 100 IDs.
Preview response limits cannot hide whether validation failed. Avoid returning
the complete pair in preview responses; the caller already holds its candidate.

## Durable Undo and recovery evidence

Add a private append-only paired draft snapshot history in a packaged migration,
with revision, exact deterministic artifacts/digests, base release/sequence,
verified actor, reason, operation UUID and history epoch. Keep history in full DB
backups; it never includes browser text. Retain all committed snapshot evidence
for L4 (no pruning); expose only the last ten saved batches in the current epoch
as Undo candidates. This preserves the existing ten-batch user bound while audit
and displaced content remain recoverable. Measure storage before future retention
changes in L5; release/ledger/allocation/audit rows remain append-only.

Save pushes the prior pair; Undo consumes that top entry and records a new
snapshot without pushing a redo entry. Reset/publication starts a new epoch and
clears eligible history atomically. Activation changes publication context and
invalidates Undo eligibility and every preview even if digests are identical;
old history remains evidence, never available through an old tab's cached target.
Reset records the displaced draft before replacing it. No deletion of audit,
reservation or operation evidence accompanies any of these actions.

## Preview fingerprints and operation replay

Use server-generated versioned SHA-256 fingerprints with domain-separated action
names. For candidate saves, hash deterministic artifacts, exact reason, sorted
unique reservation UUIDs, structured allocation intent, verified actor, expected
revision/current publication and stored draft base release/sequence. Preserve
array order, Unicode strings and omitted fields in artifacts; never normalize
medical text. Object formatting can be deterministic without changing content.
Include validation-policy version. Publish fingerprints instead use the captured
saved pair/context; activation includes target release and current pointer.
Editing either bank, reason, reservations or context invalidates the preview.
The client must also invalidate pending preview responses when local text changes.
Server recomputation is authoritative; fingerprints are not bearer permissions.
No database transaction stays open while a human reviews.

Every mutating action has one browser-generated UUID retained with its exact
request until resolved. The global durable ledger binds action, verified actor,
exact normalized request fingerprint (including preconditions and preview) and
original result in the same transaction as its effects. Identical UUID/input
returns the original result after authorization, even after newer writes; it must
not move a newer pointer or return a fabricated current snapshot as its original
result. Changed input/action/actor returns `409 operation_reused`. Replay result
includes the original revision/sequence; reload current state separately. Check
ledger replay before new context checks, while still checking live session and
freshness requirements. Failed transactions commit neither effects nor successful
ledger/audit outcomes; earlier independently committed reservations stay burned.

After timeout/disconnect, disable new dependent writes, retain text and original
UUID/request, query operation status and reload authoritative state. A not-found
lookup may race with an in-flight transaction; it does not prove failure. A user
may explicitly resend the identical request/UUID after reconciliation; the ledger
serializes it against any original commit. Never create a replacement UUID simply
because a response was lost. After stale context or changed request, require a new
preview/confirmation for the genuinely new operation. Read retries remain bounded;
generic automatic write retries are removed from the admin transport.

## Validation, imports, errors and access

The server validates the final pair for stored structure, shared subjects, IDs,
global/sibling order, source/verified answer references, sparse fields and the
shared rich-content/math/image policy. It never repairs invalid input silently.
Accept full paired candidates rather than trusting client operation expansion;
derive affected-record/deletion summaries server-side. Fresh MFA is required for
any bulk destructive save, Reset, publish, activation and full private export.
The server derives destructiveness from current/candidate pairs (multiple deleted
records or any parent cascade), never from a browser action label. Undo also needs
fresh MFA if its derived diff is bulk destructive. Ordinary single-record saves
still require a live editor session.

Version-2 import files are parsed and replayed locally into a paired candidate.
An import containing any new entity ID without a matching owned, current
reservation is rejected with `422 reservation_required`, even if that ID exists
in a historical release but is absent from this draft. Explicit conversion of
legacy creates is deferred; the user can recreate them using content-only bulk
input, obtain reservations and re-preview. Updates/moves preserve IDs. Historical
resurrection is available only through server-controlled Undo/Reset/release
activation; it must not masquerade as an arbitrary imported create. The service
checks creation ownership/intent beyond L3's materialized-ID registry checks.

Errors use `{ error: { code, message, requestId, issues? } }`; issue paths start
at `$.pair.quizzes` or `$.pair.flashcards`. Return 400 malformed envelope, 401
missing/expired/revoked session, 403 wrong editor/CSRF/Origin or fresh-auth-required,
404 unavailable target/result, 409 stale draft/publication/base/preview/Undo or
UUID reuse, 413 byte ceiling, 422 content/reservation policy, 429 rate limit and
503 dependency/session-store failure. Messages expose actionable paths and safe
codes without echoing tokens, content, claims, SQL, credentials or stack traces.
Structured internal logs use request/operation UUIDs, never raw request bodies.
Authorization precedes private lookup/validation details. Public learner reads
ignore admin cookies, remain published-only and use a separate reader role.

Backend `auth/` owns identity/assurance/session protection; focused admin modules
own bounded contracts, validation orchestration and services; `db/` and packaged
migrations own locks, history, ledger and privileges. Frontend admin `data` owns
transport/decoding/CSRF, `core` owns pure candidates/state rules, composition owns
session UX. Shared validation stays in content policy modules, never React.
Do not expose owner/operator credentials or importer functions to the editor.

## Foundation gaps and acceptance handoff

Inspection of L3 `operations.py` and `0001_operations.sql` establishes that
reservations commit independently, ledger replay compares action/payload/actor/
reason, draft save checks revision and reserved creates, and activation checks
sequence. Reservations currently record expected context without comparing live
context at allocation. Save permits any known base sequence, and reservation
consumption checks context but not a verified principal or structured creation
intent. There is no durable paired Undo, private HTTP validator/session boundary
or dedicated authored publication. Generic SQL error wrapping cannot classify
the HTTP error contract; add safe typed service/SQL outcomes. L4 must close these
gaps; historical L3 tests are not acceptance of L4 security behavior.

Step 2 owns measured limits and parser policy/parity before dependency selection.
Step 3 owns least-privilege sessions and all ADR0004 negative cases. Provider-neutral
injected identity can prove local behavior only. No production provider adapter
is accepted: tenant MFA mapping, effective policy, forced fresh factor challenge,
client authentication and recovery evidence remain hosted gates. Recheck official
documentation and clean Python 3.14 compatibility when selecting/pinning libraries;
no provider dependency or weakened MFA exception is selected in Step 1.

Step 4 must test real PG17 stale/concurrent contexts, operation replay/lost
responses, reservation ownership, forbidden importer access, ten-batch paired
Undo, activation invalidation, reset displacement and atomic authored publication.
Step 5 must exercise all inventoried flows through the actual proxy, two tabs,
expiry/logout/cancelled step-up, hidden dirty sections and keyboard/layout gates.
Steps 6–7 own retained recovery/allocation evidence and separately approved
authority cutover. No step may infer those gates from this contract.

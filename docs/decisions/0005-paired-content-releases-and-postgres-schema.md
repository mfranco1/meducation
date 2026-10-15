# 0005 — Paired content releases and Postgres schema

Date: 2026-10-13. Status: L3 Step 3 schema and transactional enforcement implemented and locally verified; paired file importer/exporter implemented; paired learner adapters implemented; actual-bank parity/recovery and PG browser acceptance verified with passing native AMD64/ARM64 CI. Gate: [L3 Step 1](../work/done/L3-postgres-schema-migration-parity-plan.md#step-1--record-schema-identity-and-consistency-decisions).

## L3 final verification follow-up — 2026-10-14

The user-linked [GitHub run 38427563502](https://github.com/mfranco1/meducation/actions/runs/38427563502)
was independently verified through public API metadata: all five jobs succeeded,
including both native container acceptance jobs, at the local source commit
`b7703172c5ab9efb82af715ff9d2047913b6ff15`. Current owner docs describe implemented
JSON/Postgres read modes and operator commands. Earlier pending/native-only
statements and frozen stage snapshots below remain historical.

The [L4 handoff](../L4-authoring-handoff.md) records required authenticated gateway,
backend rich-validation parity, reservation-backed authored publishing, atomic
draft advancement and durable recovery before authority cutover. This verification
does not enable private editing, change canonical authority or certify hosting.

## Step 6 local acceptance follow-up — 2026-10-14

The [isolated operator commands](../../backend/README.md#actual-bank-parity-and-isolated-recovery-acceptance)
now verify the actual paired content and every learner route before and after a
backup-role dump/fresh owner restore. All table/state/sequence fingerprints and
canonical bytes matched. The PG proxy/browser suite proves unchanged backend
switches preserve active study/checkpoints/history and changed publication uses
the existing explicit restart flow. Real socket termination and aborted reader
transactions return unavailable responses and reconnect cleanly.

Native acceptance invokes these commands on both architectures; its expensive
container browser suite runs once in PG mode. Local ARM64 evidence is recorded in
[Step 6 evidence](../work/done/L3-step6-parity-recovery-evidence.json); the new
AMD64/ARM64 GitHub runs are unverified, so Step 6 stays open. The temporary archive
is acceptance data, not off-device retention or a production RPO guarantee.
No source authority, private HTTP authorization or hosted provisioning changed.

## Step 5 implementation follow-up — 2026-10-13

`repositories/source.py` defines an injectable paired source/view; JSON keeps its
startup-loaded pair and legacy path-factory test seam. `repositories/postgres.py`
implements both learner protocols over one response-scoped reader connection.
`main.py` obtains all subjects/catalogs/bodies from that view and no longer owns
a process-lifetime subject snapshot. The dependency closes after complete
synchronous response construction and before sending the response.

Every content request reads the pointer/sequence and both revisions in one query,
pins a finalized release, and filters all catalog/body SQL by that ID. Catalogs
contain subjects/quizzes/decks and ordered membership IDs, keyed only by immutable
release. Retain at most the two highest observed publication sequences' releases;
old-release reactivation updates the observed sequence and reuses immutable data.
There is no active-pointer cache or background polling to invalidate. Evicted
catalogs remain referenced by in-flight views. Models returned to callers are
copies, and body queries read normalized rows rather than TEXT artifacts.

SQL/connection and model-decoding failures return sanitized `content_unavailable`
503 without cached JSON/catalog fallback. Initialization still requires supported
head and active release, with no worker DDL/import. Liveness/readiness use process
state without SQL. Startup failure/shutdown disposes the same bounded engine.
Fixture tests prove all existing endpoints, status/cache/error precedence, body
publication races, shared-subject flashcard digests, rollback reactivation,
cache bounds and catalog/body/connect failure cleanup. Comprehensive actual-bank,
reverse-proxy/browser and recovery evidence remain Step 6.

Step 4's GitHub build passed per user confirmation; no URL supplied. New Step 5
native AMD64 CI is not certified by local ARM64 evidence. JSON remains canonical
and default, with no authoring or authority cutover. The
[Step 5 evidence](../work/done/L3-step5-reader-evidence.json) records current
source hashes and passing commands separately from frozen prior stages.

## Step 4 implementation follow-up — 2026-10-13

The [operator workflow](../../backend/README.md#paired-content-import-activation-and-export)
now captures each paired file once (64 MiB per-file limit), rejects ambiguous
JSON/invalid stored contracts/unpaired Unicode surrogates, and invokes the
existing TypeScript stored/domain/rich-Markdown/flashcard policy on private copies
of those captured bytes. No bundled canonical module is imported by that gate.
Source hashes refer to original bytes; TEXT artifacts retain parsed key order and
optional-field presence. Both validators finish before an import transaction.

`validate-pair` needs no DB configuration. `import-pair` uses only the explicitly
configured operator and returns release identity without activating. `activate`
requires a separate operation UUID and expected publication sequence; replay does
not move a later pointer. Jobs preserve actor/reason and never print content,
credentials or SQL. Import validation requires a checkout with Node dependencies;
the production learner image gains no Node or runtime authoring policy.

Export independently reconstructs all collections from rows/global ordinals,
checks typed leaves/key sets/array order against artifacts, reorders object keys
using the artifacts only as templates, and validates exact bytes and both
revision algorithms. A read-only repeatable snapshot supplies publication context
for an external v1 manifest. Output must be a new directory; ordinary write
failure removes that newly created output, and the manifest written last is its
completion marker. Process-crash residue is incomplete and must not be mistaken
for a valid export. No source file or existing output is overwritten.

The policy boundary intentionally remains an intersection of validators. Python
and SQL enforce stored shape/relationships/provenance, while TypeScript adds
rich-Markdown and trimmed reviewed-draft notes. Whitespace conventions differ
between runtimes; passing Python alone is not authoring acceptance. Fixture cases
exercise rich-policy rejection, Unicode/Markdown/math/newlines, raw shape,
capture/replay/failure/concurrency, cross-parent global order and corrupt exports.
L4 still needs backend-only policy parity before accepting browser writes.
Canonical captured-file validation passed with 32 retained review warnings; no
actual bank was imported here. Comprehensive reconstruction/API parity and
backup-role recovery remain Step 6. [Step 4 evidence](../work/done/L3-step4-transfer-evidence.json)
records current commands, hashes and local results separately from frozen Step 3.

## Step 3 implementation follow-up — 2026-10-13

Packaged Alembic head `0001_content` creates the selected schema in one explicit
owner transaction. Its SQL resources are the schema source of truth;
`db/operations.py` is a bound SQLAlchemy transaction facade rather than a second
ORM schema. No canonical content is imported by migration and no private HTTP
route is added. JSON remains authoritative and the working learner source.

The granted operator functions are `store_release`, `activate_release`,
`reserve_ids` and `save_draft`. Storage inserts and finalizes the complete pair in
one call; partial builders are not exposed. Callers may combine storage and
activation in one transaction. Draft reset is a validated save at a new revision;
L4 must compose publication with draft advancement and enforce authorization and
stale base policy. Reservations commit independently before review/apply.

A shared `operations` ledger fingerprints action, payload, actor and reason
across all four functions. Identical replay returns the original result;
conflicting UUID reuse fails. Deferred checks prevent incomplete operations or
building releases from committing. `entity_ids.materialized` distinguishes
unconsumed allocations from established identities and can only advance; first
use requires the owning reservation and its matching draft/publication context.
Registry rows, reservations, audit/import/publication history and finalized
content cannot be removed by operational roles. Counters cannot rewind.

Finalization compares independently reconstructed normalized JSONB with both
parsed TEXT artifacts, checks ordinals and stored contracts, and verifies exact
Python-compatible pretty serialization and both revisions using built-in PG17
SHA-256. Ordered traversal preserves array/object order, including reordered
subject input keys, while subject digest fields remain `id,name,accent`.
Duplicate keys, JSON null and noncanonical artifacts are rejected. SQL structural
validation is exercised against the shared stored-contract fixtures; the full
rich-content gate on captured files remains Step 4, and backend authoring policy
parity remains L4. [PG17 hashing](https://www.postgresql.org/docs/17/functions-binarystring.html).

The reader receives only selected finalized views, schema version and active
pointer. The operator has diagnostic SELECT and only the four write functions;
PUBLIC execution and direct operational DML are denied. SECURITY DEFINER uses a
fixed trusted search path with `pg_temp` last. Row-write triggers lock the release
before changing children; deferred triggers require completed finalization at
commit. The trusted owner/migrator can change this enforcement.
[Function security](https://www.postgresql.org/docs/17/sql-createfunction.html),
[deferred triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html).

Destructive downgrade is refused, including through the revision itself. For a
disposable test use a fresh database; schema recovery requires a compatible
app/schema plan or a separate restored database. Content rollback activates a
retained release and never resets IDs or deletes history. Full backup-role
real-content restore acceptance remains Step 6, not a Step 3 claim.

[Step 3 evidence](../work/done/L3-step3-schema-evidence.json) records 58 passing
real-PG17 fixture cases, installed-wheel migration/role smoke, default JSON API
regression and full project verification on native Linux ARM64 containers. The
native acceptance runner now invokes these cases on both architectures; current
Step 3 AMD64 CI execution is not certified by this local result. Prior Step 2 CI
passed on user confirmation. Actual-bank import/export/API and recovery gates
remain pending.

## Context and authority

The [current read-only API](../../backend/src/meducation_api/main.py) indexes two canonical JSON files at startup. Its quiz and flashcard repositories share subjects but have distinct content revisions. Learner progress is browser-local. [ADR0003](0003-local-postgres-toolchain.md) selects ordinary PG17, synchronous SQLAlchemy/Psycopg, explicit migrations and separate operator/runtime credentials.

L3 imports validated copies of both files into Postgres and serves the existing public contracts. `src/content/questionBank.generated.json` and `src/content/flashcardBank.generated.json` remain authoritative. Import never edits them. The API defaults to JSON; explicit Postgres mode fails on bad configuration, missing schema/content or connection errors, with no automatic JSON fallback.

L4 must explicitly change authority after authenticated paired drafting/publishing, tooling and real-content backup/restore acceptance. Until then, real edits use the reviewed JSON workflow; draft experiments use disposable copies. Following cutover, Postgres is authoritative and JSON is an export/archive, never an independently writable canonical source. An old bundled export cannot recover newer DB-only edits. This ADR does not authorize cutover, hosted provisioning or private HTTP endpoints.

## Identity and version vocabulary

- **Migration head:** Alembic's schema revision; startup checks the supported head once. It is independent of content identity.
- **Bank versions:** question schema 4 and flashcard schema 2; retain their current stored shapes.
- **Release ID:** generated UUID for one immutable complete bank pair, including shared subjects. It is an internal identifier, never an entity ID or public content revision.
- **Quiz revision / flashcard revision:** the existing `sha256-<hex>` digests with the exact serialization inputs described below. Equal input retains equal revision across JSON/DB mode and release reactivation.
- **Publication sequence:** increasing database-assigned bigint identifying a committed activation event. The singleton pointer contains `(release_id, publication_sequence)`. Initial unpublished state is `(NULL, 0)`; committed activations have non-null release and positive sequence. Gaps are acceptable; restored databases may have an earlier sequence, so discard process caches on restoration/restart.
- **Draft revision:** increasing bigint for the singleton draft; save/reset/publish requires the expected revision. A reset increments revision rather than recreating it at zero. Base release and base publication sequence identify what the editor started from. L4 must reject a stale base publication on publish even when rollback returned to the same content digest.
- **Operation ID:** UUID supplied once by the trusted operator/backend command, with a fingerprint of its intent. Retried identical operations return their recorded result; conflicting reuse fails.

## Relational schema

Use schema `content`. Column names below use snake_case internally; stored/exported and API fields retain current camelCase. All timestamps are `timestamptz`, generated by the backend/DB, and never substituted for authored strings. UUIDs identify internal operations/releases; stable entity IDs remain text.

### Releases and source artifacts

`releases` contains `release_id` PK, state (`building` or `finalized`), both bank schema versions, both API revision digests, `quiz_artifact` and `flashcard_artifact` TEXT, `created_at`, `finalized_at`, and originating operation ID. The artifacts are the validated pretty-serialized documents, not JSONB. A unique constraint on the two revisions makes repeated imports reuse the same pair; on a collision, compare exact artifacts and reconstructed content and reject any mismatch rather than assuming digests prove equality.

`import_events` is append-only, with operation ID PK, fingerprint, release FK, captured source-file byte hashes, operator identity, nonempty reason and time. Distinct original whitespace can produce a new import event referencing the same release; it does not create another publication. Exact replay of the same operation creates no extra event. Future authored releases may have no file import event.

A building release exists only within its creation transaction. Finalization checks both stored validators, cross-bank references, ordinal contiguity, nested choice/answer references, artifact reconstruction and hashes before changing state. Commit only finalized releases; enforce this with a deferred constraint trigger. Learner-visible views include only finalized release rows. Initial migration may leave zero releases and an unpopulated active pointer; explicit import/activation precedes DB-mode API startup.

Step 2 startup uses `content.schema_version`, a reader-visible view of the Alembic version marker, and `content.published_releases`, a finalized-release view, together with the active pointer. Step 3 creates/grants these views; readers never receive write access to migration metadata. No product revision exists during Step 2, so its explicit upgrade command refuses to mutate the database.

### Version-scoped content rows

Each entity table has `release_id`, stable `id`, `position`, PK `(release_id, id)`, FK to `releases` with restricted deletion, and UNIQUE `(release_id, position)`. Positions are zero-based global array indices for that table, never inferred from IDs. Require nonnegative positions and contiguous `0..count-1` at finalization. Global order also defines filtered per-parent order; no additional mutable parent ordinal is needed.

- `subjects`: `name`, `accent` TEXT, both required. This is the shared subject registry.
- `quizzes`: `subject_id`, `name` TEXT; composite FK `(release_id, subject_id)` to subjects.
- `questions`: `quiz_id`, `stem`, `rationale` TEXT; `choices` JSONB array; optional `answer`, `verified_answer`, `answer_note` TEXT; optional `rationale_meta`, `choice_explanations`, `pearls`, `metadata` JSONB; composite FK `(release_id, quiz_id)` to quizzes.
- `decks`: `subject_id`, `name` TEXT, optional `description` TEXT; composite FK `(release_id, subject_id)` to subjects.
- `flashcards`: `deck_id`, `front`, `back` TEXT, optional `sources`, `review_note` TEXT; composite FK `(release_id, deck_id)` to decks.

SQL NULL represents omission of an optional field and is omitted on reconstruction. It never represents an authored JSON null. Preserve an explicitly present valid empty string/array/object separately from SQL NULL; do not use truthiness to decide presence. JSONB values must have their declared object/array type and contain no JSON null at stored field paths where prohibited. Stored validators enforce their detailed allowlists; metadata cannot be an empty object. Do not hydrate domain defaults into exported data.

Choices stay an ordered JSON array of `{id, text}` objects. Preserve source `answer` and `verifiedAnswer` separately; scoring still resolves verified first. Rationale metadata dates/notes remain exact strings. Do not trim content, normalize Unicode/newlines, coerce text or regenerate IDs on ingestion. Required nonblank fields, ID formats, schema versions and basic JSON types receive SQL checks; full nested/review/rich-content validation remains a required finalize/save operation. Constraints are not a substitute for the content validator.

Indexes cover `(release_id, subject_id, position)` on quizzes/decks and `(release_id, quiz_id, position)` / `(release_id, deck_id, position)` on questions/cards. These support canonical parent reads and foreign keys. No learner progress, precomputed count, subject-name copy, external media bytes or redundant question subject reference is stored.

### Draft, publication and audit

`draft` is one row keyed by singleton `true` with a CHECK preventing other keys. It stores nullable initial `base_release_id`, `base_publication_sequence`, monotonic `revision`, `quiz_document` / `flashcard_document` TEXT and updated time. Choose validated paired documents for this one-editor mutable workspace, rather than duplicating every release table for drafts. Text preserves key order and optional presence; save parses both and validates the pair. The base publication is zero only before any activation. L3 provides the primitive and fixture tests; L4 adds the authorized gateway and actual editor identity.

Draft undo/reset restores documents in a new revision. It cannot delete reservations, releases or audit. Publish reconstructs normalized rows from the captured draft, finalizes the new pair, updates the active pointer and appends events in one transaction, then advances the draft base/revision. Reuse of an already-finalized identical pair is allowed without rewriting its rows. These primitives have no public write route in L3.

`active_publication` is another singleton row containing the release/sequence pair. `publication_events` is append-only, with sequence PK, release FK, prior sequence, operation ID UNIQUE, operator, reason and timestamp. Serialize activation by locking the singleton row `FOR UPDATE`, verify expected prior sequence, allocate event sequence, insert event and update pointer in one transaction. A composite FK from the pointer's non-null `(sequence, release_id)` to an event's matching pair prevents split state. Check both-null initial state versus published state as defined above.

An activation request requires operation ID, expected sequence and finalized target. Replaying the operation returns its original event even if later publications occurred; it must not reactivate the release. A new explicit reactivation, including rollback to old content or the current pair, receives a new sequence. Import without activation never moves the pointer. Stale, unknown or incomplete targets fail atomically.

`audit_events` is append-only with UUID PK, unique `(operation_id, event_type)`, trusted actor descriptor, action, reason, optional release FK, optional draft revision and bounded structured detail. Import/finalize/activate/draft operations append their audit in the same transaction as the action. Allocation-only audits belong to the independently committed reservation transaction. Source content, credentials and session tokens do not belong in audit detail. In L3 actors are explicitly identified local operators, not asserted authenticated browser identities; L4 uses verified issuer/subject under ADR0004.

## Stable ID allocation and import reconciliation

`entity_ids` registers `(kind, id)` forever, with allocated/imported origin, allocation operation FK where applicable and first-seen time. `kind` is one of `s`, `q`, `i`, `d`, `f`; enforce kind/prefix consistency. Release rows reference the matching registry kind/ID using fixed-kind checks and composite FKs. A registry entry remains when an entity disappears from the draft or any later release.

`id_counters(kind PK, next_number)` supplies decimal suffixes under row locks. Counters use bounded bigint; generated suffixes are positive and at most JavaScript's safe integer maximum, and exhaustion fails rather than wrapping. Never use max of the current draft/release as allocation authority. `id_reservations` records operation ID PK, creation-intent fingerprint, expected draft/base context and ordered allocation result. Generated IDs use the existing prefixes; imported opaque `d`/`f` IDs remain unchanged and registered. Only a canonical positive decimal suffix contributes to a counter seed; opaque IDs still block exact collisions. Lock multiple kinds in fixed `s,q,i,d,f` order.

Reservation is a short, independent transaction: check idempotency, lock requested counters, insert registry entries, advance counters, record ordered result and audit, commit. Return the same IDs on identical preview/apply retry. A changed creation intent needs a new operation ID; later updates of the created entity retain its ID. A stale draft may consume a reservation that is never applied; those IDs remain burned. Failed apply/publish rolls back content, not a previously committed allocation. Do not reserve while holding a draft/publication lock, and do not hold a DB transaction open during user review.

Import creates registrations for unseen canonical IDs and advances counters under the same kind locks in the import transaction. Failed imports roll back these new registrations. Known established IDs in another canonical release mean the same logical entity and may contain intentional edits/moves; reservations not yet materialized may only be used by their owning create operation. Rollback activation performs no allocation/registry mutation.

An importer cannot infer from changed text whether a human reused an established ID for a different entity. L3 accepts reviewed canonical identity continuity, records provenance, and rejects conflicts with outstanding reservations; it does not claim to detect semantic ID reuse. At L4 cutover, import historical known IDs when available and seed from all retained releases/reservations before enabling server allocation. Missing pre-DB deletion history is an explicit limitation; no invented IDs or silent renumbering repairs it. Later JSON imports are restricted recovery/migration operations, never an alternative authoring channel.

## Serialization and revision preservation

The compatibility source is the [Python JSON adapters](../../backend/src/meducation_api/repositories/question_bank.py), [quiz serializer](../../src/admin/core/serializeBank.ts) and [flashcard serializer](../../src/admin/core/flashcardSerialization.ts), with shared Unicode/contract fixtures. Use their current behavior rather than introducing sorted-key hashing.

1. Quiz artifact: parsed raw quiz document serialized with Python `json.dumps(ensure_ascii=False, allow_nan=False, indent=2)` plus one LF. Hash UTF-8 bytes and prefix `sha256-`. Whitespace of the original input file is not this revision input; record its byte hash separately.
2. Flashcard artifact: the same pretty serialization of the raw flashcard document plus LF.
3. Shared-subject digest input: ordered subjects serialized from `Subject.model_dump()` (current field order `id`, `name`, `accent`) using `ensure_ascii=False`, `allow_nan=False`, separators `(',', ':')`. Flashcard payload is exactly `flashcards-v2\n` + this compact subject string + `\n` + flashcard artifact, including its terminal LF.

Retain artifacts as immutable TEXT because JSONB loses object key insertion order. Reconstruct each bank from scalar columns, JSONB values and global ordinals. Use the parsed artifact only as an object-key ordering/presence template, recursively: verify the exact key sets, array lengths and typed scalar values against independent reconstructed data, reorder reconstructed object keys to the template, and serialize using the existing algorithm. Arrays come from stored ordinals/JSON arrays and must match; never substitute artifact leaves, repair a mismatched row, fill an absent field from the template, or ignore extra keys. The resulting bytes must match the artifact exactly before export/finalization/parity acceptance.

The new importer captures bytes once and rejects duplicate object keys and non-finite JSON numbers before validation; it must not rely on a permissive parser silently dropping duplicated authored fields. Source hashes, validation and artifacts all refer to that captured input. This stricter import boundary does not rewrite canonical files or change the existing learner serializer.

This makes artifacts compatibility evidence, not a second writable content source. Learner bodies/counts/order come from normalized rows. Revisions stored on finalized releases are verified during creation/parity and immutable thereafter. Fresh DB startup may verify finalized state/head without reconstructing every record on every request. A stored digest alone is not proof of import/restore correctness.

No new stored numeric content fields are introduced: the bank schema numbers are integers; authored numbers/units are text. Cross-runtime serializer edge cases must have shared tests before accepting any future numeric extension or changed serializer. Imported artifact key ordering is retained even when it differs from the conventional export order; a subject's input key order must not alter the current Python model-based subject digest input.

## Transactions, permissions and reads

The owner/migrator is a privileged trusted maintenance boundary and can change enforcement. Operational writer privileges must not allow direct mutation of protected finalized content, audit, registry or publication state. Use fixed-search-path, narrowly granted database functions for registry allocation, activation and draft mutation; revoke PUBLIC execution and reject unqualified/dynamic identifiers. For release construction, expose controlled insertion/finalization functions to the operator writer, with triggers rejecting updates/deletes of finalized releases and all their child rows. Serialize writes/finalization by locking the release row so a concurrent child insertion cannot race its finalization. Deferred finalization checks reject committed building rows. No grants or triggers pretend to constrain the owner/superuser.

Bootstrap roles/settings follow ADR0003. `meducation_reader` has SELECT only on published-release views (and active-publication/publication metadata needed for reads), no draft/audit/import/allocator access and no write-function execution. A finalized historical release remains readable by release-pinned backend operations; public routes still choose the current pointer. `meducation_backup` reads all content tables and sequences for dump but has no DML/DDL. `meducation_operator` executes only L3 import/finalize/activate/reservation functions and reads needed diagnostic/export state; it has no DDL/role creation or arbitrary table DML. `meducation_editor` and private identity integration arrive in L4. Migration connections may SET ROLE to the NOLOGIN owner; runtime cannot. Default privileges must cover future objects/views/functions, not only the first migration.

Application validation occurs before the controlled insertion operations; finalized-artifact parity and stored relational checks occur before commit. SQL checks/triggers do not yet replicate the complete rich-Markdown authoring policy. L3 imports must run the existing TypeScript paired content gate against the exact captured input plus Python structural validators. L4 must implement and exercise backend policy parity before accepting browser writes, rather than treating authenticated input as validated.

For a content request, the paired source opens one request-scoped synchronous view: read pointer/sequence once, select that finalized release, and pin its ID/digests for both repository adapters. Every query includes the selected release ID, including subjects, ownership tests, summaries and bodies. Immutable rows and no release deletion make ordinary READ COMMITTED sufficient for subsequent queries; publication changes cannot mix content. Do not hold row locks or use a new pool per adapter. Release the session/connection in `finally` on success, 304, 404, 409 and exceptions, using a dependency lifetime covering complete synchronous response construction.

Caches contain immutable data keyed by release ID, never an unversioned process-lifetime subject list. Initially cache at most the current and one preceding release per worker; eviction affects only cache references, not in-flight pinned views. Select the pointer on each content request with no background SQL polling. A new publication sequence invalidates active-selection caches even when the digest repeats. L5 may later measure and change freshness/query costs; startup/recurring health routes must not become keepalive DB traffic.

Across requests the existing public `revision`, If-Match, If-None-Match, ETag, no-cache and error-precedence contracts remain. A mismatch produces existing 409/reload behavior; endpoints do not serve arbitrary old releases to satisfy stale revisions. Loaded active study data stays pinned in the browser under its existing content-signature rules. DB failure returns an intentional unavailable response, not partial catalogs, HTML fallback or silently stale JSON.

Activation/import/publish and their audit are atomic. Controlled jobs require explicit target DB and operation IDs; migrations never run in worker startup. Shutdown and failed startup dispose the single shared engine. Schema/content readiness is initialized once; liveness/recurring readiness use process state and do not prove continuous DB reachability.

## Ownership and implementation sequence

- `backend/src/meducation_api/repositories/question_bank.py` continues to own stored models and learner protocols initially. Shared serialization/validation may be extracted into focused backend content modules when both adapters require it, without changing frontend owners.
- `backend/src/meducation_api/db/` owns engine/session creation and bound transactional calls; packaged migration SQL owns tables/functions; Postgres repository adapters belong in `repositories/`. Routes depend on protocols/views, not ORM entities.
- Paired-source composition and cleanup belong in backend application wiring; settings owns source selection and redacted connection configuration.
- Alembic environment/version files belong in `backend/src/meducation_api/migrations/`, with packaged migration resources verified in the installed wheel/image. Step 2 places them within the existing package so editable installs and installed wheels use one resource path without a second copy or checkout dependency. A focused backend operator CLI owns migrate/import/activate/export/parity invocation; `scripts/containers/` owns local orchestration/PG17 tools.
- Backend fixture/integration tests remain in `backend/tests/`; shared stored-contract cases remain in `tests/fixtures/`. Actual-bank parity is an explicit read-only-source command against disposable DBs, separate from normal fixture tests.

Do not create empty modules for this design step. Steps 2–6 implement and test this schema in small slices. L4 owns HTTP admin gateway/session authorization, stale-preview/undo behavior and authoritative DB authoring. L5 owns broader outage/load/multi-worker/operator tuning. Domain/frontend learner interfaces, browser progress and content schemas gain no database-provider dependency.

## Verification and recovery obligations

Step 1 observational evidence is recorded separately in the [L3 tracker](../work/done/L3-postgres-schema-migration-parity-plan.md). A serializer/key-order probe or architecture graph pass validates design inputs; it does not prove Postgres constraints, SQL privileges, migrations, atomicity or runtime parity.

Implementation gates require PG17, not SQLite: empty/repeated migrations; least-privilege direct SQL attacks; cross-release FK/ordinal/finalization violations; concurrent reservation/import/activation; immutable finalized rows/audit; failed paired import with unchanged active state; draft isolation; reordered-key/omission/Unicode/choice/provenance parity; all API routes/status/cache rules; publication during reads and old-release reactivation; connection cleanup and unavailable responses.

Run actual-bank reconstruction/API parity separately, preserving source byte hashes, with exact mismatch paths. Rehearse PG17 dump/fresh restore using separate backup/migration roles and reapply deliberate ownership/ACLs because portable `--no-owner --no-acl` dumps omit them. Verify artifacts, normalized rows, active sequence, drafts/audit, reservations/counters and schema head after restore. Keep database caches/processes fresh after replacement; a restore can rewind allocation state, so before resuming authoritative authoring reconcile all post-backup allocation/import events from recoverable operator records or block new allocations until recovery resolves them. RPO-limited recovery must not quietly claim a never-reuse guarantee for lost reservations; L4 must settle durable off-volume allocation evidence with its backup contract before cutover.

Content rollback only activates a retained finalized release; it never deletes newer releases or resets counters/draft history. Destructive Alembic downgrade is refused; use a fresh disposable database for tests. Production schema recovery uses a compatible app/schema plan or fresh-DB restoration with protected source/backup copies. Immutable release deletion/garbage collection is deferred; no automatic pruning in L3.

## Consequences

Paired immutable releases make request consistency and rollback explicit while retaining existing learner revision behavior. Global ordinals and TEXT artifacts cost storage but avoid content drift caused by parent grouping, JSONB key ordering or serializer changes. A single paired-document draft is sufficient for one editor and reuses the existing bank validation/export model.

The price is controlled database write functions, release immutability checks and dual representation parity tests. These are required for the promised import/read safety, not a distributed workflow system. Provider identity, publication UX, DB-authority recovery and hosted acceptance remain later gates. No database implementation is certified by this decision alone.

## L4 internal authoring extension — 2026-10-14

Migration `0002_authored_publish` extends the preserved L3 schema with reviewed
paired saves and captured authored publication. Every authored publication creates
a distinct immutable release and append-only authored receipt, including repeated
content digests. File imports still deduplicate to the earliest matching release
and keep file provenance separate. Publication, draft base/revision, operation
result and audit commit together. Shared rich-content validation precedes the
transaction; locked exact-artifact/context comparisons reject stale captures.
Only trusted operator execution is currently granted. Browser authentication,
private HTTP exposure, durable history/reset and authority cutover remain L4 gates.

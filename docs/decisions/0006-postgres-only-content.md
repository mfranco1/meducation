# PostgreSQL-only content delivery and authoring

Date: 2026-10-15. Status: implemented; local acceptance passed, current native CI pending.

The designated PostgreSQL database is the only writable authority and runtime
source for the paired quiz/flashcard bank. This supersedes the JSON service,
offline learner mode and file-authoring portions of earlier decisions; their
schema, stable-ID, provenance and deterministic export contracts remain.

Learners read request-pinned published PostgreSQL releases. The authenticated
HTTP editor owns normal CRUD with server-reserved IDs, validation, concurrency
preconditions and operation reconciliation. Saving a paired draft does not publish.
Paired undo/reset, publication, retained activation and database-derived exports
remain explicit server operations. Failure never selects a file fallback.

The repository corpus archives, frontend local adapters, bundled QA entry,
JSON editor, per-section file replacement/import/replay and local content history
are removed. Stored schema models, pure compilers, validation/rendering policies
and browser-local learner progress remain. JSON is still the API/input/export
format; an export is not an alternate database. Privileged reviewed recovery
imports write only to PostgreSQL and never run at startup.

Tests use small synthetic fixtures. Browser/container tests seed disposable
PostgreSQL with separated role credentials; fast response tests may inject
explicit test-owned protocol doubles. Current-content acceptance selects a fresh
protected database export and checks independent route expectations, artifacts,
IDs, exact text/order/optional fields/provenance and revisions. Fixture passes
cannot certify authority currency.

Current images contain no authored bank archives. Compose requires a configured
reader connection; DB bootstrap/migration remain explicit jobs. Existing named
volumes and the designated authority are not recreated by this retirement.
Recovery still requires retained full dumps, session quarantine, an admitted
allocation fence and complete independent journals. Off-device retention and
hosted identity acceptance remain separately deferred.

Removing the archives saves 17,109,825 tracked working-tree bytes. Existing Git
history retains prior versions; no history rewrite is included. Frontend bundles
already excluded the corpus, so their reduction comes from removed editor code.

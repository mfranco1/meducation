# 0006 - PostgreSQL-only content delivery and authoring

Status: accepted and implemented. Supersedes the JSON service, offline learner mode and file-authoring parts of ADR 0002, 0003 and 0005; their schema, stable-ID, provenance and deterministic export contracts remain.

## Context

Content was once authored in repository JSON and served from files, with PostgreSQL as an alternate reader. Two writable sources invite stale overwrites.

## Decision

The designated PostgreSQL database is the only writable authority and the only runtime source for the paired quiz and flashcard bank.

- Learners read request-pinned published releases. The authenticated HTTP editor owns record CRUD with server-assigned IDs, validation and version preconditions. Saving a draft record does not publish; revert, discard, publication, retained activation and exports are explicit server operations. Failure never selects a file fallback.
- Repository corpus archives, frontend local adapters, the bundled QA viewer, the JSON editor, file import and local content history are removed. Stored schema models, compilers, validation and rendering policies, and browser-local progress remain.
- JSON stays the API, input and export format. An export is read-only inspection or recovery material, never an alternate database.
- Tests use small synthetic fixtures seeded into disposable PostgreSQL with separated role credentials; fast response tests may inject test-owned protocol doubles. Checking current content means validating a fresh protected export; fixture passes do not certify the live database.
- Images contain no authored bank archives. Compose requires a reader connection; bootstrap and migration are explicit jobs.

## Consequences

Content survives only through database backups and session quarantine ([operations](../operations.md#backup-and-restore)). An older snapshot must never replace database-only work. Git history holds the retired file-based workflows.

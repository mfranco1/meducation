# 0005 - Paired content releases and PostgreSQL schema

Status: implemented. The JSON-authority and file-fallback statements of the original design are superseded by [ADR 0006](0006-postgres-only-content.md).

## Context

Quizzes and flashcards share subjects and must publish together. Learners need one consistent view per request, reversible publication, stable IDs that are never reused, and byte-stable revisions.

## Decision

- **Releases.** A release is an immutable, finalized pair of banks (quiz schema 4, flashcard schema 2) identified by a UUID. It stores the two validated documents as TEXT artifacts plus normalized rows. Quiz and flashcard revisions stay `sha256-` digests of the existing pretty-printed serialization. Finalization checks relationships, ordinals and artifact reconstruction. Storing a pair whose revisions match an existing release reuses that release.
- **Rows.** `content` schema tables `subjects`, `quizzes`, `questions`, `decks`, `flashcards` are keyed `(release_id, id)` with composite foreign keys and a contiguous zero-based global `position`. SQL NULL means an omitted optional field, never an authored null. Nothing is trimmed, normalized or regenerated.
- **Publication.** A singleton pointer holds `(release_id, publication_sequence)`; activation locks it, checks the expected sequence and appends an event. Every activation, including rollback to old or identical content, gets a new sequence. Replaying an operation returns its original event. Storing a release never activates it.
- **Draft.** Per-record draft tables with versions, a change history and a base release ([content management](../content-management.md#record-api-and-publication)). Publish builds both documents from the rows, validates the pair, stores a release and activates it in one transaction.
- **IDs.** Subject, quiz and question IDs come from sequences that never move backward; the maximum ID in any release or the draft bounds them, and `advance-id-sequences` restores that bound after a restore. Decks and cards use UUID-based IDs.
- **Operations and audit.** A global operation ledger with fingerprints makes release store and activation replayable; audit, import and publication histories are append-only.
- **Privileges.** Release writes go through fixed-search-path, narrowly granted SQL functions. The reader sees only published views; the editor writes only draft tables and calls the release functions; the owner and migrator are trusted maintenance boundaries.
- **Reads.** Each content request reads the pointer once and pins one release for all queries. Catalogs are cached by release (two latest per worker). Existing revision and ETag contracts remain; failures return an unavailable response, never stale files.
- **Migrations.** Alembic migrations in `backend/src/meducation_api/migrations`; destructive downgrade is refused.

## Consequences

Global ordinals and TEXT artifacts cost storage but preserve order and serialization exactly. Controlled SQL functions are the price of immutability and safe replay. A restored database can rewind the ID sequences, so recovery advances them before admitting new IDs ([operations](../operations.md#backup-and-restore)). Pinned `release_id` rollback never deletes newer releases or resets counters.

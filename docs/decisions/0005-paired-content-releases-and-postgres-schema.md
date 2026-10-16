# 0005 - Paired content releases and PostgreSQL schema

Status: implemented. The JSON-authority and file-fallback statements of the original design are superseded by [ADR 0006](0006-postgres-only-content.md).

## Context

Quizzes and flashcards share subjects and must publish together. Learners need one consistent view per request, reversible publication, stable IDs that are never reused, and byte-stable revisions.

## Decision

- **Releases.** A release is an immutable, finalized pair of banks (quiz schema 4, flashcard schema 2) identified by a UUID. It stores the two validated documents as TEXT artifacts plus normalized rows. Quiz and flashcard revisions stay `sha256-` digests of the existing pretty-printed serialization. Finalization checks relationships, ordinals and artifact reconstruction. A unique pair of revisions makes repeated trusted imports reuse the same release.
- **Rows.** `content` schema tables `subjects`, `quizzes`, `questions`, `decks`, `flashcards` are keyed `(release_id, id)` with composite foreign keys and a contiguous zero-based global `position`. SQL NULL means an omitted optional field, never an authored null. Nothing is trimmed, normalized or regenerated.
- **Publication.** A singleton pointer holds `(release_id, publication_sequence)`; activation locks it, checks the expected sequence and appends an event. Every activation, including rollback to old or identical content, gets a new sequence. Replaying an operation returns its original event. Import never activates.
- **Draft.** One private paired-document draft with an increasing revision and a base release and sequence. Save, undo and reset create revisions; publish finalizes a new authored release, activates it and advances the draft in one transaction, rejecting a stale base.
- **IDs.** `entity_ids` registers `(kind, id)` forever for kinds `s q i d f`; `id_counters` supply suffixes; reservations commit independently and replay idempotently. Failed or abandoned operations burn IDs. Migration `0006_allocation_fence` bounds new IDs to admitted ranges recorded in two hash-chained journals.
- **Operations and audit.** A global operation ledger with fingerprints makes mutations replayable; audit, import, publication and reservation histories are append-only.
- **Privileges.** Roles use fixed-search-path, narrowly granted SQL functions. The reader sees only published views; the editor cannot write tables; the owner and migrator are trusted maintenance boundaries.
- **Reads.** Each content request reads the pointer once and pins one release for all queries. Catalogs are cached by release (two latest per worker). Existing revision and ETag contracts remain; failures return an unavailable response, never stale files.
- **Migrations.** Packaged heads: `0001_content`, `0002_authored_publish`, `0003_admin_sessions`, `0004_editor_operations`, `0005_reserved_parents`, `0006_allocation_fence`. Destructive downgrade is refused.

## Consequences

Global ordinals and TEXT artifacts cost storage but preserve order and serialization exactly. Controlled SQL functions and parity tests are the price of immutability and safe replay. A restored database can rewind allocation, so recovery must reconcile journals before admitting new IDs ([operations](../operations.md#backup-and-restore)). Pinned `release_id` rollback never deletes newer releases or resets counters.

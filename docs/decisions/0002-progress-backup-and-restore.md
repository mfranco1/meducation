# 0002 - Progress backup and restore

Status: implemented.

## Context

Quiz and flashcard progress live in two `localStorage` keys (`meducation.progress.v2`, `meducation.flashcards.progress.v2`). Learners need to keep a copy or move progress between browsers without a backend. The audience is small, so the design favors little code over cross-tab transactions.

## Decision

- **Format.** One JSON object: `format: "meducation-progress-backup"`, `version: 1`, `exportedAt`, `quiz` and `flashcards` (schemaVersion 2 payloads). Storage revisions and running timers are omitted; restored timers are paused. Backups can contain question text, so they are not safe to publish. There is no merge: restore replaces both stores.
- **Validation.** The uploaded file is a trust boundary: size is checked before reading, JSON is parsed once, the tree is walked iteratively, unknown fields and `__proto__`/`constructor`/`prototype` keys are rejected, and exact allowlists, semantic checks and ceilings apply (`progressBackupCodec.ts`). Export runs the same validator.
- **Restore.** Validate, preview, wait for confirmation, read the raw values of both keys, write both new values (with fresh revisions), and on any write error put back both previous raw values and report that nothing changed. On success, reload with a success announcement.
- **Other tabs.** No lock or journal. Other tabs see the change through `storage` events and the repositories' stale-revision check, which asks them to reload.

## Consequences

A crash between the two writes, or a failed rollback, can leave one store replaced; the app cannot detect this, and a known-good backup fixes it. A leftover `meducation.progress.restore.v1` key from older builds is ignored. Behavior is described in [product](../product.md#progress-backup-and-restore).

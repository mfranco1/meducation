# 0002 - Progress backup and restore

Status: implemented for Chromium and WebKit.

## Context

Quiz and flashcard progress live in two `localStorage` keys (`meducation.progress.v2`, `meducation.flashcards.progress.v2`). Learners need to keep a copy or move progress between browsers without a backend. A restore must not leave one store replaced and the other not, or corrupt progress on interruption.

## Decision

**Format.** One JSON object with exactly `format: "meducation-progress-backup"`, `version: 1`, `exportedAt` (canonical UTC ISO), `quiz` (schemaVersion 2 payload) and `flashcards` (schemaVersion 2 payload). Storage revisions, running timers and `completedAt` on active attempts are omitted; all restored timers are paused. Durable counts, scores, activity and completed IDs are preserved rather than rederived. IDs, timestamps and flashcard local dates are kept unchanged; restore regenerates revisions and never replays completions. Active quiz content signatures are copied exactly, so backups can contain question text and are not safe to publish. There is no merge: restore is full paired replacement.

**Validation.** Check file size before reading, parse once, walk the tree iteratively, reject unknown fields and `__proto__`, `constructor`, `prototype`, and apply exact allowlists and semantic checks. Ceilings: 4 MiB input and canonical output, depth 16, 250,000 values, IDs at most 128 bytes, quiz signatures at most 512 KiB, 200 retained attempts, 64 active quizzes, 1,000 responses per attempt, 50,000 completed IDs, 128 flashcard checkpoints. Timestamps use exact `toISOString` form. Live export runs the same validator and fails explicitly instead of repairing anomalous local data.

**Coordination.** A same-origin Web Lock `meducation.progress.coordination.v1`: each initialized document holds a shared lease while it reads or writes progress. Backup capture, restore and journal recovery take an exclusive lease (non-blocking; busy means "close other tabs and retry"). Ordinary saves stay synchronous after admission. Pagehide saves the quiz and releases the lease; pageshow revalidates, and a persisted return reloads. Browsers without Web Locks can browse but cannot persist or back up.

**Restore journal.** One extra key, `meducation.progress.restore.v1`, holds `operationId`, `decision` (`original` or `imported`), the complete original raw strings (or null) and the complete imported target strings. Sequence under the exclusive lease: re-read and compare to the preview baseline; write and verify the prepared journal; write and verify both targets; flip `decision` to `imported` (the logical commit point); verify the pair; delete the journal; rehydrate and rejoin. Recovery acts only on the recorded decision (restore originals or complete targets), is idempotent, and with a malformed journal or a third value preserves all bytes and blocks study. A raw recovery file (fixed keys only, up to 64 MiB) can be downloaded and is never accepted as a backup.

## Consequences

Backups are personal, unauthenticated statistics, not trusted content. The lock protects cooperating tabs only; old builds and malicious same-origin scripts are not fenced, so the UI tells users to close other tabs. Quota pressure can block a restore, which then leaves the original untouched. Behavior is described in [product](../product.md#progress-backup-and-restore).

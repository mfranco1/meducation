# Progress backup and recovery

Progress stays in this browser and origin. Use **Progress backup** in the learner navigation to keep a JSON copy or move quiz and flashcard progress to another browser. Clearing site data removes the local copy. A browser download does not prove that the file was saved elsewhere.

## Download and restore

1. Save and leave any active quiz or flashcard session. Close other Meducation tabs, including tabs running older builds.
2. Open **Progress backup**, then **Download backup**. Keep the file private: unfinished quiz signatures can contain question text and choices.
3. To restore, choose a backup file and review its date, saved quizzes/decks, retained attempts and recorded completion totals. Durable totals can exceed the retained history.
4. Download the current backup first when offered. **Restore backup** explicitly replaces both progress stores; it never merges. Empty backups clear saved progress and show a warning.
5. Keep the tab open during restoration. After a verified replacement, the app reloads, announces success and focuses the Quizzes dashboard. Cancelling before restoration preserves saved progress.

Version 1 backups use nested schema-v2 quiz and flashcard records. Storage revisions are omitted and regenerated on restore; saved timers remain paused. Unknown or removed content IDs and local flashcard calendar dates are preserved. Resume still uses the existing changed-content restart rules. Backups are untrusted personal statistics, not authenticated records.

The ordinary file limit is 4 MiB, with additional field, container and semantic limits defined by the [backup ADR](decisions/0002-progress-backup-and-restore.md). Oversized or malformed data is rejected without pruning saved progress. MIME and filename extensions do not bypass validation. No upload or backend request carries the backup.

## When an operation fails

- **Another tab is open:** close it and retry. A suspended or background tab can retain participation. The app does not force another tab's lock.
- **Progress changed after preview:** choose the file again to review a fresh replacement target.
- **Storage space/access failure:** preserve the existing file and saved browser data. Fix storage access/space and retry. The app never evicts progress to fit its journal. It may allow browsing while disabling persistent study and restore.
- **Previous operation needs recovery:** keep the browser's data intact and close other tabs before retrying. A valid journal chooses the exact original or imported pair from its persisted decision, then verifies both values before cleanup. Repeating recovery cannot add completions.
- **File/download API unavailable:** the affected action is disabled with guidance; otherwise usable study remains available.

Browsers without usable Web Locks can browse readable content but cannot persist study progress or perform normal paired backup operations. [Application acceptance](work/ongoing/L0-browser-acceptance.md) records verified engines and remaining release checks.

## Raw recovery copies and manual diagnosis

The recovery screen and corrupt-progress preview can download a separate raw recovery file containing only the fixed quiz, flashcard and journal values. Its encoded limit is 64 MiB. It is never accepted by the normal importer. A boot capture lacks exclusivity and is labelled potentially inconsistent; repeated reads only reject observed changes. Failed reads are reported rather than represented as missing values.

For a malformed journal or conflicting third value, automatic recovery preserves bytes and remains gated. There is no automatic discard-journal/reset action. A known-good ordinary backup can be restored in another browser while retaining the original browser's data and raw recovery copy.

Developer diagnosis must work on copies:

1. Keep the downloaded raw file unchanged and make a working copy. Treat strings as data; never execute them or paste them into application code, logs or telemetry.
2. Verify the raw format/version, fixed key names and string/null values. Parse the copied journal using `decodeProgressRestoreJournal`; its imported pair must pass strict validation. A missing value is distinct from a failed read.
3. Load the copied values into an in-memory storage port or an isolated disposable browser profile. Run `recoverProgressPair` with exclusive ownership of that copy. Preserve the persisted original/imported decision; never infer it from partial progress or switch it merely to obtain a preferred result.
4. If the journal is invalid or a value matches neither recorded pair, stop automatic replay. Compare the copy with separately retained known-good backups and diagnose the conflict. Do not overwrite the original browser while investigating.
5. If copied recovery converges to valid progress, use `encodeBackupFromProgressPair` to create and revalidate an ordinary backup. Test importing that derivative file in an isolated browser before using it. Corrupt originals can be recovered exactly without becoming valid study data; in that case keep the raw copy and use a known-good backup.

Destructive site-data clearing is outside recovery and cannot be described as lossless. Real mobile file transfer, assistive technology and Safari lifecycle checks remain public-launch gates.

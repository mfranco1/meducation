import { emptyProgress, decodeProgress, progressKey } from './progressCodec';
import { decodeFlashcardProgress, flashcardProgressKey } from './flashcardProgressCodec';
import type { FlashcardProgressState } from '../domain/flashcardStudy';
import type { ProgressPair } from './progressRestore';
import { encodeProgressBackup, summarizeProgressBackup, type ProgressBackupSummary } from './progressBackupCodec';
import { progressRestoreJournalKey } from './progressKeys';

export const RAW_PROGRESS_RECOVERY_FORMAT = 'meducation-progress-recovery-raw';
export const RAW_PROGRESS_RECOVERY_MAX_BYTES = 64 * 1024 * 1024;

export type ProgressBackupExportResult =
  | { ok: true; json: string; summary: ProgressBackupSummary }
  | { ok: false; error: 'corrupt-progress' | 'invalid-progress' };
export type RawProgressRecoveryResult = { ok: true; json: string } | { ok: false; error: 'too-large' };

/** Exact JSON string size, including controls and lone surrogates, without allocating an escaped copy. */
function rawJsonBytes(value: string | null): number {
  if (value === null) return 4;
  let size = 2;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point === 0x22 || point === 0x5c || [8, 9, 10, 12, 13].includes(point)) size += 2;
    else if (point < 0x20 || (point >= 0xd800 && point <= 0xdfff)) size += 6;
    else size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (size > RAW_PROGRESS_RECOVERY_MAX_BYTES) break;
  }
  return size;
}

/** Preserve exact fixed-key values; size-check before allocating their escaped JSON output. */
export function encodeRawProgressRecovery(
  pair: ProgressPair,
  capturedAt = new Date().toISOString(),
  journalRaw: string | null = null,
  mayBeInconsistent = true,
): RawProgressRecoveryResult {
  const recovery = {
    format: RAW_PROGRESS_RECOVERY_FORMAT, version: 1, capturedAt, mayBeInconsistent,
    quizKey: progressKey, quizRaw: null as string | null,
    flashcardsKey: flashcardProgressKey, flashcardsRaw: null as string | null,
    journalKey: progressRestoreJournalKey, journalRaw: null as string | null,
  };
  const size = new TextEncoder().encode(JSON.stringify(recovery)).byteLength
    + rawJsonBytes(pair.quiz) + rawJsonBytes(pair.flashcards) + rawJsonBytes(journalRaw) - 12;
  if (size > RAW_PROGRESS_RECOVERY_MAX_BYTES) return { ok: false, error: 'too-large' };
  return { ok: true, json: JSON.stringify({ ...recovery, quizRaw: pair.quiz, flashcardsRaw: pair.flashcards, journalRaw }) };
}

export type RawProgressCaptureResult =
  { ok: true; json: string } | { ok: false; error: 'unavailable' | 'changed' | 'too-large' };

/** Best-effort fixed-key capture for boot recovery; repeated reads catch observed mutations only. */
export function captureRawProgressRecovery(
  storage: Pick<Storage, 'getItem'>,
  capturedAt = new Date().toISOString(),
): RawProgressCaptureResult {
  try {
    const read = () => ({
      quiz: storage.getItem(progressKey),
      flashcards: storage.getItem(flashcardProgressKey),
      journal: storage.getItem(progressRestoreJournalKey),
    });
    const first = read();
    const second = read();
    if (first.quiz !== second.quiz || first.flashcards !== second.flashcards || first.journal !== second.journal)
      return { ok: false, error: 'changed' };
    const encoded = encodeRawProgressRecovery(
      { quiz: first.quiz, flashcards: first.flashcards },
      capturedAt,
      first.journal,
      true,
    );
    return encoded.ok ? encoded : { ok: false, error: encoded.error };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

/** Read the browser's fixed recovery keys without exposing storage access to app/UI modules. */
export function captureBrowserRawProgressRecovery(capturedAt = new Date().toISOString()): RawProgressCaptureResult {
  try {
    return captureRawProgressRecovery(localStorage, capturedAt);
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

const emptyFlashcardProgress = (): FlashcardProgressState => ({
  schemaVersion: 2,
  revision: 'initial',
  checkpoints: {},
  completionCounts: {},
});

/** Decode an exclusive raw pair; absent keys mean empty, malformed bytes never do. */
export function encodeBackupFromProgressPair(
  pair: ProgressPair,
  exportedAt = new Date().toISOString(),
): ProgressBackupExportResult {
  let quiz;
  let flashcards: FlashcardProgressState | undefined;
  try {
    if (pair.quiz === null) quiz = emptyProgress();
    else quiz = decodeProgress(JSON.parse(pair.quiz) as unknown);
    if (pair.flashcards === null) flashcards = emptyFlashcardProgress();
    else flashcards = decodeFlashcardProgress(JSON.parse(pair.flashcards) as unknown);
  } catch {
    return { ok: false, error: 'corrupt-progress' };
  }
  if (!quiz || !flashcards) return { ok: false, error: 'corrupt-progress' };
  const json = encodeProgressBackup(quiz, flashcards, exportedAt);
  if (!json) return { ok: false, error: 'invalid-progress' };
  try {
    const parsed = JSON.parse(json) as Parameters<typeof summarizeProgressBackup>[0];
    const summary = summarizeProgressBackup(parsed);
    return summary ? { ok: true, json, summary } : { ok: false, error: 'invalid-progress' };
  } catch {
    return { ok: false, error: 'invalid-progress' };
  }
}

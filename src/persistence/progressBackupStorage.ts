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

function quoteRaw(value: string, remainingBytes: number): { json: string; bytes: number } | undefined {
  const pieces = ['"'];
  let size = 1;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const escaped =
      codePoint === 0x22 || codePoint === 0x5c || codePoint < 0x20 || (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? JSON.stringify(character)!.slice(1, -1)
        : character;
    const length =
      codePoint === 0x22 || codePoint === 0x5c
        ? 2
        : codePoint < 0x20
          ? [0x08, 0x09, 0x0a, 0x0c, 0x0d].includes(codePoint)
            ? 2
            : 6
          : codePoint >= 0xd800 && codePoint <= 0xdfff
            ? 6
            : codePoint <= 0x7f
              ? 1
              : codePoint <= 0x7ff
                ? 2
                : codePoint <= 0xffff
                  ? 3
                  : 4;
    size += length;
    if (size + 1 > remainingBytes) return undefined;
    pieces.push(escaped);
  }
  size += 1;
  return size <= remainingBytes ? { json: `${pieces.join('')}"`, bytes: size } : undefined;
}

/** Preserve the exact fixed-key values in a separate, never-importable recovery file. */
export function encodeRawProgressRecovery(
  pair: ProgressPair,
  capturedAt = new Date().toISOString(),
  journalRaw: string | null = null,
  mayBeInconsistent = true,
): RawProgressRecoveryResult {
  const prefix = `{"format":"${RAW_PROGRESS_RECOVERY_FORMAT}","version":1,"capturedAt":${JSON.stringify(capturedAt)},"mayBeInconsistent":${mayBeInconsistent},"quizKey":${JSON.stringify(progressKey)},"quizRaw":`;
  const middle = `,"flashcardsKey":${JSON.stringify(flashcardProgressKey)},"flashcardsRaw":`;
  const journalMiddle = `,"journalKey":${JSON.stringify(progressRestoreJournalKey)},"journalRaw":`;
  const suffix = '}';
  const maximum = RAW_PROGRESS_RECOVERY_MAX_BYTES;
  const prefixBytes = new TextEncoder().encode(prefix).byteLength;
  const middleBytes = new TextEncoder().encode(middle).byteLength;
  const journalMiddleBytes = new TextEncoder().encode(journalMiddle).byteLength;
  const suffixBytes = new TextEncoder().encode(suffix).byteLength;
  const encodedJournal = journalRaw === null ? undefined : quoteRaw(journalRaw, maximum);
  if (journalRaw !== null && !encodedJournal) return { ok: false, error: 'too-large' };
  const journalJson = encodedJournal?.json ?? 'null';
  const journalBytes = encodedJournal?.bytes ?? 4;
  let quiz = 'null';
  let quizBytes = 4;
  if (pair.quiz !== null) {
    const encoded = quoteRaw(
      pair.quiz,
      maximum - prefixBytes - middleBytes - journalMiddleBytes - suffixBytes - journalBytes - 4,
    );
    if (!encoded) return { ok: false, error: 'too-large' };
    quiz = encoded.json;
    quizBytes = encoded.bytes;
  }
  const flashcardAllowance =
    maximum - prefixBytes - middleBytes - journalMiddleBytes - suffixBytes - quizBytes - journalBytes;
  let flashcards = 'null';
  if (pair.flashcards !== null) {
    const encoded = quoteRaw(pair.flashcards, flashcardAllowance);
    if (!encoded) return { ok: false, error: 'too-large' };
    flashcards = encoded.json;
  } else if (flashcardAllowance < 4) return { ok: false, error: 'too-large' };
  const json = `${prefix}${quiz}${middle}${flashcards}${journalMiddle}${journalJson}${suffix}`;
  return new TextEncoder().encode(json).byteLength <= maximum ? { ok: true, json } : { ok: false, error: 'too-large' };
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

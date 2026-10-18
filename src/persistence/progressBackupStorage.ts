import { emptyProgress, decodeProgress, progressKey } from './progressCodec';
import { decodeFlashcardProgress, flashcardProgressKey } from './flashcardProgressCodec';
import type { FlashcardProgressState } from '../domain/flashcardStudy';
import {
  encodeProgressBackup,
  summarizeProgressBackup,
  type ProgressBackupSummary,
  type ProgressBackupV1,
} from './progressBackupCodec';

/** Raw stored values of both progress keys; null means the key is absent. */
export interface ProgressPair { quiz: string | null; flashcards: string | null }
export interface ProgressStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ProgressBackupExportResult =
  | { ok: true; json: string; summary: ProgressBackupSummary }
  | { ok: false; error: 'corrupt-progress' | 'invalid-progress' | 'unavailable' };

const changeNoticeKey = 'meducation.progress.restore.notice';

const emptyFlashcardProgress = (): FlashcardProgressState => ({
  schemaVersion: 2,
  revision: 'initial',
  checkpoints: {},
  completionCounts: {},
});

/** Decode a raw pair; absent keys mean empty, malformed bytes never do. */
export function encodeBackupFromProgressPair(
  pair: ProgressPair,
  exportedAt = new Date().toISOString(),
): ProgressBackupExportResult {
  let quiz;
  let flashcards: FlashcardProgressState | undefined;
  try {
    quiz = pair.quiz === null ? emptyProgress() : decodeProgress(JSON.parse(pair.quiz) as unknown);
    flashcards = pair.flashcards === null ? emptyFlashcardProgress() : decodeFlashcardProgress(JSON.parse(pair.flashcards) as unknown);
  } catch {
    return { ok: false, error: 'corrupt-progress' };
  }
  if (!quiz || !flashcards) return { ok: false, error: 'corrupt-progress' };
  const json = encodeProgressBackup(quiz, flashcards, exportedAt);
  if (!json) return { ok: false, error: 'invalid-progress' };
  const summary = summarizeProgressBackup(JSON.parse(json) as ProgressBackupV1);
  return summary ? { ok: true, json, summary } : { ok: false, error: 'invalid-progress' };
}

export function readProgressPair(storage: ProgressStoragePort): ProgressPair {
  return { quiz: storage.getItem(progressKey), flashcards: storage.getItem(flashcardProgressKey) };
}

function writeRaw(storage: ProgressStoragePort, key: string, value: string | null): void {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

/**
 * Replace both progress values with a validated backup. If either write throws,
 * the previously stored raw values of both keys are put back and false is returned.
 */
export function restoreProgressBackup(
  storage: ProgressStoragePort,
  backup: ProgressBackupV1,
  randomUUID: () => string = () => crypto.randomUUID(),
): boolean {
  let previous: ProgressPair;
  try { previous = readProgressPair(storage); } catch { return false; }
  try {
    storage.setItem(progressKey, JSON.stringify({ ...backup.quiz, revision: randomUUID() }));
    storage.setItem(flashcardProgressKey, JSON.stringify({ ...backup.flashcards, revision: randomUUID() }));
    return true;
  } catch {
    try {
      writeRaw(storage, progressKey, previous.quiz);
      writeRaw(storage, flashcardProgressKey, previous.flashcards);
    } catch { /* Nothing more can be done; the caller still reports failure. */ }
    return false;
  }
}

/** Remove both progress values. If either removal throws, the previous raw values are put back. */
export function resetProgress(storage: ProgressStoragePort): boolean {
  let previous: ProgressPair;
  try { previous = readProgressPair(storage); } catch { return false; }
  try {
    storage.removeItem(progressKey);
    storage.removeItem(flashcardProgressKey);
    return true;
  } catch {
    try {
      writeRaw(storage, progressKey, previous.quiz);
      writeRaw(storage, flashcardProgressKey, previous.flashcards);
    } catch { /* Nothing more can be done; the caller still reports failure. */ }
    return false;
  }
}

export function exportBrowserProgress(): ProgressBackupExportResult {
  try { return encodeBackupFromProgressPair(readProgressPair(localStorage)); }
  catch { return { ok: false, error: 'unavailable' }; }
}

export function restoreBrowserProgress(backup: ProgressBackupV1): boolean {
  try { return restoreProgressBackup(localStorage, backup); }
  catch { return false; }
}

export function resetBrowserProgress(): boolean {
  try { return resetProgress(localStorage); }
  catch { return false; }
}

/** Ephemeral success notice across the reload; never part of a progress backup. */
export type ProgressChange = 'restored' | 'reset';
export function rememberProgressChange(kind: ProgressChange): void {
  try { sessionStorage.setItem(changeNoticeKey, kind); } catch { /* The change itself succeeded. */ }
}
export function consumeProgressChangeNotice(): ProgressChange | undefined {
  try {
    const kind = sessionStorage.getItem(changeNoticeKey);
    sessionStorage.removeItem(changeNoticeKey);
    return kind === 'restored' || kind === 'reset' ? kind : undefined;
  } catch { return undefined; }
}

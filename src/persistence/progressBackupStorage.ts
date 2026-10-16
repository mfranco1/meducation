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

const restoreNoticeKey = 'meducation.progress.restore.notice';

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

export function exportBrowserProgress(): ProgressBackupExportResult {
  try { return encodeBackupFromProgressPair(readProgressPair(localStorage)); }
  catch { return { ok: false, error: 'unavailable' }; }
}

export function restoreBrowserProgress(backup: ProgressBackupV1): boolean {
  try { return restoreProgressBackup(localStorage, backup); }
  catch { return false; }
}

/** Ephemeral success notice across the reload; never part of a progress backup. */
export function rememberProgressRestore(): void {
  try { sessionStorage.setItem(restoreNoticeKey, '1'); } catch { /* The restore itself succeeded. */ }
}
export function consumeProgressRestoreNotice(): boolean {
  try {
    const restored = sessionStorage.getItem(restoreNoticeKey) === '1';
    sessionStorage.removeItem(restoreNoticeKey);
    return restored;
  } catch { return false; }
}

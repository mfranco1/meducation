import type { ProgressBackupV1 } from './progressBackupCodec';
import { PROGRESS_BACKUP_FORMAT, PROGRESS_BACKUP_VERSION, PROGRESS_BACKUP_MAX_BYTES, validateProgressBackup } from './progressBackupCodec';
import { progressKey, type StoragePort } from './progressCodec';
import { decodeProgress } from './progressCodec';
import { decodeFlashcardProgress, flashcardProgressKey } from './flashcardProgressCodec';
import { progressRestoreJournalKey } from './progressKeys';
import type { ProgressLease } from './progressCoordination';

export const PROGRESS_RESTORE_JOURNAL_FORMAT = 'meducation-progress-restore-journal';
export const PROGRESS_RESTORE_JOURNAL_VERSION = 1;
export const PROGRESS_RESTORE_JOURNAL_MAX_BYTES = 20 * 1024 * 1024;
const ORIGINAL_PAIR_MAX_BYTES = 4 * 1024 * 1024;
const TARGET_PAIR_MAX_BYTES = 4.25 * 1024 * 1024;
const encoder = new TextEncoder();

export interface ProgressPair { quiz: string | null; flashcards: string | null }
export interface ProgressRestoreJournal {
  format: typeof PROGRESS_RESTORE_JOURNAL_FORMAT;
  version: 1;
  operationId: string;
  decision: 'original' | 'imported';
  original: ProgressPair;
  imported: { quiz: string; flashcards: string };
}
export interface ProgressStoragePort extends StoragePort { removeItem(key: string): void }
export type ProgressPairCaptureResult = { kind: 'captured'; pair: ProgressPair } | { kind: 'unavailable' };
export type ProgressRecoveryResult =
  | { kind: 'none' }
  | { kind: 'recovered'; decision: 'original' | 'imported' }
  | { kind: 'recovery-required' };
export type ProgressRestoreResult =
  | { kind: 'restored' }
  | { kind: 'stale-preview' }
  | { kind: 'blocked' }
  | { kind: 'storage-error' }
  | { kind: 'recovery-required' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const own = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const exactKeys = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).length === names.length && names.every(name => own(value, name));
const bytes = (value: string) => encoder.encode(value).byteLength;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hasUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);

function exclusive(lease: ProgressLease): boolean { return lease.valid && lease.mode === 'exclusive'; }
function requireExclusive(lease: ProgressLease): void { if (!exclusive(lease)) throw new Error('exclusive-lease-required'); }
function readPair(storage: ProgressStoragePort, lease: ProgressLease): ProgressPair {
  requireExclusive(lease);
  const quiz = storage.getItem(progressKey);
  requireExclusive(lease);
  const flashcards = storage.getItem(flashcardProgressKey);
  return { quiz, flashcards };
}
export function captureProgressPair(storage: ProgressStoragePort, lease: ProgressLease): ProgressPairCaptureResult {
  try { return { kind: 'captured', pair: readPair(storage, lease) }; }
  catch { return { kind: 'unavailable' }; }
}
export function captureBrowserProgressPair(lease: ProgressLease): ProgressPairCaptureResult {
  try { return captureProgressPair(localStorage, lease); }
  catch { return { kind: 'unavailable' }; }
}

function validTargetPair(imported: unknown): imported is { quiz: string; flashcards: string } {
  if (!isRecord(imported) || !exactKeys(imported, ['quiz', 'flashcards']) || typeof imported.quiz !== 'string' || typeof imported.flashcards !== 'string') return false;
  if (bytes(imported.quiz) + bytes(imported.flashcards) > TARGET_PAIR_MAX_BYTES) return false;
  try {
    const quiz = JSON.parse(imported.quiz) as unknown;
    const flashcards = JSON.parse(imported.flashcards) as unknown;
    if (!isRecord(quiz) || !isRecord(flashcards) || !hasUuid(quiz.revision) || !hasUuid(flashcards.revision)) return false;
    const quizPayload = { ...quiz };
    const flashcardPayload = { ...flashcards };
    delete quizPayload.revision;
    delete flashcardPayload.revision;
    const checked = validateProgressBackup({
      format: PROGRESS_BACKUP_FORMAT,
      version: PROGRESS_BACKUP_VERSION,
      exportedAt: '2000-01-01T00:00:00.000Z',
      quiz: quizPayload,
      flashcards: flashcardPayload,
    });
    return checked.ok && decodeProgress(quiz) !== undefined && decodeFlashcardProgress(flashcards) !== undefined;
  } catch { return false; }
}

export function decodeProgressRestoreJournal(value: unknown): ProgressRestoreJournal | undefined {
  if (!isRecord(value) || !exactKeys(value, ['format', 'version', 'operationId', 'decision', 'original', 'imported'])
    || value.format !== PROGRESS_RESTORE_JOURNAL_FORMAT || value.version !== PROGRESS_RESTORE_JOURNAL_VERSION
    || !hasUuid(value.operationId) || !['original', 'imported'].includes(value.decision as string)
    || !isRecord(value.original) || !exactKeys(value.original, ['quiz', 'flashcards'])
    || ![value.original.quiz, value.original.flashcards].every(raw => raw === null || typeof raw === 'string')
    || !validTargetPair(value.imported)) return undefined;
  const original = value.original as unknown as ProgressPair;
  if ((original.quiz === null ? 0 : bytes(original.quiz)) + (original.flashcards === null ? 0 : bytes(original.flashcards)) > ORIGINAL_PAIR_MAX_BYTES) return undefined;
  return value as unknown as ProgressRestoreJournal;
}

function readJournal(storage: ProgressStoragePort, lease: ProgressLease): { kind: 'none' } | { kind: 'valid'; raw: string; journal: ProgressRestoreJournal } | { kind: 'invalid' } {
  requireExclusive(lease);
  const raw = storage.getItem(progressRestoreJournalKey);
  if (raw === null) return { kind: 'none' };
  if (bytes(raw) > PROGRESS_RESTORE_JOURNAL_MAX_BYTES) return { kind: 'invalid' };
  try {
    const journal = decodeProgressRestoreJournal(JSON.parse(raw) as unknown);
    return journal ? { kind: 'valid', raw, journal } : { kind: 'invalid' };
  } catch { return { kind: 'invalid' }; }
}

function serializeJournal(journal: ProgressRestoreJournal): string | undefined {
  const raw = JSON.stringify(journal);
  return bytes(raw) <= PROGRESS_RESTORE_JOURNAL_MAX_BYTES ? raw : undefined;
}

function samePair(a: ProgressPair, b: ProgressPair): boolean { return a.quiz === b.quiz && a.flashcards === b.flashcards; }

function writeValue(storage: ProgressStoragePort, key: string, value: string | null, lease: ProgressLease): void {
  requireExclusive(lease);
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
  requireExclusive(lease);
  if (storage.getItem(key) !== value) throw new Error('storage-readback-mismatch');
}

function writePair(storage: ProgressStoragePort, pair: ProgressPair, lease: ProgressLease): void {
  const current = readPair(storage, lease);
  if (current.quiz !== pair.quiz) writeValue(storage, progressKey, pair.quiz, lease);
  if (current.flashcards !== pair.flashcards) writeValue(storage, flashcardProgressKey, pair.flashcards, lease);
}

function recoverSelectedPair(storage: ProgressStoragePort, journal: ProgressRestoreJournal, lease: ProgressLease): ProgressRecoveryResult {
  try {
    const current = readPair(storage, lease);
    const allowedQuiz = current.quiz === journal.original.quiz || current.quiz === journal.imported.quiz;
    const allowedFlashcards = current.flashcards === journal.original.flashcards || current.flashcards === journal.imported.flashcards;
    if (!allowedQuiz || !allowedFlashcards) return { kind: 'recovery-required' };
    const selected: ProgressPair = journal.decision === 'original' ? journal.original : journal.imported;
    writePair(storage, selected, lease);
    const verified = readPair(storage, lease);
    if (!samePair(verified, selected)) return { kind: 'recovery-required' };
    requireExclusive(lease);
    storage.removeItem(progressRestoreJournalKey);
    requireExclusive(lease);
    if (storage.getItem(progressRestoreJournalKey) !== null) return { kind: 'recovery-required' };
    return { kind: 'recovered', decision: journal.decision };
  } catch { return { kind: 'recovery-required' }; }
}

export function recoverProgressPair(storage: ProgressStoragePort, lease: ProgressLease): ProgressRecoveryResult {
  if (!exclusive(lease)) return { kind: 'recovery-required' };
  let inspected: ReturnType<typeof readJournal>;
  try { inspected = readJournal(storage, lease); } catch { return { kind: 'recovery-required' }; }
  if (inspected.kind === 'none') return { kind: 'none' };
  if (inspected.kind === 'invalid') return { kind: 'recovery-required' };
  return recoverSelectedPair(storage, inspected.journal, lease);
}
export function recoverBrowserProgressPair(lease: ProgressLease): ProgressRecoveryResult {
  try { return recoverProgressPair(localStorage, lease); }
  catch { return { kind: 'recovery-required' }; }
}

function recoverProgressOperation(storage: ProgressStoragePort, lease: ProgressLease, operationId: string): ProgressRecoveryResult {
  if (!exclusive(lease)) return { kind: 'recovery-required' };
  let inspected: ReturnType<typeof readJournal>;
  try { inspected = readJournal(storage, lease); } catch { return { kind: 'recovery-required' }; }
  if (inspected.kind === 'none') return { kind: 'none' };
  if (inspected.kind !== 'valid' || inspected.journal.operationId !== operationId) return { kind: 'recovery-required' };
  return recoverSelectedPair(storage, inspected.journal, lease);
}

function encodeTargets(backup: ProgressBackupV1, randomUUID: () => string): { quiz: string; flashcards: string } | undefined {
  const validated = validateProgressBackup(backup);
  if (!validated.ok || bytes(JSON.stringify(validated.value)) > PROGRESS_BACKUP_MAX_BYTES) return undefined;
  // Validation returns detached allowlisted payloads; add only fresh local revisions.
  const quiz = JSON.stringify({ ...validated.value.quiz, revision: randomUUID() });
  const flashcards = JSON.stringify({ ...validated.value.flashcards, revision: randomUUID() });
  const targets = { quiz, flashcards };
  return validTargetPair(targets) ? targets : undefined;
}

/** Replace both progress keys under a caller-held exclusive participation lease. */
export function restoreProgressPair(
  storage: ProgressStoragePort,
  lease: ProgressLease,
  expectedOriginal: ProgressPair,
  backup: ProgressBackupV1,
  randomUUID: () => string = () => crypto.randomUUID(),
): ProgressRestoreResult {
  if (!exclusive(lease)) return { kind: 'blocked' };
  let existing: ReturnType<typeof readJournal>;
  try { existing = readJournal(storage, lease); } catch { return { kind: 'storage-error' }; }
  if (existing.kind !== 'none') return { kind: 'recovery-required' };
  let original: ProgressPair;
  try { original = readPair(storage, lease); }
  catch { return { kind: 'storage-error' }; }
  if (!samePair(original, expectedOriginal)) return { kind: 'stale-preview' };
  let imported: { quiz: string; flashcards: string } | undefined;
  let operationId: string;
  try { imported = encodeTargets(backup, randomUUID); operationId = randomUUID(); }
  catch { return { kind: 'storage-error' }; }
  if (!imported || !hasUuid(operationId)) return { kind: 'storage-error' };
  if ((original.quiz === null ? 0 : bytes(original.quiz)) + (original.flashcards === null ? 0 : bytes(original.flashcards)) > ORIGINAL_PAIR_MAX_BYTES) return { kind: 'storage-error' };
  const prepared: ProgressRestoreJournal = {
    format: PROGRESS_RESTORE_JOURNAL_FORMAT, version: 1, operationId, decision: 'original',
    original, imported,
  };
  const preparedRaw = serializeJournal(prepared);
  if (!preparedRaw || !decodeProgressRestoreJournal(prepared)) return { kind: 'storage-error' };

  try {
    requireExclusive(lease);
    storage.setItem(progressRestoreJournalKey, preparedRaw);
    requireExclusive(lease);
    if (storage.getItem(progressRestoreJournalKey) !== preparedRaw) throw new Error('journal-reservation-readback-mismatch');
    writePair(storage, imported, lease);
    const importedJournal = { ...prepared, decision: 'imported' as const };
    const committedRaw = serializeJournal(importedJournal);
    if (!committedRaw) throw new Error('journal-size-limit');
    requireExclusive(lease);
    storage.setItem(progressRestoreJournalKey, committedRaw);
    requireExclusive(lease);
    if (storage.getItem(progressRestoreJournalKey) !== committedRaw) throw new Error('journal-commit-readback-mismatch');
    const cleaned = recoverSelectedPair(storage, importedJournal, lease);
    if (cleaned.kind === 'recovered' && cleaned.decision === 'imported') return { kind: 'restored' };
    const retried = recoverProgressOperation(storage, lease, operationId);
    if (retried.kind === 'recovered' && retried.decision === 'imported') return { kind: 'restored' };
    if (retried.kind === 'none') {
      try { if (samePair(readPair(storage, lease), imported)) return { kind: 'restored' }; } catch { /* Stay gated below. */ }
    }
    return { kind: 'recovery-required' };
  } catch {
    const recovered = recoverProgressOperation(storage, lease, operationId);
    if (recovered.kind === 'recovered' && recovered.decision === 'imported') return { kind: 'restored' };
    if (recovered.kind === 'recovered' && recovered.decision === 'original') return { kind: 'storage-error' };
    if (recovered.kind === 'none') {
      try {
        const current = readPair(storage, lease);
        if (samePair(current, original)) return { kind: 'storage-error' };
        if (samePair(current, imported)) return { kind: 'restored' };
        return { kind: 'recovery-required' };
      }
      catch { return { kind: 'recovery-required' }; }
    }
    return { kind: 'recovery-required' };
  }
}
export function restoreBrowserProgressPair(lease: ProgressLease, expectedOriginal: ProgressPair, backup: ProgressBackupV1): ProgressRestoreResult {
  try { return restoreProgressPair(localStorage, lease, expectedOriginal, backup); }
  catch { return { kind: 'recovery-required' }; }
}

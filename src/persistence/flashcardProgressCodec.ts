import type { FlashcardCheckpoint, FlashcardProgressState } from '../domain/flashcardStudy';
import type { StoragePort } from './progressCodec';

export const flashcardProgressKey = 'meducation.flashcards.progress.v1';
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const onlyKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function validCheckpoint(value: unknown, deckId: string): value is FlashcardCheckpoint {
  return (
    record(value) &&
    onlyKeys(value, ['deckId', 'currentCardId', 'contentSignature', 'updatedAt']) &&
    nonempty(deckId) &&
    value.deckId === deckId &&
    nonempty(value.currentCardId) &&
    nonempty(value.contentSignature) &&
    timestamp(value.updatedAt)
  );
}

export function decodeFlashcardProgress(value: unknown): FlashcardProgressState | undefined {
  if (
    !record(value) ||
    !onlyKeys(value, ['schemaVersion', 'revision', 'checkpoints']) ||
    value.schemaVersion !== 1 ||
    !nonempty(value.revision) ||
    !record(value.checkpoints)
  )
    return undefined;
  if (Object.entries(value.checkpoints).some(([deckId, checkpoint]) => !validCheckpoint(checkpoint, deckId)))
    return undefined;
  return value as unknown as FlashcardProgressState;
}

export function loadFlashcardProgress(storage: StoragePort): FlashcardProgressState | undefined {
  const raw = storage.getItem(flashcardProgressKey);
  if (raw === null) return { schemaVersion: 1, revision: 'initial', checkpoints: {} };
  try {
    return decodeFlashcardProgress(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

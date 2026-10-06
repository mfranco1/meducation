import type { FlashcardCheckpoint, FlashcardProgressState } from '../domain/flashcardStudy';
import type { StoragePort } from './progressCodec';

export const flashcardProgressKey = 'meducation.flashcards.progress.v1';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function validCheckpoint(value: unknown, deckId: string): value is FlashcardCheckpoint {
  return record(value) && value.deckId === deckId && nonempty(value.currentCardId)
    && nonempty(value.contentSignature) && nonempty(value.updatedAt);
}

export function decodeFlashcardProgress(value: unknown): FlashcardProgressState | undefined {
  if (!record(value) || value.schemaVersion !== 1 || !nonempty(value.revision) || !record(value.checkpoints)) return undefined;
  if (Object.entries(value.checkpoints).some(([deckId, checkpoint]) => !validCheckpoint(checkpoint, deckId))) return undefined;
  return value as unknown as FlashcardProgressState;
}

export function loadFlashcardProgress(storage: StoragePort): FlashcardProgressState | undefined {
  const raw = storage.getItem(flashcardProgressKey);
  if (raw === null) return { schemaVersion: 1, revision: 'initial', checkpoints: {} };
  try { return decodeFlashcardProgress(JSON.parse(raw) as unknown); }
  catch { return undefined; }
}

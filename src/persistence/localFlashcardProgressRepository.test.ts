import { describe, expect, it } from 'vitest';
import { FlashcardPersistenceError, LocalFlashcardProgressRepository } from './localFlashcardProgressRepository';
import { flashcardProgressKey } from './flashcardProgressCodec';
import type { StoragePort } from './progressCodec';

function storagePort(): StoragePort {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('local flashcard progress repository', () => {
  it('stores independent checkpoints and clears a finished deck', () => {
    const repository = new LocalFlashcardProgressRepository(storagePort());
    repository.saveCheckpoint({ deckId: 'd1', currentCardId: 'f2', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z' });
    repository.saveCheckpoint({ deckId: 'd2', currentCardId: 'f8', contentSignature: 'sig2', updatedAt: '2026-10-06T00:01:00.000Z' });
    expect(repository.getCheckpoint('d1')?.currentCardId).toBe('f2');
    expect(Object.keys(repository.getSnapshot().checkpoints)).toEqual(['d1', 'd2']);
    repository.clearCheckpoint('d1');
    expect(repository.getCheckpoint('d1')).toBeUndefined();
    expect(repository.getCheckpoint('d2')?.currentCardId).toBe('f8');
  });

  it('detects stale writers and preserves corrupt storage for recovery', () => {
    const storage = storagePort();
    const first = new LocalFlashcardProgressRepository(storage);
    const second = new LocalFlashcardProgressRepository(storage);
    first.getSnapshot(); second.getSnapshot();
    first.saveCheckpoint({ deckId: 'd1', currentCardId: 'f1', contentSignature: 'sig', updatedAt: 'now' });
    expect(() => second.saveCheckpoint({ deckId: 'd2', currentCardId: 'f2', contentSignature: 'sig', updatedAt: 'now' }))
      .toThrowError(expect.objectContaining({ kind: 'conflict' }));

    const corruptStorage = storagePort();
    corruptStorage.setItem(flashcardProgressKey, '{broken');
    const corrupt = new LocalFlashcardProgressRepository(corruptStorage);
    expect(corrupt.getSnapshot().checkpoints).toEqual({});
    expect(corrupt.getStorageError()).toContain('kept');
    expect(() => corrupt.clearCheckpoint('d1')).toThrowError(FlashcardPersistenceError);
    expect(corruptStorage.getItem(flashcardProgressKey)).toBe('{broken');
  });

  it('reports browser storage write failures without caching a false save', () => {
    const storage: StoragePort = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const repository = new LocalFlashcardProgressRepository(storage);
    expect(() => repository.saveCheckpoint({ deckId: 'd1', currentCardId: 'f1', contentSignature: 'sig', updatedAt: 'now' }))
      .toThrowError(FlashcardPersistenceError);
    expect(repository.getCheckpoint('d1')).toBeUndefined();
  });
});

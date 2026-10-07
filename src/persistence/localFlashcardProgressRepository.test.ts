import { describe, expect, it } from 'vitest';
import { FlashcardPersistenceError, LocalFlashcardProgressRepository } from './localFlashcardProgressRepository';
import { flashcardProgressKey } from './flashcardProgressCodec';
import type { StoragePort } from './progressCodec';

function storagePort(): StoragePort {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('local flashcard progress repository', () => {
  it('keeps snapshots stable and frozen without exposing caller-owned checkpoints', () => {
    const repository = new LocalFlashcardProgressRepository(storagePort());
    const checkpoint = { deckId: 'd1', currentCardId: 'f1', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: ['f1'], flaggedCardIds: ['f2'] };
    repository.saveCheckpoint(checkpoint);
    const snapshot = repository.getSnapshot();
    checkpoint.currentCardId = 'f2';
    expect(repository.getSnapshot()).toBe(snapshot);
    expect(repository.getCheckpoint('d1')?.currentCardId).toBe('f1');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.checkpoints)).toBe(true);
    expect(Object.isFrozen(snapshot.checkpoints.d1)).toBe(true);
    expect(Object.isFrozen(snapshot.checkpoints.d1.openedCardIds)).toBe(true);
    expect(Object.isFrozen(snapshot.completionCounts)).toBe(true);
  });
  it('retries a temporarily unavailable storage read without losing saved checkpoints', () => {
    const storage = storagePort();
    const stored = { deckId: 'd1', currentCardId: 'f1', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: [], flaggedCardIds: [] };
    new LocalFlashcardProgressRepository(storage).saveCheckpoint(stored);
    let unavailable = true;
    const repository = new LocalFlashcardProgressRepository({
      getItem: key => { if (unavailable) throw new Error('Blocked'); return storage.getItem(key); },
      setItem: (key, value) => storage.setItem(key, value),
    });
    expect(repository.getSnapshot().checkpoints).toEqual({});
    unavailable = false;
    expect(repository.getCheckpoint('d1')).toEqual(stored);
    repository.clearCheckpoint('d1');
    expect(repository.getCheckpoint('d1')).toBeUndefined();
  });
  it('counts finished decks once and clears only their checkpoints', () => {
    const repository = new LocalFlashcardProgressRepository(storagePort());
    repository.saveCheckpoint({ deckId: 'd1', currentCardId: 'f2', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: [], flaggedCardIds: [] });
    repository.saveCheckpoint({ deckId: 'd2', currentCardId: 'f8', contentSignature: 'sig2', updatedAt: '2026-10-06T00:01:00.000Z', openedCardIds: [], flaggedCardIds: [] });
    expect(repository.getCheckpoint('d1')?.currentCardId).toBe('f2');
    expect(Object.keys(repository.getSnapshot().checkpoints)).toEqual(['d1', 'd2']);
    repository.completeDeck('d1');
    expect(repository.getCheckpoint('d1')).toBeUndefined();
    expect(repository.getCheckpoint('d2')?.currentCardId).toBe('f8');
    expect(repository.getSnapshot().completionCounts).toEqual({ d1: 1 });
    repository.completeDeck('d1');
    expect(repository.getSnapshot().completionCounts).toEqual({ d1: 1 });
    repository.saveCheckpoint({ deckId: 'd1', currentCardId: 'f2', contentSignature: 'sig', updatedAt: '2026-10-06T00:02:00.000Z', openedCardIds: [], flaggedCardIds: [] });
    repository.completeDeck('d1');
    expect(repository.getSnapshot().completionCounts).toEqual({ d1: 2 });
    expect(repository.getSnapshot().checkpoints.d2).toBeDefined();
    repository.clearCheckpoint('d2');
    expect(repository.getSnapshot().completionCounts).toEqual({ d1: 2 });
  });

  it('persists completion counts across repository instances and publishes only committed completions', () => {
    const storage = storagePort();
    const first = new LocalFlashcardProgressRepository(storage);
    first.saveCheckpoint({ deckId: 'd1', currentCardId: 'f1', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: [], flaggedCardIds: [] });
    let notifications = 0;
    first.subscribe(() => notifications++);
    first.completeDeck('d1');
    expect(notifications).toBe(1);
    expect(new LocalFlashcardProgressRepository(storage).getSnapshot().completionCounts).toEqual({ d1: 1 });

    const values = new Map<string, string>();
    let rejectWrites = false;
    const failing = new LocalFlashcardProgressRepository({
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { if (rejectWrites) throw new Error('Quota'); values.set(key, value); },
    });
    failing.saveCheckpoint({ deckId: 'd1', currentCardId: 'f1', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: [], flaggedCardIds: [] });
    rejectWrites = true;
    expect(() => failing.completeDeck('d1')).toThrowError(FlashcardPersistenceError);
    expect(failing.getSnapshot().completionCounts).toEqual({});
    expect(failing.getCheckpoint('d1')).toBeDefined();
  });

  it('detects stale writers and preserves corrupt storage for recovery', () => {
    const storage = storagePort();
    const first = new LocalFlashcardProgressRepository(storage);
    const second = new LocalFlashcardProgressRepository(storage);
    first.getSnapshot(); second.getSnapshot();
    first.saveCheckpoint({ deckId: 'd1', currentCardId: 'f1', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: [], flaggedCardIds: [] });
    expect(() => second.saveCheckpoint({ deckId: 'd2', currentCardId: 'f2', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: [], flaggedCardIds: [] }))
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
    expect(() => repository.saveCheckpoint({ deckId: 'd1', currentCardId: 'f1', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: [], flaggedCardIds: [] }))
      .toThrowError(FlashcardPersistenceError);
    expect(repository.getCheckpoint('d1')).toBeUndefined();
  });
});

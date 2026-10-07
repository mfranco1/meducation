import { describe, expect, it } from 'vitest';
import { decodeFlashcardProgress, flashcardProgressKey, loadFlashcardProgress } from './flashcardProgressCodec';

const checkpoint = {
  deckId: 'd1',
  currentCardId: 'f1',
  contentSignature: 'sha256-example',
  updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: [], flaggedCardIds: [],
};
const state = { schemaVersion: 2, revision: 'revision', checkpoints: { d1: checkpoint } };

describe('flashcard progress envelope', () => {
  it('accepts opened and flagged IDs and rejects unsupported schemas and duplicated card content', () => {
    expect(decodeFlashcardProgress(state)).toEqual(state);
    expect(decodeFlashcardProgress({ ...state, schemaVersion: 1 })).toBeUndefined();
    expect(
      decodeFlashcardProgress({ ...state, checkpoints: { d1: { ...checkpoint, front: 'Content' } } }),
    ).toBeUndefined();
  });

  it('rejects ownership mismatches and invalid or noncanonical activity timestamps', () => {
    for (const invalid of [
      { ...checkpoint, deckId: 'd2' },
      { ...checkpoint, updatedAt: 'yesterday' },
      { ...checkpoint, updatedAt: '2026-10-06' },
      { ...checkpoint, currentCardId: ' ' },
    ]) {
      expect(decodeFlashcardProgress({ ...state, checkpoints: { d1: invalid } })).toBeUndefined();
    }
  });

  it('initializes only the current key without reading or rewriting old storage', () => {
    const reads: string[] = [];
    const storage = {
      getItem: (key: string) => { reads.push(key); return null; },
      setItem: () => { throw new Error('Reads must not write'); },
    };
    expect(loadFlashcardProgress(storage)).toEqual({ schemaVersion: 2, revision: 'initial', checkpoints: {} });
    expect(reads).toEqual([flashcardProgressKey]);
  });
});

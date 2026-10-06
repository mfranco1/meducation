import { describe, expect, it } from 'vitest';
import { decodeFlashcardProgress, flashcardProgressKey, legacyFlashcardProgressKey, loadFlashcardProgress } from './flashcardProgressCodec';

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

  it('migrates legacy positions in memory without rewriting the legacy key', () => {
    const values = new Map([[legacyFlashcardProgressKey, JSON.stringify({ schemaVersion: 1, revision: 'old', checkpoints: { d1: { deckId: 'd1', currentCardId: 'f1', contentSignature: 'sig', updatedAt: checkpoint.updatedAt } } })]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    expect(loadFlashcardProgress(storage)).toMatchObject({ schemaVersion: 2, revision: 'migrated:old', checkpoints: { d1: { openedCardIds: [], flaggedCardIds: [] } } });
    expect(values.get(flashcardProgressKey)).toBeUndefined();
    expect(values.has(legacyFlashcardProgressKey)).toBe(true);
  });
});

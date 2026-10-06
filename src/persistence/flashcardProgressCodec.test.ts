import { describe, expect, it } from 'vitest';
import { decodeFlashcardProgress } from './flashcardProgressCodec';

const checkpoint = {
  deckId: 'd1',
  currentCardId: 'f1',
  contentSignature: 'sha256-example',
  updatedAt: '2026-10-06T00:00:00.000Z',
};
const state = { schemaVersion: 1, revision: 'revision', checkpoints: { d1: checkpoint } };

describe('flashcard progress envelope', () => {
  it('accepts a position-only checkpoint and rejects future schemas and duplicated card content', () => {
    expect(decodeFlashcardProgress(state)).toEqual(state);
    expect(decodeFlashcardProgress({ ...state, schemaVersion: 2 })).toBeUndefined();
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
});

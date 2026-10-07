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
    expect(decodeFlashcardProgress(state)).toEqual({ ...state, completionCounts: {} });
    expect(decodeFlashcardProgress({ ...state, schemaVersion: 1 })).toBeUndefined();
    expect(
      decodeFlashcardProgress({ ...state, checkpoints: { d1: { ...checkpoint, front: 'Content' } } }),
    ).toBeUndefined();
  });

  it('normalizes old v2 saves and validates stable deck completion counts', () => {
    expect(decodeFlashcardProgress({ ...state, completionCounts: { d1: 2, d2: 0 } })).toEqual({ ...state, completionCounts: { d1: 2, d2: 0 } });
    for (const completionCounts of [{ ' ': 1 }, { d1: -1 }, { d1: 1.5 }, { d1: Number.MAX_SAFE_INTEGER + 1 }, []]) {
      expect(decodeFlashcardProgress({ ...state, completionCounts })).toBeUndefined();
    }
  });

  it('accepts the compact daily aggregate and rejects malformed or unsupported history', () => {
    const dailyStats = { firstDay: '2026-10-01', currentDay: '2026-10-03', currentDayCount: 1, trackedCompletions: 2, highestDailyCount: 1 };
    expect(decodeFlashcardProgress({ ...state, completionCounts: { d1: 2 }, dailyStats })).toMatchObject({ dailyStats, completionCounts: { d1: 2 } });
    for (const invalid of [
      { ...dailyStats, currentDay: '2026-02-30' },
      { ...dailyStats, currentDay: '2026-09-30' },
      { ...dailyStats, highestDailyCount: 3 },
      { ...dailyStats, currentDayCount: 0 },
      { ...dailyStats, unexpected: true },
    ]) {
      expect(decodeFlashcardProgress({ ...state, completionCounts: { d1: 2 }, dailyStats: invalid })).toBeUndefined();
    }
    expect(decodeFlashcardProgress({ ...state, completionCounts: { d1: 1 }, dailyStats })).toBeUndefined();
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
    expect(loadFlashcardProgress(storage)).toEqual({ schemaVersion: 2, revision: 'initial', checkpoints: {}, completionCounts: {} });
    expect(reads).toEqual([flashcardProgressKey]);
  });

  it('normalizes legacy v2 storage without writing or changing its checkpoint data', () => {
    const writes: string[] = [];
    const legacy = JSON.stringify(state);
    const loaded = loadFlashcardProgress({
      getItem: key => key === flashcardProgressKey ? legacy : null,
      setItem: (key, value) => writes.push(`${key}:${value}`),
    });
    expect(loaded).toEqual({ ...state, completionCounts: {} });
    expect(loaded?.checkpoints.d1).toEqual(checkpoint);
    expect(loaded?.dailyStats).toBeUndefined();
    expect(writes).toEqual([]);
  });
});

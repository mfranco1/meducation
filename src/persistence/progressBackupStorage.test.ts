import { describe, expect, it } from 'vitest';
import quizPayload from '../../tests/fixtures/progress-backups/populated-v1.json';
import { encodeBackupFromProgressPair, restoreProgressBackup, type ProgressPair } from './progressBackupStorage';
import { parseProgressBackup, type ProgressBackupV1 } from './progressBackupCodec';
import { progressKey } from './progressCodec';
import { flashcardProgressKey } from './flashcardProgressCodec';

describe('backup from captured storage pair', () => {
  it('treats absent keys as valid empty progress and does not write', () => {
    const pair: ProgressPair = { quiz: null, flashcards: null };
    const result = encodeBackupFromProgressPair(pair, '2026-10-13T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toEqual({
        retainedCompletedAttempts: 0,
        savedQuizzes: 0,
        savedFlashcardDecks: 0,
        quizCompletions: 0,
        flashcardCompletions: 0,
        totalRecordedCompletions: '0',
      });
      expect(JSON.parse(result.json).quiz.completed).toEqual([]);
    }
    expect(Object.keys(pair)).toEqual(['quiz', 'flashcards']);
  });

  it('refuses corrupt bytes instead of exporting a successful empty snapshot', () => {
    const result = encodeBackupFromProgressPair({ quiz: '{broken', flashcards: null });
    expect(result).toEqual({ ok: false, error: 'corrupt-progress' });
  });

  it('normalizes legacy flashcard completionCounts omission and keeps daily history absent', () => {
    const legacyFlashcards = { schemaVersion: 2, revision: 'legacy-revision', checkpoints: {} };
    const result = encodeBackupFromProgressPair(
      { quiz: null, flashcards: JSON.stringify(legacyFlashcards) },
      '2026-10-13T00:00:00.000Z',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const payload = JSON.parse(result.json) as {
        flashcards: { completionCounts: Record<string, number>; dailyStats?: unknown };
      };
      expect(payload.flashcards.completionCounts).toEqual({});
      expect(payload.flashcards.dailyStats).toBeUndefined();
    }
  });

  it('summarizes saved histories without conflating retained attempts and durable completion totals', () => {
    const backup = structuredClone(quizPayload) as {
      quiz: Record<string, unknown>;
      flashcards: Record<string, unknown>;
    };
    const pair = {
      quiz: JSON.stringify({ revision: 'local-revision', ...backup.quiz }),
      flashcards: JSON.stringify({ revision: 'local-revision', ...backup.flashcards }),
    };
    const original = { ...pair };
    const result = encodeBackupFromProgressPair(pair, '2026-10-13T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.summary).toEqual({
        retainedCompletedAttempts: 1,
        savedQuizzes: 1,
        savedFlashcardDecks: 1,
        quizCompletions: 2,
        flashcardCompletions: 3,
        totalRecordedCompletions: '5',
      });
    expect(pair).toEqual(original);
  });
});

describe('restoreProgressBackup', () => {
  const backup = parseProgressBackup(JSON.stringify(quizPayload));
  if (!backup.ok) throw new Error('fixture must be a valid backup');
  const target: ProgressBackupV1 = backup.value;

  function memoryStorage(initial: Record<string, string>, failingKey?: string) {
    const values = new Map(Object.entries(initial));
    return {
      values,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === failingKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => { values.delete(key); },
    };
  }

  it('round-trips an export through a restore into both stores', () => {
    const storage = memoryStorage({});
    expect(restoreProgressBackup(storage, target)).toBe(true);
    const exported = encodeBackupFromProgressPair({ quiz: storage.getItem(progressKey), flashcards: storage.getItem(flashcardProgressKey) });
    expect(exported.ok).toBe(true);
    if (exported.ok) {
      const parsed = JSON.parse(exported.json) as ProgressBackupV1;
      expect(parsed.quiz).toEqual(target.quiz);
      expect(parsed.flashcards).toEqual(target.flashcards);
    }
  });

  it('replaces existing values in both stores', () => {
    const storage = memoryStorage({ [progressKey]: 'old-quiz', [flashcardProgressKey]: 'old-cards' });
    expect(restoreProgressBackup(storage, target)).toBe(true);
    expect(storage.getItem(progressKey)).not.toBe('old-quiz');
    expect(storage.getItem(flashcardProgressKey)).not.toBe('old-cards');
  });

  it('leaves both stores at their original values when the second write fails', () => {
    const storage = memoryStorage({ [progressKey]: 'old-quiz', [flashcardProgressKey]: 'old-cards' }, flashcardProgressKey);
    expect(restoreProgressBackup(storage, target)).toBe(false);
    expect(storage.getItem(progressKey)).toBe('old-quiz');
    expect(storage.getItem(flashcardProgressKey)).toBe('old-cards');
  });

  it('removes keys that were absent before a failed restore', () => {
    const storage = memoryStorage({}, flashcardProgressKey);
    expect(restoreProgressBackup(storage, target)).toBe(false);
    expect(storage.values.size).toBe(0);
  });
});

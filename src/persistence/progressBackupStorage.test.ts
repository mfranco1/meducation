import { describe, expect, it } from 'vitest';
import quizPayload from '../../tests/fixtures/progress-backups/populated-v1.json';
import { encodeBackupFromProgressPair, encodeRawProgressRecovery, RAW_PROGRESS_RECOVERY_FORMAT } from './progressBackupStorage';
import { parseProgressBackup } from './progressBackupCodec';
import type { ProgressPair } from './progressRestore';

describe('backup from captured storage pair', () => {
  it('treats absent keys as valid empty progress and does not write', () => {
    const pair: ProgressPair = { quiz: null, flashcards: null };
    const result = encodeBackupFromProgressPair(pair, '2026-10-13T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toEqual({ retainedCompletedAttempts: 0, savedQuizzes: 0, savedFlashcardDecks: 0, quizCompletions: 0, flashcardCompletions: 0, totalRecordedCompletions: '0' });
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
    const result = encodeBackupFromProgressPair({ quiz: null, flashcards: JSON.stringify(legacyFlashcards) }, '2026-10-13T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const payload = JSON.parse(result.json) as { flashcards: { completionCounts: Record<string, number>; dailyStats?: unknown } };
      expect(payload.flashcards.completionCounts).toEqual({});
      expect(payload.flashcards.dailyStats).toBeUndefined();
    }
  });

  it('summarizes saved histories without conflating retained attempts and durable completion totals', () => {
    const backup = structuredClone(quizPayload) as { quiz: Record<string, unknown>; flashcards: Record<string, unknown> };
    const pair = {
      quiz: JSON.stringify({ revision: 'local-revision', ...backup.quiz }),
      flashcards: JSON.stringify({ revision: 'local-revision', ...backup.flashcards }),
    };
    const original = { ...pair };
    const result = encodeBackupFromProgressPair(pair, '2026-10-13T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toEqual({
      retainedCompletedAttempts: 1,
      savedQuizzes: 1,
      savedFlashcardDecks: 1,
      quizCompletions: 2,
      flashcardCompletions: 3,
      totalRecordedCompletions: '5',
    });
    expect(pair).toEqual(original);
  });

  it('preserves exact raw values in a separate recovery format rejected by the normal importer', () => {
    const pair = { quiz: '{\u0000corrupt\nbytes', flashcards: null };
    const result = encodeRawProgressRecovery(pair, '2026-10-13T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoded = JSON.parse(result.json) as { format: string; quizRaw: string | null; flashcardsRaw: string | null };
      expect(decoded).toMatchObject({ format: RAW_PROGRESS_RECOVERY_FORMAT, quizRaw: pair.quiz, flashcardsRaw: null });
      expect(parseProgressBackup(result.json)).toEqual({ ok: false, error: 'wrong-format' });
    }
  });
});

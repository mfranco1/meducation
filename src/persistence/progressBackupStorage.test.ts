import { describe, expect, it } from 'vitest';
import quizPayload from '../../tests/fixtures/progress-backups/populated-v1.json';
import {
  captureRawProgressRecovery,
  encodeBackupFromProgressPair,
  encodeRawProgressRecovery,
  RAW_PROGRESS_RECOVERY_FORMAT,
} from './progressBackupStorage';
import { parseProgressBackup } from './progressBackupCodec';
import type { ProgressPair } from './progressRestore';
import { progressKey } from './progressCodec';
import { flashcardProgressKey } from './flashcardProgressCodec';
import { progressRestoreJournalKey } from './progressKeys';

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

  it('preserves exact raw values in a separate recovery format rejected by the normal importer', () => {
    const pair = { quiz: '{\u0000corrupt\nbytes', flashcards: null };
    const result = encodeRawProgressRecovery(pair, '2026-10-13T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoded = JSON.parse(result.json) as {
        format: string;
        quizRaw: string | null;
        flashcardsRaw: string | null;
        journalRaw: string | null;
        mayBeInconsistent: boolean;
      };
      expect(decoded).toMatchObject({
        format: RAW_PROGRESS_RECOVERY_FORMAT,
        quizRaw: pair.quiz,
        flashcardsRaw: null,
        journalRaw: null,
        mayBeInconsistent: true,
      });
      expect(parseProgressBackup(result.json)).toEqual({ ok: false, error: 'wrong-format' });
    }
  });

  it('captures the fixed three raw keys twice and labels the best-effort capture', () => {
    const values = new Map([
      [progressKey, 'quiz raw'],
      [flashcardProgressKey, 'flash raw'],
      [progressRestoreJournalKey, 'journal raw'],
    ]);
    const result = captureRawProgressRecovery(
      { getItem: (key) => values.get(key) ?? null },
      '2026-10-13T00:00:00.000Z',
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(JSON.parse(result.json)).toMatchObject({
        quizKey: progressKey,
        quizRaw: 'quiz raw',
        flashcardsKey: flashcardProgressKey,
        flashcardsRaw: 'flash raw',
        journalKey: progressRestoreJournalKey,
        journalRaw: 'journal raw',
        mayBeInconsistent: true,
      });
  });

  it('does not fabricate raw nulls when reads fail or values change during capture', () => {
    expect(
      captureRawProgressRecovery({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toEqual({ ok: false, error: 'unavailable' });
    let reads = 0;
    const changed = captureRawProgressRecovery({ getItem: (key) => (key === progressKey ? `value-${reads++}` : null) });
    expect(changed).toEqual({ ok: false, error: 'changed' });
  });

  it('round-trips lone surrogate code units without replacement', () => {
    const pair = { quiz: `before\ud800after`, flashcards: `\udfff` };
    const result = encodeRawProgressRecovery(pair);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(JSON.parse(result.json)).toMatchObject({ quizRaw: pair.quiz, flashcardsRaw: pair.flashcards });
  });
});

it('accepts the exact 64 MiB escaped recovery ceiling and rejects one more byte before output allocation', () => {
  const capturedAt = '2026-10-13T00:00:00.000Z';
  const base = encodeRawProgressRecovery({ quiz: null, flashcards: null }, capturedAt);
  if (!base.ok) throw new Error('empty raw recovery must be encodable');
  const allowance = 64 * 1024 * 1024 - base.json.length + 2; // Replace null (4 bytes) with string quotes (2 bytes).
  const quiz = '\u0000'.repeat(Math.floor(allowance / 6)) + 'a'.repeat(allowance % 6);
  const exact = encodeRawProgressRecovery({ quiz, flashcards: null }, capturedAt);
  expect(exact.ok).toBe(true);
  if (exact.ok) expect(exact.json.length).toBe(64 * 1024 * 1024);
  expect(encodeRawProgressRecovery({ quiz: quiz + 'a', flashcards: null }, capturedAt)).toEqual({ ok: false, error: 'too-large' });
}, 15_000);

import { describe, expect, it } from 'vitest';
import fixture from '../../tests/fixtures/progress-backups/populated-v1.json';
import emptyFixture from '../../tests/fixtures/progress-backups/empty-v1.json';
import type { ProgressState } from './progressCodec';
import type { FlashcardProgressState } from '../domain/flashcardStudy';
import { encodeProgressBackup, parseProgressBackup, validateProgressBackup } from './progressBackupCodec';

const cloneFixture = () => structuredClone(fixture) as unknown;

describe('progress backup codec', () => {
  it('accepts the synthetic v1 contract while preserving unknown IDs and pruned totals', () => {
    const result = validateProgressBackup(cloneFixture());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.quiz.completionCounts['deleted-quiz']).toBe(2);
      expect(result.value.quiz.completedIds['pruned-completion']).toBe(true);
      expect(result.value.flashcards.checkpoints['deleted-deck'].openedCardIds).toContain('missing-card');
    }
  });

  it('accepts explicit empty progress and an absent optional daily aggregate', () => {
    expect(validateProgressBackup(structuredClone(emptyFixture)).ok).toBe(true);
    const legacyLocalPayload = structuredClone(fixture) as { flashcards: Record<string, unknown> };
    delete legacyLocalPayload.flashcards.dailyStats;
    expect(validateProgressBackup(legacyLocalPayload).ok).toBe(true);
  });

  it('rejects unsupported, malformed, oversized and dangerous input with fixed categories', () => {
    expect(parseProgressBackup('{')).toEqual({ ok: false, error: 'malformed-json' });
    expect(parseProgressBackup(' '.repeat(4 * 1024 * 1024 + 1))).toEqual({ ok: false, error: 'too-large' });
    expect(validateProgressBackup({ format: 'other', version: 1 })).toEqual({ ok: false, error: 'wrong-format' });
    expect(validateProgressBackup({ format: 'meducation-progress-backup', version: 2 })).toEqual({ ok: false, error: 'unsupported-version' });
    const dangerous = JSON.parse('{"format":"meducation-progress-backup","version":1,"exportedAt":"2026-10-13T00:00:00.000Z","quiz":{"__proto__":{}},"flashcards":{}}') as unknown;
    expect(validateProgressBackup(dangerous)).toEqual({ ok: false, error: 'invalid-progress' });
  });

  it('rejects semantic inconsistencies and runtime-only fields', () => {
    const wrongScore = cloneFixture() as { quiz: { completed: Array<{ score: { correct: number } }> } };
    wrongScore.quiz.completed[0].score.correct = 0;
    expect(validateProgressBackup(wrongScore).ok).toBe(false);

    const hasTimer = cloneFixture() as { quiz: { active: Record<string, Record<string, unknown>> } };
    hasTimer.quiz.active['deleted-quiz'].timerStartedAt = '2026-10-13T00:00:00.000Z';
    expect(validateProgressBackup(hasTimer).ok).toBe(false);
  });

  it('exports an explicit allowlist, omits revisions and running timers, then validates its own output', () => {
    const source = cloneFixture() as { quiz: Record<string, unknown>; flashcards: Record<string, unknown>; exportedAt: string };
    const quiz = { schemaVersion: 2, revision: 'private-revision', ...source.quiz } as unknown as ProgressState;
    (quiz.active['deleted-quiz'] as { timerStartedAt?: string }).timerStartedAt = '2026-10-13T00:00:00.000Z';
    const flashcards = { schemaVersion: 2, revision: 'private-revision', ...source.flashcards } as unknown as FlashcardProgressState;
    const encoded = encodeProgressBackup(quiz, flashcards, source.exportedAt);
    expect(encoded).toBeDefined();
    expect(encoded).not.toContain('private-revision');
    expect(encoded).not.toContain('timerStartedAt');
    expect(parseProgressBackup(encoded!).ok).toBe(true);
    const roundTrip = JSON.parse(encoded!) as { quiz: { active: Record<string, { elapsedMs: number }> } };
    expect(roundTrip.quiz.active['deleted-quiz'].elapsedMs).toBe(1200.5);
  });
});

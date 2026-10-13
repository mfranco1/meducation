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

  it('uses own-property access for valid IDs that shadow object prototype members', () => {
    const value = cloneFixture() as {
      quiz: {
        completed: Array<{ quizId: string }>;
        completionCounts: Record<string, number>;
        lowestScores: Record<string, number>;
        latestScores: Record<string, { percentage: number; completedAt: string }>;
      };
    };
    value.quiz.completed[0].quizId = 'toString';
    for (const key of ['completionCounts', 'lowestScores', 'latestScores'] as const) {
      const record = value.quiz[key] as Record<string, unknown>;
      const old = record['deleted-quiz'];
      delete record['deleted-quiz'];
      Object.defineProperty(record, 'toString', { value: old, enumerable: true, configurable: true, writable: true });
    }
    expect(validateProgressBackup(value).ok).toBe(true);
  });

  it('rejects unsupported, malformed, oversized and dangerous input with fixed categories', () => {
    expect(parseProgressBackup('{')).toEqual({ ok: false, error: 'malformed-json' });
    expect(parseProgressBackup(' '.repeat(4 * 1024 * 1024 + 1))).toEqual({ ok: false, error: 'too-large' });
    expect(validateProgressBackup({ format: 'other', version: 1 })).toEqual({ ok: false, error: 'wrong-format' });
    expect(validateProgressBackup({ format: 'meducation-progress-backup', version: 2 })).toEqual({ ok: false, error: 'unsupported-version' });
    const dangerous = JSON.parse('{"format":"meducation-progress-backup","version":1,"exportedAt":"2026-10-13T00:00:00.000Z","quiz":{"__proto__":{}},"flashcards":{}}') as unknown;
    expect(validateProgressBackup(dangerous)).toEqual({ ok: false, error: 'invalid-progress' });
    const nestedDangerous = cloneFixture() as { quiz: { completed: Array<{ responses: Record<string, Record<string, unknown>> }> } };
    const response = Object.values(nestedDangerous.quiz.completed[0].responses)[0]!;
    Object.defineProperty(response, 'constructor', { value: {}, enumerable: true });
    expect(validateProgressBackup(nestedDangerous).ok).toBe(false);
  });

  it('returns a detached allowlisted value and canonicalizes map ordering', () => {
    const first = cloneFixture() as { quiz: { completionCounts: Record<string, number> } };
    const second = structuredClone(first);
    second.quiz.completionCounts = Object.fromEntries(Object.entries(second.quiz.completionCounts).reverse());
    const parsedFirst = validateProgressBackup(first);
    const parsedSecond = validateProgressBackup(second);
    expect(parsedFirst.ok && parsedSecond.ok).toBe(true);
    if (parsedFirst.ok && parsedSecond.ok) {
      expect(JSON.stringify(parsedFirst.value)).toBe(JSON.stringify(parsedSecond.value));
      first.quiz.completionCounts['deleted-quiz'] = 99;
      expect(parsedFirst.value.quiz.completionCounts['deleted-quiz']).toBe(2);
    }
  });

  it('rejects semantic inconsistencies and runtime-only fields', () => {
    const wrongScore = cloneFixture() as { quiz: { completed: Array<{ score: { correct: number } }> } };
    wrongScore.quiz.completed[0].score.correct = 0;
    expect(validateProgressBackup(wrongScore).ok).toBe(false);

    const hasTimer = cloneFixture() as { quiz: { active: Record<string, Record<string, unknown>> } };
    hasTimer.quiz.active['deleted-quiz'].timerStartedAt = '2026-10-13T00:00:00.000Z';
    expect(validateProgressBackup(hasTimer).ok).toBe(false);
  });

  it('rejects live export sources with unknown or malformed stored fields', () => {
    const source = cloneFixture() as { quiz: Record<string, unknown>; flashcards: Record<string, unknown>; exportedAt: string };
    const quiz = { schemaVersion: 2, revision: 'revision', ...source.quiz } as unknown as ProgressState;
    const flashcards = { schemaVersion: 2, revision: 'revision', ...source.flashcards } as unknown as FlashcardProgressState;
    (quiz.active['deleted-quiz'] as unknown as Record<string, unknown>).unexpected = true;
    expect(encodeProgressBackup(quiz, flashcards, source.exportedAt)).toBeUndefined();
    delete (quiz.active['deleted-quiz'] as unknown as Record<string, unknown>).unexpected;
    (quiz.active['deleted-quiz'] as { timerStartedAt?: string }).timerStartedAt = 'not-a-canonical-date';
    expect(encodeProgressBackup(quiz, flashcards, source.exportedAt)).toBeUndefined();
  });

  it('enforces the active signature boundary and canonical timestamps', () => {
    const exactLimit = cloneFixture() as { quiz: { active: Record<string, { contentSignature: string }> } };
    exactLimit.quiz.active['deleted-quiz'].contentSignature = 'x'.repeat(512 * 1024);
    expect(validateProgressBackup(exactLimit).ok).toBe(true);
    exactLimit.quiz.active['deleted-quiz'].contentSignature += 'x';
    expect(validateProgressBackup(exactLimit).ok).toBe(false);

    const badDate = cloneFixture() as { exportedAt: string };
    badDate.exportedAt = '2026-02-30T00:00:00.000Z';
    expect(validateProgressBackup(badDate).ok).toBe(false);
  });

  it('bounds arbitrary tree depth and declared containers before schema processing', () => {
    const deep = cloneFixture() as Record<string, unknown>;
    let nested: Record<string, unknown> = {};
    deep.extra = nested;
    for (let i = 0; i < 17; i++) {
      const child: Record<string, unknown> = {};
      nested.child = child;
      nested = child;
    }
    expect(validateProgressBackup(deep).ok).toBe(false);

    const wide = cloneFixture() as { extra?: unknown };
    wide.extra = new Array(10_001).fill(null);
    expect(validateProgressBackup(wide).ok).toBe(false);
  });

  it('rejects duplicate retained IDs, fractional counts, unsafe sums and mismatched response keys', () => {
    const duplicate = cloneFixture() as { quiz: { completed: unknown[] } };
    duplicate.quiz.completed.push(structuredClone(duplicate.quiz.completed[0]));
    expect(validateProgressBackup(duplicate).ok).toBe(false);

    const fractional = cloneFixture() as { quiz: { completionCounts: Record<string, number> } };
    fractional.quiz.completionCounts['deleted-quiz'] = 1.5;
    expect(validateProgressBackup(fractional).ok).toBe(false);

    const unsafe = cloneFixture() as { quiz: { completionCounts: Record<string, number> } };
    unsafe.quiz.completionCounts['deleted-quiz'] = Number.MAX_SAFE_INTEGER;
    expect(validateProgressBackup(unsafe).ok).toBe(false);

    const mismatched = cloneFixture() as { quiz: { completed: Array<{ responses: Record<string, { questionId: string }> }> } };
    mismatched.quiz.completed[0].responses['removed-item'].questionId = 'different-item';
    expect(validateProgressBackup(mismatched).ok).toBe(false);
  });

  it('normalizes the only selected legacy live default without inventing daily history', () => {
    const source = cloneFixture() as { quiz: Record<string, unknown>; flashcards: Record<string, unknown>; exportedAt: string };
    const quiz = { schemaVersion: 2, revision: 'revision', ...source.quiz } as unknown as ProgressState;
    const legacy = { ...source.flashcards } as Record<string, unknown>;
    delete legacy.completionCounts;
    delete legacy.dailyStats;
    const flashcards = { schemaVersion: 2, revision: 'revision', ...legacy } as unknown as FlashcardProgressState;
    const encoded = encodeProgressBackup(quiz, flashcards, source.exportedAt);
    expect(encoded).toBeDefined();
    const output = JSON.parse(encoded!) as { flashcards: { completionCounts: Record<string, number>; dailyStats?: unknown } };
    expect(output.flashcards.completionCounts).toEqual({});
    expect(output.flashcards.dailyStats).toBeUndefined();
  });

  it('exports an explicit allowlist, omits revisions and running timers, then validates its own output', () => {
    const source = cloneFixture() as { quiz: Record<string, unknown>; flashcards: Record<string, unknown>; exportedAt: string };
    const quiz = { schemaVersion: 2, revision: 'private-revision', ...source.quiz } as unknown as ProgressState;
    (quiz.active['deleted-quiz'] as { timerStartedAt?: string }).timerStartedAt = '2026-10-12T23:59:50.000Z';
    const flashcards = { schemaVersion: 2, revision: 'private-revision', ...source.flashcards } as unknown as FlashcardProgressState;
    const encoded = encodeProgressBackup(quiz, flashcards, source.exportedAt);
    expect(encoded).toBeDefined();
    expect(encoded).not.toContain('private-revision');
    expect(encoded).not.toContain('timerStartedAt');
    expect(parseProgressBackup(encoded!).ok).toBe(true);
    const roundTrip = JSON.parse(encoded!) as { quiz: { active: Record<string, { elapsedMs: number }> } };
    expect(roundTrip.quiz.active['deleted-quiz'].elapsedMs).toBe(1200.5);
    expect(roundTrip.quiz.active['deleted-quiz']).not.toHaveProperty('timerStartedAt');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attempt, CompletedAttempt } from '../domain/types';
import { LocalAttemptRepository } from './localRepository';

const activeAttempt = (quizId: string, startedAt = '2026-09-20T00:00:00.000Z'): Attempt => ({
  id: `attempt-${quizId}`,
  quizId,
  subjectId: 'subject',
  feedbackMode: 'exam',
  startedAt,
  responses: {},
});

const completedAttempt = (quizId: string, completedAt: string): CompletedAttempt => ({
  ...activeAttempt(quizId),
  completedAt,
  score: { correct: 1, incorrect: 0, unanswered: 0, total: 1, percentage: 100, elapsedMs: 0 },
});

describe('LocalAttemptRepository quiz activity', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('records the latest active save time for a quiz', () => {
    vi.setSystemTime(new Date('2026-09-21T10:00:00.000Z'));
    const repository = new LocalAttemptRepository();

    repository.saveActive(activeAttempt('quiz'));

    expect(repository.latestActivityAt('quiz')).toBe('2026-09-21T10:00:00.000Z');
  });

  it('uses completion time as the quiz activity time', () => {
    vi.setSystemTime(new Date('2026-09-21T10:00:00.000Z'));
    const repository = new LocalAttemptRepository();

    repository.saveActive(activeAttempt('quiz'));
    repository.saveCompleted(completedAttempt('quiz', '2026-09-22T11:00:00.000Z'));

    expect(repository.latestActivityAt('quiz')).toBe('2026-09-22T11:00:00.000Z');
  });

  it('derives activity for existing browser data that lacks an activity summary', () => {
    localStorage.setItem('meducation.active-attempts.v1', JSON.stringify({ active: activeAttempt('active', '2026-09-21T10:00:00.000Z') }));
    localStorage.setItem('meducation.latest-scores.v1', JSON.stringify({ completed: { percentage: 75, completedAt: '2026-09-22T11:00:00.000Z' } }));
    const repository = new LocalAttemptRepository();

    expect(repository.latestActivityAt('active')).toBe('2026-09-21T10:00:00.000Z');
    expect(repository.latestActivityAt('completed')).toBe('2026-09-22T11:00:00.000Z');
    expect(repository.latestActivityAt('unused')).toBeUndefined();
  });
});

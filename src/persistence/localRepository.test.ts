import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAttemptRepository } from './localRepository';

const legacyQuizId = 'anat_histo-5-anatomy-practice-test-1-handout-october-2026';
const legacyQuestionId = `${legacyQuizId}-q-1`;
const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};

describe('LocalAttemptRepository content identity migration', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', storage);
    storage.clear();
  });

  it('migrates persisted attempts and quiz-keyed summaries once', () => {
    const attempt = {
      id: 'attempt-1', quizId: legacyQuizId, subjectId: 'anat_histo', feedbackMode: 'exam' as const, startedAt: new Date(0).toISOString(),
      currentQuestionId: legacyQuestionId,
      responses: { [legacyQuestionId]: { questionId: legacyQuestionId, selectedChoiceId: 'A', flagged: false, locked: false, timeMs: 10 } },
      completedAt: new Date(1).toISOString(), score: { correct: 1, incorrect: 0, unanswered: 0, total: 1, percentage: 100, elapsedMs: 10 },
    };
    localStorage.setItem('meducation.completed-attempts.v1', JSON.stringify([attempt]));
    localStorage.setItem('meducation.active-attempts.v1', JSON.stringify({ [legacyQuizId]: attempt }));
    localStorage.setItem('meducation.completion-counts.v1', JSON.stringify({ [legacyQuizId]: 1 }));
    localStorage.setItem('meducation.lowest-scores.v1', JSON.stringify({ [legacyQuizId]: 100 }));
    localStorage.setItem('meducation.latest-scores.v1', JSON.stringify({ [legacyQuizId]: { percentage: 100, completedAt: attempt.completedAt } }));

    const repository = new LocalAttemptRepository();
    expect(repository.list()[0]).toMatchObject({ quizId: 'q1', subjectId: 's1', currentQuestionId: 'i1' });
    expect(repository.list()[0].responses.i1.questionId).toBe('i1');
    expect(repository.getActive('q1')?.quizId).toBe('q1');
    expect(repository.completionCount('q1')).toBe(1);
    expect(repository.lowestScore('q1')).toBe(100);
    expect(repository.latestScore('q1')).toEqual({ percentage: 100, completedAt: attempt.completedAt });
  });

  it('keeps absent summary caches eligible for lazy reconstruction', () => {
    const attempt = {
      id: 'attempt-2', quizId: legacyQuizId, subjectId: 'anat_histo', feedbackMode: 'exam' as const, startedAt: new Date(0).toISOString(), responses: {},
      completedAt: new Date(1).toISOString(), score: { correct: 1, incorrect: 0, unanswered: 0, total: 1, percentage: 100, elapsedMs: 10 },
    };
    localStorage.setItem('meducation.completed-attempts.v1', JSON.stringify([attempt]));

    const repository = new LocalAttemptRepository();
    expect(repository.completionCount('q1')).toBe(1);
    expect(repository.lowestScore('q1')).toBe(100);
    expect(repository.latestScore('q1')).toEqual({ percentage: 100, completedAt: attempt.completedAt });
  });
});

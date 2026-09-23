import { describe, expect, it } from 'vitest';
import type { AttemptRepository, CompletedAttempt, QuizRepository } from '../domain/types';
import { quizProgressForSubject, subjectStatsFor } from './progress';

const bank: QuizRepository = {
  listSubjects: () => [{ id: 's1', name: 'First', accent: '#111' }, { id: 's2', name: 'Second', accent: '#222' }],
  listQuizzes: subjectId => subjectId === 's1'
    ? [{ id: 'q1', subjectId, name: 'One', questionCount: 2 }, { id: 'q2', subjectId, name: 'Two', questionCount: 1 }]
    : [{ id: 'q3', subjectId, name: 'Three', questionCount: 1 }],
  listQuestions: quizId => quizId === 'q1'
    ? [{ id: 'i1', quizId, stem: '', choices: [], rationale: '', metadata: {} }, { id: 'i2', quizId, stem: '', choices: [], rationale: '', metadata: {} }]
    : [{ id: 'i3', quizId, stem: '', choices: [], rationale: '', metadata: {} }],
};

const completed = (quizId: string, subjectId: string, percentage: number, completedAt: string): CompletedAttempt => ({
  id: `${quizId}-${completedAt}`,
  quizId,
  subjectId,
  feedbackMode: 'exam',
  startedAt: completedAt,
  completedAt,
  responses: {},
  score: { correct: 1, incorrect: 0, unanswered: 0, total: 1, percentage, elapsedMs: 0 },
});

const attempts: AttemptRepository = {
  list: () => [],
  completionCount: quizId => quizId === 'q1' ? 2 : 0,
  lowestScore: () => undefined,
  latestScore: quizId => quizId === 'q1' ? { percentage: 80, completedAt: '2026-09-02T00:00:00.000Z' } : undefined,
  latestActivityAt: quizId => quizId === 'q2' ? '2026-09-03T00:00:00.000Z' : undefined,
  getActive: quizId => quizId === 'q2'
    ? { id: 'active', quizId, subjectId: 's1', feedbackMode: 'exam', startedAt: '2026-09-01T00:00:00.000Z', currentQuestionId: 'i3', responses: {} }
    : undefined,
  saveActive: () => {},
  clearActive: () => {},
  saveCompleted: () => {},
};

describe('learner progress selectors', () => {
  const history = [
    completed('q1', 's1', 60, '2026-09-01T00:00:00.000Z'),
    completed('q1', 's1', 80, '2026-09-02T00:00:00.000Z'),
  ];

  it('derives subject statistics from repository data and history', () => {
    const stats = subjectStatsFor(bank, attempts, history);
    expect(stats[0]).toMatchObject({ quizCount: 2, activeQuizCount: 1, latest: 80, trend: 'increase' });
    expect(stats[0].latestActiveAt).toBe('2026-09-03T00:00:00.000Z');
    expect(stats[1]).toMatchObject({ quizCount: 1, activeQuizCount: 0 });
  });

  it('orders subject quizzes by activity and carries resume position', () => {
    const progress = quizProgressForSubject(bank, attempts, history, 's1');
    expect(progress.map(item => item.quiz.id)).toEqual(['q2', 'q1']);
    expect(progress[0].currentQuestion).toBe(1);
    expect(progress[1]).toMatchObject({ completionCount: 2, latestScore: 80, trend: 'increase' });
  });
});

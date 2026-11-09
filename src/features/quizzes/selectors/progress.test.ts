import { describe, expect, it } from 'vitest';
import type { CompletedAttempt, QuizRepository } from '../../../domain/types';
import type { ProgressState } from '../../../persistence/progressCodec';
import {
  activeSubjectStats,
  createProgressView,
  dashboardScoreSummary,
  quizProgressForSubject,
  subjectStatsFor,
} from './progress';

const bank: QuizRepository = {
  listSubjects: () => [
    { id: 's1', name: 'First', accent: '#111' },
    { id: 's2', name: 'Second', accent: '#222' },
  ],
  listQuizzes: (subjectId) =>
    subjectId === 's1'
      ? [
          { id: 'q1', subjectId, topicId: 't1', name: 'One', questionCount: 2 },
          { id: 'q2', subjectId, topicId: 't1', name: 'Two', questionCount: 1 },
        ]
      : [{ id: 'q3', subjectId, topicId: 't1', name: 'Three', questionCount: 1 }],
  listQuestions: (quizId) =>
    quizId === 'q1'
      ? [
          { id: 'i1', quizId, stem: '', choices: [], answer: 'A', rationale: '', metadata: {} },
          { id: 'i2', quizId, stem: '', choices: [], answer: 'A', rationale: '', metadata: {} },
        ]
      : [{ id: 'i3', quizId, stem: '', choices: [], answer: 'A', rationale: '', metadata: {} }],
};

const completed = (quizId: string, subjectId: string, percentage: number, completedAt: string): CompletedAttempt => ({
  id: `${quizId}-${completedAt}`,
  quizId,
  subjectId,
  feedbackMode: 'exam',
  elapsedMs: 0,
  celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
  contentSignature: 'fixture-content',
  startedAt: completedAt,
  completedAt,
  responses: {},
  score: { correct: 1, incorrect: 0, unanswered: 0, total: 1, percentage, elapsedMs: 0 },
});

describe('learner progress selectors', () => {
  const history = [
    completed('q1', 's1', 60, '2026-09-01T00:00:00.000Z'),
    completed('q1', 's1', 80, '2026-09-02T00:00:00.000Z'),
  ];
  const snapshot: ProgressState = {
    schemaVersion: 2,
    revision: 'test',
    completed: history,
    active: {
      q2: {
        id: 'active',
        quizId: 'q2',
        subjectId: 's1',
        feedbackMode: 'exam',
        elapsedMs: 0,
        celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
        contentSignature: 'fixture-content',
        startedAt: '2026-09-01T00:00:00.000Z',
        currentQuestionId: 'i3',
        responses: {},
      },
    },
    completionCounts: { q1: 2 },
    lowestScores: {},
    latestScores: { q1: { percentage: 80, completedAt: '2026-09-02T00:00:00.000Z' } },
    activity: { q2: '2026-09-03T00:00:00.000Z' },
    completedIds: {},
  };
  const progress = createProgressView(snapshot);

  it('derives subject statistics from repository data and history', () => {
    const stats = subjectStatsFor(bank, progress);
    expect(stats[0]).toMatchObject({
      quizCount: 2,
      completedQuizCount: 1,
      activeQuizCount: 1,
      latest: 80,
      trend: 'increase',
    });
    expect(stats[0].latestActiveAt).toBe('2026-09-03T00:00:00.000Z');
    expect(stats[1]).toMatchObject({ quizCount: 1, completedQuizCount: 0, activeQuizCount: 0 });
  });

  it('derives dashboard statistics from subject membership before quiz catalogs load', () => {
    const unloaded: QuizRepository = { ...bank, listQuizzes: () => [] };
    const stats = subjectStatsFor(unloaded, progress, [
      { id: 's1', quizIds: ['q1', 'q2'] },
      { id: 's2', quizIds: ['q3'] },
    ]);
    expect(stats[0]).toMatchObject({ quizCount: 2, activeQuizCount: 1, latest: 80, trend: 'increase' });
    expect(stats[0].latestActiveAt).toBe('2026-09-03T00:00:00.000Z');
  });

  it('keeps durable latest scores after history pruning and excludes removed quizzes', () => {
    const unloaded: QuizRepository = { ...bank, listQuizzes: () => [] };
    const pruned = createProgressView({ ...snapshot, completed: [] });
    const retained = subjectStatsFor(unloaded, pruned, [
      { id: 's1', quizIds: ['q1'] },
      { id: 's2', quizIds: [] },
    ]);
    expect(retained[0]).toMatchObject({ quizCount: 1, latest: 80 });
    expect(retained[0].trend).toBeUndefined();
    const removed = subjectStatsFor(unloaded, pruned, [
      { id: 's1', quizIds: ['q2'] },
      { id: 's2', quizIds: [] },
    ]);
    expect(removed[0].latest).toBeUndefined();
  });

  it('keeps canonical quiz order and carries answered count and activity', () => {
    const quizzes = quizProgressForSubject(bank, progress, 's1');
    expect(quizzes.map((item) => item.quiz.id)).toEqual(['q1', 'q2']);
    expect(quizzes[1].answeredCount).toBe(0);
    expect(quizzes[0].answeredCount).toBeUndefined();
    expect(quizzes[1].activityAt).toBeDefined();
    expect(quizzes[0]).toMatchObject({ completionCount: 2, latestScore: 80, trend: 'increase' });
  });

  it('summarizes the average and lowest latest subject scores', () => {
    const subject = (id: string, name: string, latest?: number) => ({
      subject: { id, name },
      quizCount: 1,
      completedQuizCount: 0,
      activeQuizCount: 0,
      latest,
      latestCompletedAt: latest === undefined ? undefined : '2026-09-02T00:00:00.000Z',
    });
    expect(
      dashboardScoreSummary([subject('a', 'Alpha', 80), subject('b', 'Beta', 60), subject('c', 'Gamma')] as never),
    ).toEqual({ averageLatest: 70, personalLowest: 60, personalLowestSubject: 'Beta' });
    expect(dashboardScoreSummary([])).toEqual({
      averageLatest: undefined,
      personalLowest: undefined,
      personalLowestSubject: undefined,
    });
  });
});

const subject = { id: 'subject', name: 'Biochemistry', description: '', accent: '#b9511b' };

describe('active subject stats', () => {
  it('includes only active subjects and orders them by active-quiz activity', () => {
    const newer = {
      subject: { ...subject, id: 'newer', name: 'Newer' },
      quizCount: 2,
      completedQuizCount: 0,
      activeQuizCount: 1,
      latestActiveAt: '2026-09-22T10:00:00.000Z',
    };
    const inactive = {
      subject: { ...subject, id: 'inactive', name: 'Inactive' },
      quizCount: 2,
      completedQuizCount: 0,
      activeQuizCount: 0,
      latestActiveAt: '2026-09-23T10:00:00.000Z',
    };
    const older = {
      subject: { ...subject, id: 'older', name: 'Older' },
      quizCount: 2,
      completedQuizCount: 0,
      activeQuizCount: 1,
      latestActiveAt: '2026-09-21T10:00:00.000Z',
    };

    expect(activeSubjectStats([older, inactive, newer]).map((stat) => stat.subject.name)).toEqual(['Newer', 'Older']);
  });

  it('preserves catalog order when active-subject activity is tied', () => {
    const first = {
      subject: { ...subject, id: 'first', name: 'First' },
      quizCount: 2,
      completedQuizCount: 0,
      activeQuizCount: 1,
      latestActiveAt: '2026-09-22T10:00:00.000Z',
    };
    const second = {
      subject: { ...subject, id: 'second', name: 'Second' },
      quizCount: 2,
      completedQuizCount: 0,
      activeQuizCount: 1,
      latestActiveAt: '2026-09-22T10:00:00.000Z',
    };

    expect(activeSubjectStats([first, second]).map((stat) => stat.subject.name)).toEqual(['First', 'Second']);
  });
});

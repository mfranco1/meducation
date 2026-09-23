import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Attempt, AttemptRepository, Quiz, QuizRepository } from '../../domain/types';
import { useQuizSession } from './useQuizSession';

const subject = { id: 'subject', name: 'Subject', accent: '#123456' };
const quiz: Quiz = { id: 'quiz', subjectId: subject.id, name: 'Quiz', questionCount: 2 };
const activeAttempt: Attempt = { id: 'saved', quizId: quiz.id, subjectId: subject.id, feedbackMode: 'exam', startedAt: '2026-09-20T00:00:00.000Z', responses: {} };

function setup() {
  const questionBank: QuizRepository = {
    listSubjects: () => [subject],
    listQuizzes: () => [quiz],
    listQuestions: () => [
      { id: 'q1', quizId: quiz.id, stem: 'One', choices: [], rationale: '', metadata: {} },
      { id: 'q2', quizId: quiz.id, stem: 'Two', choices: [], rationale: '', metadata: {} },
    ],
  };
  const attempts: AttemptRepository = {
    list: () => [], completionCount: () => 3, lowestScore: () => 50,
    latestScore: () => ({ percentage: 80, completedAt: '2026-09-19T00:00:00.000Z' }),
    latestActivityAt: () => '2026-09-20T00:00:00.000Z', getActive: () => activeAttempt,
    saveActive: vi.fn(), clearActive: vi.fn(), saveCompleted: vi.fn(),
  };
  const writes = attempts as unknown as { saveActive: ReturnType<typeof vi.fn>; clearActive: ReturnType<typeof vi.fn>; saveCompleted: ReturnType<typeof vi.fn> };
  const hook = renderHook(() => useQuizSession(questionBank, attempts));
  return { ...hook, attempts, writes };
}

describe('read-only quiz browse session', () => {
  it('navigates and exits without writing attempts or changing attempt summaries', () => {
    const { result, writes, attempts } = setup();
    const before = {
      active: attempts.getActive(quiz.id), completed: attempts.list(),
      count: attempts.completionCount(quiz.id), latest: attempts.latestScore(quiz.id),
      lowest: attempts.lowestScore(quiz.id), activity: attempts.latestActivityAt(quiz.id),
    };

    act(() => result.current.browseQuiz(quiz));
    expect(result.current.view).toEqual({ page: 'quiz-browse', quiz, index: 0 });
    act(() => result.current.navigateBrowse(1));
    expect(result.current.view).toEqual({ page: 'quiz-browse', quiz, index: 1 });
    act(() => result.current.leaveBrowse());
    expect(result.current.view).toEqual({ page: 'subject', subject });
    expect(writes.saveActive).not.toHaveBeenCalled();
    expect(writes.saveCompleted).not.toHaveBeenCalled();
    expect(writes.clearActive).not.toHaveBeenCalled();
    expect({
      active: attempts.getActive(quiz.id), completed: attempts.list(),
      count: attempts.completionCount(quiz.id), latest: attempts.latestScore(quiz.id),
      lowest: attempts.lowestScore(quiz.id), activity: attempts.latestActivityAt(quiz.id),
    }).toEqual(before);
  });

  it('clamps direct navigation to the available question range', () => {
    const { result } = setup();
    act(() => result.current.browseQuiz(quiz));
    act(() => result.current.navigateBrowse(99));
    expect(result.current.view).toMatchObject({ page: 'quiz-browse', index: 1 });
    act(() => result.current.navigateBrowse(-1));
    expect(result.current.view).toMatchObject({ page: 'quiz-browse', index: 0 });
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitAnswer } from '../../domain/quizEngine';
import { contentSignature } from '../../domain/contentSignature';
import type { Attempt, AttemptRepository, Question, Quiz, QuizRepository } from '../../domain/types';
import { useQuizSession } from './useQuizSession';

const subject = { id: 'subject', name: 'Subject', accent: '#123456' };
const quiz: Quiz = { id: 'quiz', subjectId: subject.id, name: 'Quiz', questionCount: 2 };
const questions: Question[] = [
  { id: 'q1', quizId: quiz.id, stem: 'One', choices: [{ id: 'A', text: 'A' }], verifiedAnswer: 'A', rationale: '', metadata: {} },
  { id: 'q2', quizId: quiz.id, stem: 'Two', choices: [{ id: 'A', text: 'A' }], verifiedAnswer: 'A', rationale: '', metadata: {} },
];
const activeAttempt: Attempt = { id: 'saved', quizId: quiz.id, subjectId: subject.id, feedbackMode: 'exam', startedAt: '2026-09-20T00:00:00.000Z', contentSignature: contentSignature(questions), responses: {} };

afterEach(() => vi.useRealTimers());

function setup() {
  const questionBank: QuizRepository = {
    listSubjects: () => [subject],
    listQuizzes: () => [quiz],
    listQuestions: () => questions,
  };
  const attempts: AttemptRepository = {
    list: () => [], completionCount: () => 3, lowestScore: () => 50,
    latestScore: () => ({ percentage: 80, completedAt: '2026-09-19T00:00:00.000Z' }),
    latestActivityAt: () => '2026-09-20T00:00:00.000Z', getActive: vi.fn(() => activeAttempt),
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

describe('Exam Mode results review', () => {
  it('opens only from newly completed Exam Mode results and never writes progress while reviewing', () => {
    const { result, writes } = setup();
    act(() => result.current.startQuiz(quiz, 'exam'));
    act(() => result.current.finishQuiz());
    expect(result.current.view.page).toBe('results');
    const completedWrites = writes.saveCompleted.mock.calls.length;

    act(() => result.current.reviewResults());
    expect(result.current.view).toMatchObject({ page: 'quiz-review', index: 0 });
    act(() => result.current.navigateReview(99));
    expect(result.current.view).toMatchObject({ page: 'quiz-review', index: 1 });
    act(() => result.current.leaveReview());
    expect(result.current.view).toEqual({ page: 'subject', subject });
    expect(writes.saveCompleted).toHaveBeenCalledTimes(completedWrites);
    expect(writes.saveActive).toHaveBeenCalledTimes(1);

    act(() => result.current.reviewResults());
    expect(result.current.view.page).toBe('subject');
  });

  it('does not open review for Fast Feedback results', () => {
    const { result } = setup();
    act(() => result.current.startQuiz(quiz, 'immediate'));
    act(() => result.current.finishQuiz());
    act(() => result.current.reviewResults());
    expect(result.current.view.page).toBe('results');
  });
});

describe('quiz exit destinations', () => {
  it('leaves an active quiz for Dashboard after saving its current question', () => {
    const { result, writes } = setup();

    act(() => result.current.resumeQuiz(quiz));
    writes.saveActive.mockClear();
    act(() => result.current.leaveQuiz('dashboard'));

    expect(result.current.view).toEqual({ page: 'dashboard' });
    expect(writes.saveActive).toHaveBeenCalledOnce();
    expect(writes.clearActive).not.toHaveBeenCalled();
  });

  it('aborts an active quiz and opens Dashboard', () => {
    const { result, writes } = setup();

    act(() => result.current.resumeQuiz(quiz));
    writes.saveActive.mockClear();
    act(() => result.current.abortQuiz('dashboard'));

    expect(result.current.view).toEqual({ page: 'dashboard' });
    expect(writes.clearActive).toHaveBeenCalledWith(quiz.id);
    expect(writes.saveActive).not.toHaveBeenCalled();
  });

  it('saves an active quiz before leaving for Flashcards and clears it on abort', () => {
    const { result, writes } = setup();
    act(() => result.current.resumeQuiz(quiz));
    writes.saveActive.mockClear();
    act(() => result.current.leaveQuiz('flashcards'));
    expect(result.current.view).toEqual({ page: 'flashcards' });
    expect(writes.saveActive).toHaveBeenCalledOnce();

    act(() => result.current.resumeQuiz(quiz));
    act(() => result.current.abortQuiz('flashcards'));
    expect(result.current.view).toEqual({ page: 'flashcards' });
    expect(writes.clearActive).toHaveBeenCalledWith(quiz.id);
  });

  it('can leave read-only results review for Flashcards without changing the completed record', () => {
    const { result, writes } = setup();
    act(() => result.current.startQuiz(quiz, 'exam'));
    act(() => result.current.finishQuiz());
    const completedWrites = writes.saveCompleted.mock.calls.length;
    act(() => result.current.reviewResults());
    act(() => result.current.leaveReview('flashcards'));
    expect(result.current.view).toEqual({ page: 'flashcards' });
    expect(writes.saveCompleted).toHaveBeenCalledTimes(completedWrites);
  });
});

describe('saved content and storage recovery', () => {
  it('requires an explicit restart for a legacy active attempt and keeps it when cancelled', () => {
    const { result, attempts, writes } = setup();
    vi.mocked(attempts.getActive).mockReturnValue({ ...activeAttempt, contentSignature: undefined });

    act(() => result.current.resumeQuiz(quiz));
    expect(result.current.pendingResume?.reason).toBe('legacy');
    expect(result.current.view.page).toBe('dashboard');
    expect(writes.saveActive).not.toHaveBeenCalled();
    act(() => result.current.cancelPendingResume());
    expect(result.current.pendingResume).toBeUndefined();
    expect(writes.saveActive).not.toHaveBeenCalled();

    act(() => result.current.resumeQuiz(quiz));
    act(() => result.current.restartPendingResume());
    expect(writes.saveActive).toHaveBeenCalledWith(expect.objectContaining({
      contentSignature: contentSignature(questions), feedbackMode: 'exam', responses: {},
    }));
    expect(result.current.view.page).toBe('quiz');
  });

  it('blocks resume when scoring-relevant content changed', () => {
    const { result, attempts, writes } = setup();
    vi.mocked(attempts.getActive).mockReturnValue({ ...activeAttempt, contentSignature: 'old-content' });
    act(() => result.current.resumeQuiz(quiz));
    expect(result.current.pendingResume?.reason).toBe('changed');
    expect(writes.saveActive).not.toHaveBeenCalled();
  });

  it('keeps the quiz open and reports a failed completion write', () => {
    const { result, writes } = setup();
    act(() => result.current.startQuiz(quiz, 'exam'));
    writes.saveCompleted.mockImplementation(() => { throw new Error('Quota exceeded'); });
    act(() => result.current.finishQuiz());
    expect(result.current.view.page).toBe('quiz');
    expect(result.current.persistenceError).toMatch(/could not be saved/i);
  });
});

describe('Fast Feedback completion timing', () => {
  it('freezes at the final locked answer and keeps time fixed through review, leave/resume, and submission', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T00:00:00.000Z'));
    const { result, writes, attempts } = setup();

    act(() => result.current.startQuiz(quiz, 'immediate'));
    let current = result.current.view.page === 'quiz' ? result.current.view.attempt : undefined;
    expect(current).toBeDefined();
    vi.advanceTimersByTime(2_000);
    current = commitAnswer(current!, questions[1], 'A').attempt;
    act(() => result.current.checkpoint(current!, 1));
    vi.advanceTimersByTime(3_000);
    current = commitAnswer(current!, questions[0], 'A').attempt;
    act(() => result.current.checkpoint(current!, 0));

    expect(result.current.view).toMatchObject({ page: 'quiz', attempt: { elapsedMs: 5_000, timerStartedAt: undefined } });
    vi.advanceTimersByTime(30_000);
    current = result.current.view.page === 'quiz' ? result.current.view.attempt : current;
    act(() => result.current.checkpoint(current!, 1));
    expect(result.current.view).toMatchObject({ page: 'quiz', attempt: { elapsedMs: 5_000, timerStartedAt: undefined } });

    const pausedAttempt = (writes.saveActive as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as Attempt;
    vi.advanceTimersByTime(10_000);
    vi.mocked(attempts.getActive).mockReturnValue(pausedAttempt);
    act(() => result.current.leaveQuiz());
    vi.mocked(attempts.getActive).mockReturnValue(pausedAttempt);
    act(() => result.current.resumeQuiz(quiz));
    expect(result.current.view).toMatchObject({ page: 'quiz', attempt: { elapsedMs: 5_000, timerStartedAt: undefined } });

    vi.advanceTimersByTime(20_000);
    act(() => result.current.finishQuiz());
    expect(writes.saveCompleted).toHaveBeenCalledOnce();
    expect(writes.saveCompleted).toHaveBeenCalledWith(expect.objectContaining({ score: expect.objectContaining({ elapsedMs: 5_000 }) }));
  });

  it('keeps incomplete Fast Feedback and Exam Mode timers running when resumed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T00:00:00.000Z'));
    const { result, attempts } = setup();
    const incompleteFast: Attempt = { ...activeAttempt, feedbackMode: 'immediate', elapsedMs: 2_000, responses: { q1: { questionId: 'q1', selectedChoiceId: 'A', locked: true, flagged: false, timeMs: 0 } } };
    vi.mocked(attempts.getActive).mockReturnValue(incompleteFast);

    act(() => result.current.resumeQuiz(quiz));
    expect(result.current.view).toMatchObject({ page: 'quiz', attempt: { elapsedMs: 2_000, timerStartedAt: '2026-09-30T00:00:00.000Z' } });

    const exam: Attempt = { ...activeAttempt, elapsedMs: 2_000 };
    vi.mocked(attempts.getActive).mockReturnValue(exam);
    act(() => result.current.resumeQuiz(quiz));
    expect(result.current.view).toMatchObject({ page: 'quiz', attempt: { timerStartedAt: '2026-09-30T00:00:00.000Z' } });
  });

  it('keeps an already answered saved Fast Feedback attempt paused when resumed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T00:00:00.000Z'));
    const { result, attempts } = setup();
    const complete: Attempt = {
      ...activeAttempt,
      feedbackMode: 'immediate',
      elapsedMs: 8_000,
      timerStartedAt: undefined,
      responses: Object.fromEntries(questions.map(question => [question.id, { questionId: question.id, selectedChoiceId: 'A', locked: true, flagged: false, timeMs: 0 }])),
    };
    vi.mocked(attempts.getActive).mockReturnValue(complete);

    act(() => result.current.resumeQuiz(quiz));
    expect(result.current.view).toMatchObject({ page: 'quiz', attempt: { elapsedMs: 8_000, timerStartedAt: undefined } });
  });
});

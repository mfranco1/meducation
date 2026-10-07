import { describe, expect, it } from 'vitest';
import { screenIdentity, type View } from './navigation';

describe('screenIdentity', () => {
  it('uses the quiz and attempt identity while ignoring question progress and attempt updates', () => {
    const quiz = { id: 'quiz', subjectId: 'medicine', name: 'Quiz', questionCount: 2 };
    const attempt = { id: 'attempt', quizId: 'quiz', subjectId: 'medicine', feedbackMode: 'immediate' as const, elapsedMs: 0, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, contentSignature: 'fixture-content', startedAt: 'now', responses: {} };
    const base: View = { page: 'quiz', quiz, attempt, index: 0 };
    const nextQuestion: View = { ...base, index: 1 };
    const updatedAttempt: View = { ...base, attempt: { ...attempt, elapsedMs: 5000, responses: { q1: { questionId: 'q1', selectedChoiceId: 'a', flagged: false, locked: true, timeMs: 100 } } } };
    expect(screenIdentity(base)).toBe('quiz:quiz:attempt');
    expect(screenIdentity(nextQuestion)).toBe(screenIdentity(base));
    expect(screenIdentity(updatedAttempt)).toBe(screenIdentity(base));
  });

  it('changes for a different top-level destination', () => {
    const dashboard: View = { page: 'dashboard' };
    const subject: View = { page: 'subject', subject: { id: 'medicine', name: 'Medicine', accent: '' } };
    expect(screenIdentity(dashboard)).toBe('dashboard');
    expect(screenIdentity(subject)).toBe('subject:medicine');
    expect(screenIdentity({ page: 'flashcards' })).toBe('flashcards');
  });

  it('keeps an Exam Mode review mounted while changing questions', () => {
    const quiz = { id: 'quiz', subjectId: 'medicine', name: 'Quiz', questionCount: 2 };
    const attempt = { id: 'attempt', quizId: 'quiz', subjectId: 'medicine', feedbackMode: 'exam' as const, elapsedMs: 0, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, startedAt: 'now', completedAt: 'later', responses: {}, score: { correct: 0, incorrect: 0, unanswered: 2, total: 2, percentage: 0, elapsedMs: 0 } };
    const review: View = { page: 'quiz-review', quiz, attempt, index: 0 };
    expect(screenIdentity(review)).toBe('quiz-review:quiz:attempt');
    expect(screenIdentity({ ...review, index: 1 })).toBe(screenIdentity(review));
  });
});

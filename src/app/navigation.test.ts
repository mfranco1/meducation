import { describe, expect, it } from 'vitest';
import { presentationIdentity, restoresScroll, screenIdentity, type View } from './navigation';

describe('screenIdentity', () => {
  it('uses the quiz and attempt identity while ignoring question progress and attempt updates', () => {
    const quiz = { id: 'quiz', subjectId: 'medicine', topicId: 't1', name: 'Quiz', questionCount: 2 };
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
    const quiz = { id: 'quiz', subjectId: 'medicine', topicId: 't1', name: 'Quiz', questionCount: 2 };
    const attempt = { id: 'attempt', quizId: 'quiz', subjectId: 'medicine', feedbackMode: 'exam' as const, elapsedMs: 0, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, startedAt: 'now', completedAt: 'later', responses: {}, score: { correct: 0, incorrect: 0, unanswered: 2, total: 2, percentage: 0, elapsedMs: 0 } };
    const review: View = { page: 'quiz-review', quiz, attempt, index: 0 };
    expect(screenIdentity(review)).toBe('quiz-review:quiz:attempt');
    expect(screenIdentity({ ...review, index: 1 })).toBe(screenIdentity(review));
  });
});

it('shares subject presentation identity across tabs while keeping navigation scopes separate', () => {
  const subject = { id: 's1', name: 'Subject', accent: '' };
  const quizzes: View = { page: 'subject', subject };
  const flashcards: View = { page: 'flashcards-subject', subject };
  expect(presentationIdentity(quizzes)).toBe(presentationIdentity(flashcards));
  expect(screenIdentity(quizzes)).not.toBe(screenIdentity(flashcards));
  expect(presentationIdentity({ ...quizzes, subject: { ...subject, id: 's2' } })).not.toBe(presentationIdentity(quizzes));
  expect(presentationIdentity({ page: 'dashboard' })).toBe('dashboard');
  expect(restoresScroll(screenIdentity(quizzes), 'dashboard')).toBe(true);
  expect(restoresScroll(screenIdentity(flashcards), 'flashcards')).toBe(true);
  expect(restoresScroll(screenIdentity(quizzes), 'flashcards')).toBe(false);
  expect(restoresScroll(screenIdentity(flashcards), 'dashboard')).toBe(false);
  expect(restoresScroll('quiz:q1:a1', 'dashboard')).toBe(false);
});

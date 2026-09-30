import { describe, expect, it } from 'vitest';
import { screenIdentity, subjectForQuiz, type View } from './navigation';

describe('subjectForQuiz', () => {
  const subject = { id: 'medicine', name: 'Medicine', description: '', accent: '' };
  const quiz = { id: 'quiz', subjectId: 'medicine', name: 'Quiz', questionCount: 1 };

  it('returns the subject referenced by a quiz', () => {
    expect(subjectForQuiz([subject], quiz)).toBe(subject);
  });

  it('rejects a broken quiz-to-subject reference', () => {
    expect(() => subjectForQuiz([], quiz)).toThrow('unknown subject');
  });
});

describe('screenIdentity', () => {
  it('uses the quiz and attempt identity while ignoring question progress and attempt updates', () => {
    const quiz = { id: 'quiz', subjectId: 'medicine', name: 'Quiz', questionCount: 2 };
    const attempt = { id: 'attempt', quizId: 'quiz', subjectId: 'medicine', feedbackMode: 'immediate' as const, startedAt: 'now', responses: {} };
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
  });
});

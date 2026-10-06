import { describe, expect, it } from 'vitest';
import { subjectForQuiz } from './navigation';

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

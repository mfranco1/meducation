import { describe, expect, it } from 'vitest';
import type { StoredQuestionBank } from './schema';
import { validateQuestionBank, validateStoredQuestionBank } from './validate';

describe('question bank validation', () => {
  it('detects duplicate IDs and invalid answers', () => {
    const question = {
      id: 'i1', quizId: 'q1', stem: 'x',
      choices: [{ id: 'A', text: 'a' }, { id: 'A', text: 'b' }],
      answer: 'Z', rationale: 'R', metadata: {},
    };
    const issues = validateQuestionBank(
      [{ id: 's1', name: 'S', accent: '' }],
      [{ id: 'q1', subjectId: 's1', name: 'Z', questionCount: 2 }],
      [question, question],
    );
    expect(issues.filter(issue => issue.level === 'error').length).toBeGreaterThan(2);
  });

  it('rejects legacy fields and non-compact IDs in stored schema version 4', () => {
    const bank = {
      schemaVersion: 4,
      subjects: [{ id: 's', name: 'S', accent: '', description: '' }],
      quizzes: [{ id: 'z', subjectId: 's', name: 'Z', questionCount: 1 }],
      questions: [{
        id: 'q', quizId: 'z', subjectId: 's', questionNumber: 1,
        answerSource: 'provided_key', sourceAnswer: 'A', stem: 'x', choices: [],
        rationale: 'R', metadata: {},
      }],
    } as unknown as StoredQuestionBank;
    const messages = validateStoredQuestionBank(bank).map(issue => issue.message);
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('compact ID'),
      expect.stringContaining('legacy sourceAnswer'),
      expect.stringContaining('derived question count'),
      expect.stringContaining('unknown field'),
    ]));
  });
});

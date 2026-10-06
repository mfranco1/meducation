import { describe, expect, it } from 'vitest';
import { questionBank, questions, quizzes, schemaVersion, subjects } from './questionBank';
import fixture from '../../tests/fixtures/question-bank.json';
import type { StoredQuestionBank } from './schema';
import { validateQuestionBank, validateStoredQuestionBank } from './validate';

describe('question bank adapter', () => {
  it('exposes the versioned bank through indexed repository reads', () => {
    expect(schemaVersion).toBe(4);
    expect(validateStoredQuestionBank(fixture as StoredQuestionBank).filter(issue => issue.level === 'error')).toEqual([]);
    expect(validateQuestionBank(subjects, quizzes, questions).filter(issue => issue.level === 'error')).toEqual([]);
    expect(subjects).toEqual(fixture.subjects);
    expect(questionBank.listQuizzes('s1').map(quiz => [quiz.id, quiz.questionCount])).toEqual([['q1', 2], ['q3', 1]]);
    expect(questionBank.listQuizzes('s2').map(quiz => quiz.id)).toEqual(['q2']);
    expect(questionBank.listQuestions('q1').map(question => question.id)).toEqual(['i1', 'i3']);
    expect(questionBank.listQuestions('q2').map(question => question.id)).toEqual(['i2']);
    expect(questionBank.listQuestions('q3').map(question => question.id)).toEqual(['i4']);
    expect(questionBank.listQuizzes('missing')).toEqual([]);
    expect(questionBank.listQuestions('missing')).toEqual([]);
    expect(quizzes.map(quiz => quiz.id)).toEqual(fixture.quizzes.map(quiz => quiz.id));
  });

  it('preserves content and answer provenance while hydrating omitted metadata', () => {
    expect(questions[0]).toEqual(fixture.questions[0]);
    expect(questions[0].choices.map(choice => choice.id)).toEqual(['A', 'B']);
    expect(questions[0].answer).toBe('A');
    expect(questions[0].verifiedAnswer).toBe('B');
    expect(questions[1]).toEqual({ ...fixture.questions[1], metadata: {} });
    expect(questions[2]).toEqual({ ...fixture.questions[2], metadata: {} });
    expect(fixture.questions[1]).not.toHaveProperty('metadata');
  });
});

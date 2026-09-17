import { describe, expect, it } from 'vitest';
import { filterQuestionNavigationItems, questionNavigationItems } from './QuestionNavigator';
import type { Attempt, Question } from '../../../domain/types';

const questions: Question[] = [
  { id: 'q1', subjectId: 's', quizId: 'z', questionNumber: 4, stem: 'One', choices: [], answerSource: 'uncertain', metadata: {}, source: { pdfFile: 'source.pdf' } },
  { id: 'q2', subjectId: 's', quizId: 'z', stem: 'Two', choices: [], answerSource: 'uncertain', metadata: {}, source: { pdfFile: 'source.pdf' } },
  { id: 'q3', subjectId: 's', quizId: 'z', stem: 'Three', choices: [], answerSource: 'uncertain', metadata: {}, source: { pdfFile: 'source.pdf' } },
];
const attempt: Attempt = {
  id: 'a', quizId: 'z', subjectId: 's', feedbackMode: 'exam', startedAt: new Date().toISOString(), responses: {
    q1: { questionId: 'q1', selectedChoiceId: 'A', flagged: true, locked: false, timeMs: 0 },
    q2: { questionId: 'q2', flagged: true, locked: false, timeMs: 0 },
  },
};

describe('question navigator items', () => {
  it('derives independent answer and flag states without treating a flag as an answer', () => {
    expect(questionNavigationItems(questions, attempt)).toEqual([
      { index: 0, number: 4, answered: true, flagged: true },
      { index: 1, number: 2, answered: false, flagged: true },
      { index: 2, number: 3, answered: false, flagged: false },
    ]);
  });

  it('filters by unanswered and flagged while preserving original indexes', () => {
    const items = questionNavigationItems(questions, attempt);
    expect(filterQuestionNavigationItems(items, 'unanswered').map(item => item.index)).toEqual([1, 2]);
    expect(filterQuestionNavigationItems(items, 'flagged').map(item => item.index)).toEqual([0, 1]);
    expect(filterQuestionNavigationItems(items, 'all')).toEqual(items);
  });
});

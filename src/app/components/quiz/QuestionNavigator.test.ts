import { describe, expect, it } from 'vitest';
import { filterQuestionNavigationItems, questionNavigationItems } from './QuestionNavigator';
import type { Attempt, Question } from '../../../domain/types';

const questions: Question[] = [
  { id: 'q1', subjectId: 's', quizId: 'z', questionNumber: 4, stem: 'One', choices: [], answerSource: 'uncertain', rationale: 'R', metadata: {} },
  { id: 'q2', subjectId: 's', quizId: 'z', stem: 'Two', choices: [], answerSource: 'uncertain', rationale: 'R', metadata: {} },
  { id: 'q3', subjectId: 's', quizId: 'z', stem: 'Three', choices: [], answerSource: 'uncertain', rationale: 'R', metadata: {} },
];
const examAttempt: Attempt = {
  id: 'a', quizId: 'z', subjectId: 's', feedbackMode: 'exam', startedAt: new Date().toISOString(), responses: {
    q1: { questionId: 'q1', selectedChoiceId: 'A', flagged: true, locked: false, timeMs: 0 },
    q2: { questionId: 'q2', flagged: true, locked: false, timeMs: 0 },
  },
};

describe('question navigator items', () => {
  it('derives independent answer and flag states without treating a flag as an answer', () => {
    expect(questionNavigationItems(questions, examAttempt)).toEqual([
      { index: 0, number: 4, answered: true, flagged: true, wrong: false },
      { index: 1, number: 2, answered: false, flagged: true, wrong: false },
      { index: 2, number: 3, answered: false, flagged: false, wrong: false },
    ]);
  });

  it('filters by unanswered and flagged while preserving original indexes', () => {
    const items = questionNavigationItems(questions, examAttempt);
    expect(filterQuestionNavigationItems(items, 'unanswered').map(item => item.index)).toEqual([1, 2]);
    expect(filterQuestionNavigationItems(items, 'flagged').map(item => item.index)).toEqual([0, 1]);
    expect(filterQuestionNavigationItems(items, 'all')).toEqual(items);
  });

  it('marks only locked incorrect answers in Fast Feedback as wrong', () => {
    const immediateAttempt: Attempt = {
      ...examAttempt,
      feedbackMode: 'immediate',
      responses: {
        q1: { questionId: 'q1', selectedChoiceId: 'A', flagged: false, locked: true, timeMs: 0 },
        q2: { questionId: 'q2', selectedChoiceId: 'B', flagged: false, locked: false, timeMs: 0 },
        q3: { questionId: 'q3', selectedChoiceId: 'C', flagged: false, locked: true, timeMs: 0 },
      },
    };
    const keyedQuestions = questions.map(question => ({ ...question, sourceAnswer: question.id === 'q1' ? 'B' : question.id === 'q3' ? 'C' : undefined }));

    expect(questionNavigationItems(keyedQuestions, immediateAttempt).map(item => item.wrong)).toEqual([true, false, false]);
  });
});

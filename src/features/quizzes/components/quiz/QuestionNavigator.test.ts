import { describe, expect, it } from 'vitest';
import { filterQuestionNavigationItems, questionNavigationItems } from './QuestionNavigator';
import type { Attempt, Question } from '../../../../domain/types';

const questions: Question[] = [
  { id: 'i1', quizId: 'q1', stem: 'One', choices: [], rationale: 'R', metadata: {} },
  { id: 'i2', quizId: 'q1', stem: 'Two', choices: [], rationale: 'R', metadata: {} },
  { id: 'i3', quizId: 'q1', stem: 'Three', choices: [], rationale: 'R', metadata: {} },
];
const examAttempt: Attempt = {
  id: 'a', quizId: 'q1', subjectId: 's1', feedbackMode: 'exam', startedAt: new Date().toISOString(), responses: {
    i1: { questionId: 'i1', selectedChoiceId: 'A', flagged: true, locked: false, timeMs: 0 },
    i2: { questionId: 'i2', flagged: true, locked: false, timeMs: 0 },
  },
};

describe('question navigator items', () => {
  it('derives independent answer and flag states without treating a flag as an answer', () => {
    expect(questionNavigationItems(questions, examAttempt)).toEqual([
      { index: 0, number: 1, answered: true, flagged: true, wrong: false },
      { index: 1, number: 2, answered: false, flagged: true, wrong: false },
      { index: 2, number: 3, answered: false, flagged: false, wrong: false },
    ]);
  });

  it('filters by unanswered, wrong, and flagged while preserving original indexes', () => {
    const items = questionNavigationItems(questions, examAttempt);
    expect(filterQuestionNavigationItems(items, 'unanswered').map(item => item.index)).toEqual([1, 2]);
    expect(filterQuestionNavigationItems(items, 'wrong').map(item => item.index)).toEqual([]);
    expect(filterQuestionNavigationItems(items, 'flagged').map(item => item.index)).toEqual([0, 1]);
    expect(filterQuestionNavigationItems(items, 'all')).toEqual(items);
  });

  it('marks only locked incorrect answers in Fast Feedback as wrong', () => {
    const immediateAttempt: Attempt = {
      ...examAttempt,
      feedbackMode: 'immediate',
      responses: {
        i1: { questionId: 'i1', selectedChoiceId: 'A', flagged: false, locked: true, timeMs: 0 },
        i2: { questionId: 'i2', selectedChoiceId: 'B', flagged: false, locked: false, timeMs: 0 },
        i3: { questionId: 'i3', selectedChoiceId: 'C', flagged: false, locked: true, timeMs: 0 },
      },
    };
    const keyedQuestions = questions.map(question => ({ ...question, answer: question.id === 'i1' ? 'B' : question.id === 'i3' ? 'C' : undefined }));

    expect(questionNavigationItems(keyedQuestions, immediateAttempt).map(item => item.wrong)).toEqual([true, false, false]);
  });

  it('reveals wrong Exam Mode answers only when explicitly requested and excludes unanswered or uncertain keys', () => {
    const reviewQuestions = [
      { ...questions[0], answer: 'B' },
      { ...questions[1], answer: 'A' },
      { ...questions[2], answer: 'B', rationaleMeta: { answerReviewNote: 'Check this key' } },
    ];
    const submitted: Attempt = {
      ...examAttempt,
      responses: {
        i1: { questionId: 'i1', selectedChoiceId: 'A', flagged: true, locked: false, timeMs: 0 },
        i2: { questionId: 'i2', selectedChoiceId: 'A', flagged: false, locked: false, timeMs: 0 },
        i3: { questionId: 'i3', selectedChoiceId: 'A', flagged: true, locked: false, timeMs: 0 },
      },
    };

    expect(questionNavigationItems(reviewQuestions, submitted).map(item => item.wrong)).toEqual([false, false, false]);
    const revealed = questionNavigationItems(reviewQuestions, submitted, true);
    expect(revealed.map(item => item.wrong)).toEqual([true, false, false]);
    expect(filterQuestionNavigationItems(revealed, 'wrong').map(item => item.index)).toEqual([0]);
    expect(filterQuestionNavigationItems(revealed, 'flagged').map(item => item.index)).toEqual([0, 2]);
  });
});

import { describe, expect, it } from 'vitest';
import { validateQuestionExplanations } from './explanationValidation';
import type { Question } from '../domain/types';
import { questions } from './questionBank';

const question: Question = { id: 'q1', subjectId: 's', quizId: 'z', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], sourceAnswer: 'A', answerSource: 'provided_key', metadata: {} };

describe('explanation enrichment validation', () => {
  it('requires an AI explanation for a missing rationale to be reviewed', () => {
    expect(validateQuestionExplanations([{ ...question, explanation: { markdown: 'Answer.', provenance: 'ai_draft_reviewed', reviewedAt: '2026-09-16', reviewNote: 'Reviewed.' } }])).toEqual([]);
  });

  it('rejects HTML and unreviewed AI content', () => {
    const issues = validateQuestionExplanations([{ ...question, explanation: { markdown: '<b>Answer</b>', provenance: 'ai_draft_reviewed', reviewedAt: '', reviewNote: '' } }]);
    expect(issues.filter(issue => issue.level === 'error')).toHaveLength(3);
  });

  it('covers every question that has no source rationale', () => {
    const issues = validateQuestionExplanations(questions);
    expect(issues.filter(issue => issue.level === 'error' || issue.message.startsWith('Missing explanation'))).toEqual([]);
  });
});

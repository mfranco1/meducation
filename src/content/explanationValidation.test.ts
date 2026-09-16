import { describe, expect, it } from 'vitest';
import { validateExplanationEnrichments } from './explanationValidation';
import type { Question } from '../domain/types';

const question: Question = { id: 'q1', subjectId: 's', quizId: 'z', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], sourceAnswer: 'A', answerSource: 'provided_key', metadata: {}, source: { pdfFile: 'source.pdf' } };

describe('explanation enrichment validation', () => {
  it('requires an AI explanation for a missing rationale to be reviewed', () => {
    expect(validateExplanationEnrichments([question], { q1: { markdown: 'Answer.', provenance: 'ai_draft_reviewed', reviewedAt: '2026-09-16', reviewNote: 'Reviewed.' } })).toEqual([]);
  });

  it('rejects HTML and unreviewed AI content', () => {
    const issues = validateExplanationEnrichments([question], { q1: { markdown: '<b>Answer</b>', provenance: 'ai_draft_reviewed', reviewedAt: '', reviewNote: '' } });
    expect(issues.filter(issue => issue.level === 'error')).toHaveLength(3);
  });
});

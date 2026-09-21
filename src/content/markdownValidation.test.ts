import { describe, expect, it } from 'vitest';
import type { Question } from '../domain/types';
import { questions } from './questionBank';
import { validateQuestionMarkdown } from './markdownValidation';

const question: Question = {
  id: 'i1', quizId: 'q1', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Answer.', metadata: {},
};

describe('canonical Markdown validation', () => {
  it('accepts GFM tables and reviewed rationale metadata', () => {
    expect(validateQuestionMarkdown([{ ...question, rationale: '| Finding | Value |\n| - | - |\n| BP | 140/90 |', rationaleMeta: { provenance: 'ai_draft_reviewed', reviewedAt: '2026-09-20', reviewNote: 'Reviewed against the source question.' } }])).toEqual([]);
  });

  it('rejects raw HTML, unsafe links, and images', () => {
    const issues = validateQuestionMarkdown([{ ...question, stem: '<b>Unsafe</b>', rationale: '[bad](javascript:alert(1))\n\n![image](https://example.com/image.png)' }]);
    expect(issues.filter(issue => issue.level === 'error')).toHaveLength(4);
  });

  it('requires reviewed AI rationale metadata', () => {
    const issues = validateQuestionMarkdown([{ ...question, rationaleMeta: { provenance: 'ai_draft_reviewed' } }]);
    expect(issues.filter(issue => issue.level === 'error')).toHaveLength(2);
  });

  it('validates every canonical question', () => {
    const issues = validateQuestionMarkdown(questions);
    expect(issues.filter(issue => issue.level === 'error')).toEqual([]);
  }, 30_000);
});

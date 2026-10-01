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

  it('accepts basic HTML and local images in stems and rationales', () => {
    const issues = validateQuestionMarkdown([{ ...question, stem: 'H<sub>2</sub>O <img src="/content/diagram.png" alt="Diagram">', rationale: '![Nerve diagram](/content/nerve.png)' }]);
    expect(issues.filter(issue => issue.level === 'error')).toEqual([]);
  });

  it('accepts valid inline/display math and leaves currency prose unparsed', () => {
    const issues = validateQuestionMarkdown([{ ...question, stem: 'Calculate $\\frac{MAP-RAP}{CO}$.', rationale: 'GDP is $500B; its citizens earn $100B. This costs $10 per item and $20 each.\n\n$$x^2+y^2=z^2$$' }]);
    expect(issues.filter(issue => issue.level === 'error')).toEqual([]);
  });

  it('reports malformed and unsupported math against the question field', () => {
    const issues = validateQuestionMarkdown([{ ...question, stem: 'Find $\\notARealCommand{x}$.', rationale: 'Answer.' }]);
    expect(issues.some(issue => issue.questionId === 'i1' && issue.message.startsWith('stem contains invalid LaTeX:'))).toBe(true);
  });

  it('rejects unsafe HTML, image URLs, and restricted source markup', () => {
    const issues = validateQuestionMarkdown([{ ...question, stem: '<script>alert(1)</script><img src="/content/image.png" alt="diagram" onerror="alert(1)">', rationale: '[bad](javascript:alert(1))\n\n![](/content/image.png)', rationaleMeta: { sources: '<img src="/content/source.png" alt="source">' } }]);
    expect(issues.filter(issue => issue.level === 'error')).toHaveLength(5);
    expect(issues.map(issue => issue.message)).toContain('stem contains unsupported HTML element <script>');
    expect(issues.map(issue => issue.message)).toContain('sources contains raw HTML');
  });

  it('requires reviewed AI rationale metadata', () => {
    const issues = validateQuestionMarkdown([{ ...question, rationaleMeta: { provenance: 'ai_draft_reviewed' } }]);
    expect(issues.filter(issue => issue.level === 'error')).toHaveLength(2);
  });

  it('validates every canonical question', () => {
    const issues = validateQuestionMarkdown(questions);
    expect(issues.filter(issue => issue.level === 'error')).toEqual([]);
  }, 60_000);
});

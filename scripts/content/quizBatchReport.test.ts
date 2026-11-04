import { describe, expect, it } from 'vitest';
import { buildReport } from './quiz-batch-report';

const vocabulary = { system: ['Cardiovascular'], questionType: ['Diagnosis'], difficulty: ['easy', 'medium', 'hard'] };
const item = (stem: string, extra: object = {}) => ({
  stem,
  choices: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  answer: 'B',
  rationale: 'Because.',
  pearls: ['Pearl.'],
  metadata: { subtopic: 'Rhythm', system: 'Cardiovascular', difficulty: 'medium', questionType: 'Diagnosis' },
  ...extra,
});
const batch = (items: object[]) => ({ topics: [{ name: 'T', quizzes: [{ name: 'Q', items }] }] });
const run = (items: object[]) => buildReport(batch(items), { vocabulary });

describe('quiz batch report', () => {
  it('fails an item with five choices and names its location', () => {
    const report = run([item('Which rhythm is shown?', { choices: ['a1', 'b1', 'c1', 'd1', 'e1'] })]);
    expect(report.errors).toBe(1);
    expect(report.text).toContain('T › Q › item 1 ("Which rhythm is shown?"): Has 5 choices; expected 4.');
  });

  it('counts answer letters and difficulty per quiz', () => {
    const report = run([item('First stem here?'), item('Second stem differs?', { answer: 'A' })]);
    expect(report.text).toContain('2 items | answers A 1, B 1, C 0, D 0 | difficulty medium 2');
    expect(report.errors).toBe(0);
  });

  it('catches a duplicate stem ignoring case and punctuation', () => {
    const report = run([item('Which rhythm is shown?'), item('which RHYTHM is shown')]);
    expect(report.errors).toBe(1);
    expect(report.text).toContain('Duplicate of T › Q › item 1');
  });
});

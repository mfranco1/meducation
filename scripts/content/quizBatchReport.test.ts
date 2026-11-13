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

  it('warns when one question type dominates a quiz', () => {
    const recall = {
      metadata: { subtopic: 'Rhythm', system: 'Cardiovascular', difficulty: 'medium', questionType: 'Recall' },
    };
    const report = run([item('First stem here?', recall), item('Second stem differs?', recall), item('Third one?')]);
    expect(report.text).toContain('Recall is 67% of the quiz');
  });

  it('warns when the correct choice is the longest in too many items of a quiz', () => {
    const stems = Array.from({ length: 10 }, (_, i) => `Stem number ${i + 1}?`);
    const longKey = { choices: ['Alpha', 'Beta with more words', 'Gamma', 'Delta'] };
    const skewed = stems.map((stem, i) => item(stem, i < 4 ? longKey : {}));
    expect(run(skewed).text).toContain('The correct choice is the longest in 40% of items');
    const balanced = stems.map((stem, i) => item(stem, i < 3 ? longKey : {}));
    expect(run(balanced).text).not.toContain('The correct choice is the longest');
  });

  it('flags a topic with a single quiz only when checking against a blueprint', () => {
    const items = [item('Only stem here?')];
    expect(run(items).text).not.toContain('Topic has fewer than 2 quizzes');
    const blueprint = { topics: [{ name: 'T', quizzes: [{ name: 'Q', target: 1 }] }] };
    expect(buildReport(batch(items), { vocabulary, blueprint }).text).toContain('Topic has fewer than 2 quizzes');
  });

  it('checks quiz size against the blueprint target instead of 50 to 100', () => {
    const items = [item('Only stem here?')];
    expect(run(items).text).toContain('expected 50 to 100');
    const blueprint = { topics: [{ name: 'T', quizzes: [{ name: 'Q', target: 1 }] }] };
    expect(buildReport(batch(items), { vocabulary, blueprint }).text).not.toContain('expected 50 to 100');
  });

  it('checks a top-up against its added items and ignores topics outside the batch', () => {
    const items = [item('Only stem here?', { metadata: { ...item('').metadata, subtopic: 'Valves' } })];
    const blueprint = {
      topics: [
        { name: 'T', quizzes: [{ name: 'Q', target: 50, add: { target: 1, subtopics: { Valves: 1 } } }] },
        { name: 'Other', quizzes: [{ name: 'Elsewhere', target: 40 }] },
      ],
    };
    const report = buildReport(batch(items), { vocabulary, blueprint }).text;
    expect(report).toContain('T › Q items: 1/1');
    expect(report).not.toContain('Elsewhere');
  });

  it('flags letter-prefixed choices but not genus abbreviations', () => {
    const report = run([
      item('Prefixed one?', { choices: ['A. Alpha', 'Beta', 'Gamma', 'Delta'] }),
      item('Genus one?', { choices: ['E. coli', 'S. aureus', 'Gamma', 'Delta'] }),
    ]);
    expect(report.errors).toBe(1);
    expect(report.text).toContain('item 1 ("Prefixed one?"): Choice has a letter prefix');
  });

  it('flags letter references in rationales but not poly(A) or V(D)J', () => {
    const text = run([
      item('Letter one?', { rationale: 'Choice (C) is wrong.' }),
      item('Terms one?', { rationale: 'The poly(A) tail and V(D)J recombination.' }),
    ]).text;
    expect(text).toContain('item 1 ("Letter one?"): Rationale refers to a choice by letter.');
    expect(text).not.toContain('item 2 ("Terms one?"): Rationale refers');
  });

  it('flags numeric choices out of order and rationales that do not open in bold', () => {
    const text = run([
      item('Unordered one?', { choices: ['0.60', '0.15', '1.67', '0.30'], rationale: 'Divide the AUCs. So **0.30**.' }),
      item('Ordered one?', { choices: ['0.15', '0.30', '0.60', '1,200 mg'], rationale: 'It is **0.30**. More.' }),
    ]).text;
    expect(text).toContain('item 1 ("Unordered one?"): Numeric choices are not in ascending order.');
    expect(text).toContain('item 1 ("Unordered one?"): Rationale does not open with the bolded answer.');
    expect(text).not.toContain('item 2 ("Ordered one?"): Numeric');
    expect(text).not.toContain('item 2 ("Ordered one?"): Rationale does not open');
  });

  it('fails a key that differs from the choice the rationale opens with', () => {
    const report = run([
      item('Wrong key one?', { rationale: '**Gamma** is correct.\n\n- **Beta**: no.' }),
      item('Right key one?', {
        choices: ['Alpha', '*Beta* gene', 'Gamma', 'Delta'],
        rationale: '**A *Beta* gene** fits.\n\n- **Gamma**: no.',
      }),
      item('Phrase key one?', {
        choices: ['Group 3', 'Group 4', 'WNT-activated', 'SHH-activated'],
        answer: 'A',
        rationale: '**Group 4 medulloblastoma** fits.\n\n- **Group 3**: no.',
      }),
    ]);
    expect(report.text).toContain('item 1 ("Wrong key one?"): Rationale opens with choice C but the answer is B.');
    expect(report.text).toContain('item 3 ("Phrase key one?"): Rationale opens with choice B but the answer is A.');
    expect(report.errors).toBe(2);
  });

  it('flags a source citation without a closing period unless it ends with a DOI', () => {
    const report = run([
      item('First stem here?', { rationaleMeta: { sources: 'WHO. *Guideline*. WHO; 2020' } }),
      item('Second stem differs?', {
        rationaleMeta: { sources: 'WHO. *Guide*. WHO; 2020; Doe J. Title. *J Med*. 2021. doi:10.1/x' },
      }),
    ]);
    expect(report.text).toContain('item 1 ("First stem here?"): Source citation does not end with a period');
    expect(report.text).not.toContain('item 2 ("Second stem differs?"): Source citation');
  });

  it('counts rationale length outside tables', () => {
    const words = (n: number) => Array(n).fill('word').join(' ');
    const table = `\n\n| A | B |\n| --- | --- |\n| ${words(100)} | x |`;
    const text = run([
      item('Short one?', { rationale: words(50) }),
      item('Right size with a table?', { rationale: words(100) + table }),
      item('Long one?', { rationale: words(150) }),
    ]).text;
    expect(text).toContain('Rationale is short (50 words outside tables');
    expect(text).not.toContain('(100 words outside tables');
    expect(text).toContain('Rationale is long (150 words outside tables');
  });

  it('catches a duplicate stem ignoring case and punctuation', () => {
    const report = run([item('Which rhythm is shown?'), item('which RHYTHM is shown')]);
    expect(report.errors).toBe(1);
    expect(report.text).toContain('Duplicate of T › Q › item 1');
  });
});

import { describe, expect, it } from 'vitest';
import { buildReport } from './flashcard-batch-report';

const existing = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i}`, version: 2, front: `Existing front ${i}`, back: 'Back.' }));
const outline = {
  topics: [{ name: 'T', decks: [{ name: 'D', cards: existing(20) }] }],
};
const card = (front: string, extra: object = {}) => ({ front, back: 'Short back.', ...extra });
const batch = (cards: object[]) => ({ topics: [{ name: 'T', decks: [{ name: 'D', cards }] }] });
const run = (value: unknown, plan?: object) =>
  buildReport(value, { outline, plan: plan as never, topic: plan ? 'T' : undefined });

describe('flashcard batch report', () => {
  it('rejects bad shapes', () => {
    expect(run({ topics: [], extra: 1 }).text).toContain('Unknown key "extra"');
    expect(run({}).text).toContain('Batch needs topics, edits or deletes');
    expect(run(batch([card(' ')])).text).toContain('front is blank');
    expect(run(batch([card('Q', { sources: 5 })])).text).toContain('sources must be a string');
    expect(run({ edits: [{ id: 'f1', version: 2 }] }).text).toContain('changes no field');
  });

  it('applies the Markdown policy per field', () => {
    const report = run(batch([card('Front <script>x</script>', { sources: '![a](https://x.test/a.png)' })]));
    expect(report.text).toContain('card 1 ("Front <script>x</script>").front: front contains unsupported HTML element');
    expect(report.text).toContain('.sources: sources contains an image');
  });

  it('errors on exact duplicates and warns on near-duplicates', () => {
    const dup = run(batch([card('existing FRONT 3!'), card('Brand new thing'), card('brand new thing')]));
    expect(dup.errors).toBe(2);
    expect(dup.text).toContain('Duplicate front of outline T › D ("Existing front 3")');
    const near = run(batch([card('Existing front 3 extra')]));
    expect(near.errors).toBe(0);
    expect(near.text).toContain('Near-duplicate front of outline T › D');
  });

  it('checks edit and delete ids and versions', () => {
    const report = run({
      edits: [
        { id: 'nope', version: 1, back: 'x' },
        { id: 'f1', version: 1, back: 'x' },
      ],
      deletes: [{ id: 'f2', version: 3 }],
    });
    expect(report.errors).toBe(3);
    expect(report.text).toContain('Card id is not in the outline');
    expect(report.text).toContain("Version 1 differs from the outline's 2");
  });

  it('warns on long faces, repeated fronts and source mentions', () => {
    const front = 'What is the first-line treatment for neonatal jaundice?';
    const report = run(
      batch([
        card('F'.repeat(170) + ' one'),
        card('Another front', { back: 'B'.repeat(401) }),
        card(front, { back: `${front} Phototherapy.` }),
        card('Third question', { back: 'See the handout.' }),
      ]),
    );
    expect(report.errors).toBe(0);
    for (const text of [
      'Front is 174 characters',
      'Back is 401 characters',
      'Back repeats the front',
      'mentions source material',
    ])
      expect(report.text).toContain(text);
    expect(run(batch([card('Table', { back: `${'|a|b|\n'.repeat(100)}` })])).text).not.toContain('Back is');
  });

  it('warns on deck size after deletes', () => {
    const report = run({ deletes: Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, version: 2 })) });
    expect(report.text).toContain('T › D: Deck would have 14 cards; expected 15 to 80');
  });

  it('compares the batch with the plan', () => {
    const plan = {
      topics: [
        {
          name: 'T',
          decks: [
            { name: 'D', add: 2 },
            { name: 'E', add: 1 },
          ],
        },
      ],
    };
    const report = run(batch([card('One new card')]), plan);
    expect(report.text).toContain('Plan adds 2 cards; batch has 1');
    expect(report.text).toContain('T › E: Plan adds 1 cards; batch has 0');
    expect(run({ edits: [{ id: 'f1', version: 2, back: 'x' }] }, plan).text).not.toContain('Plan adds');
    const other = { topics: [{ name: 'T', decks: [{ name: 'X', add: 1 }] }] };
    expect(run(batch([card('One new card')]), other).text).toContain('Deck is not in the plan');
  });

  it('warns on retired terms in new cards and edits', () => {
    const retired = [{ flag: 'PCOS', pattern: /\bPCOS\b/i }];
    const report = buildReport(
      { ...batch([card('First-line drug in PCOS?')]), edits: [{ id: 'f1', version: 2, back: 'Not PMOS.' }] },
      { outline, retired },
    ).text;
    expect(report).toContain('card 1 ("First-line drug in PCOS?"): Uses retired `PCOS`');
    expect(report).not.toContain('edits (f1): Uses retired');
  });
});

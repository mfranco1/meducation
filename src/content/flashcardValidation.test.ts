import { describe, expect, it } from 'vitest';
import { validateFlashcardBank } from './flashcardValidation';
import type { StoredFlashcardBank } from './schema';
import fixture from '../../tests/fixtures/flashcard-bank-contract.json';

describe('shared flashcard authoring validation', () => {
  it('rejects invalid card HTML, image URLs, math, and restricted sources', () => {
    const bank = structuredClone(fixture.bank) as StoredFlashcardBank;
    bank.cards[0].front = '<img src="javascript:alert(1)" alt="Unsafe">';
    bank.cards[0].back = '$\\unknowncommand$';
    bank.cards[0].sources = '![Not allowed](/image.png)';
    const errors = validateFlashcardBank(bank, fixture.subjects).filter((issue) => issue.level === 'error');
    expect(errors.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unsupported image URL'),
        expect.stringContaining('invalid LaTeX'),
        expect.stringContaining('sources contains an image'),
      ]),
    );
  });

  it('warns on duplicate sibling names without confusing identity or other parents', () => {
    const bank = structuredClone(fixture.bank) as StoredFlashcardBank;
    bank.topics.push({ id: 't-dupe', subjectId: 's1', name: ' neuroanatomy ' });
    bank.topics.push({ id: 't-other', subjectId: 's2', name: 'Neuroanatomy' });
    const warnings = validateFlashcardBank(bank, fixture.subjects);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ level: 'warning', message: expect.stringContaining('Duplicate sibling name') });
  });

  it('reports structural failures without trying to parse malformed card records', () => {
    const bank = { ...fixture.bank, cards: [null] } as unknown as StoredFlashcardBank;
    expect(validateFlashcardBank(bank, fixture.subjects)[0].message).toBe('Card record must be an object');
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyFlashcardOperations,
  type FlashcardAdminOperation,
} from './flashcardChangeSet';
import type { StoredFlashcardBank } from '../../content/schema/schema';
import { storedQuestionBank } from '../../test/contentFixtures';

const source: StoredFlashcardBank = {
  schemaVersion: 2,
  decks: [
    { id: 'd-one', subjectId: 's1', name: 'First' },
    { id: 'd-two', subjectId: 's1', name: 'Second' },
  ],
  cards: [{ id: 'f-one', deckId: 'd-one', front: 'Front', back: 'Back' }],
};

describe('flashcard admin change sets', () => {
  it('updates and moves decks across subjects with stable IDs and parent-scoped ordering', () => {
    const updated = applyFlashcardOperations(source, storedQuestionBank.subjects, [
      { op: 'deck.update', id: 'd-two', value: { id: 'd-two', subjectId: 's2', name: 'Moved deck' } },
      { op: 'deck.create', value: { id: 'd-three', subjectId: 's1', name: 'Third' }, afterId: 'd-one' },
      { op: 'card.create', value: { id: 'f-two', deckId: 'd-three', front: 'Second front', back: 'Second back' } },
      { op: 'card.update', id: 'f-one', value: { ...source.cards[0], deckId: 'd-three', back: 'Reviewed' } },
      { op: 'card.move', id: 'f-two', first: true },
    ]);
    expect(updated.decks.map((deck) => deck.id)).toEqual(['d-one', 'd-three', 'd-two']);
    expect(updated.decks[2].subjectId).toBe('s2');
    expect(updated.cards.map((card) => card.id)).toEqual(['f-two', 'f-one']);
    expect(updated.cards[1]).toMatchObject({ deckId: 'd-three', front: 'Front', back: 'Reviewed' });
    expect(() =>
      applyFlashcardOperations(source, storedQuestionBank.subjects, [
        { op: 'deck.create', value: { id: 'd-new', subjectId: 's2', name: 'New' }, afterId: 'd-one' },
      ]),
    ).toThrow('another parent');
    expect(() =>
      applyFlashcardOperations(source, storedQuestionBank.subjects, [
        { op: 'card.update', id: 'f-one', value: { ...source.cards[0], id: 'f-renamed' } },
      ]),
    ).toThrow('IDs cannot be changed');
    expect(() =>
      applyFlashcardOperations(source, storedQuestionBank.subjects, [
        { op: 'card.update', id: 'f-one', value: { ...source.cards[0], front: '<script>bad</script>' } },
      ]),
    ).toThrow('unsupported HTML');
  });
  it('replays create, move, and explicit cascade operations in canonical order', () => {
    const operations: FlashcardAdminOperation[] = [
      { op: 'deck.create', value: { id: 'd-three', subjectId: 's1', name: 'Third' }, afterId: 'd-one' },
      { op: 'deck.move', id: 'd-two', afterId: 'd-three' },
      { op: 'card.create', value: { id: 'f-two', deckId: 'd-one', front: 'New front', back: 'New back' } },
      { op: 'deck.delete', id: 'd-one', cascade: true },
    ];
    const updated = applyFlashcardOperations(source, storedQuestionBank.subjects, operations);
    expect(updated.decks.map((deck) => deck.id)).toEqual(['d-three', 'd-two']);
    expect(updated.cards).toEqual([]);
    expect(source.decks.map((deck) => deck.id)).toEqual(['d-one', 'd-two']);
  });
  it('does not share mutable records between operations and validated results', () => {
    const value = { id: 'd-new', subjectId: 's1', name: 'Reviewed' };
    const result = applyFlashcardOperations(source, storedQuestionBank.subjects, [{ op: 'deck.create', value }]);
    value.subjectId = 'missing';
    expect(result.decks.at(-1)?.subjectId).toBe('s1');
    result.decks.at(-1)!.name = 'Edited result';
    expect(value.name).toBe('Reviewed');
  });
  it('requires explicit cascades and rolls failed mixed batches back', () => {
    expect(() =>
      applyFlashcardOperations(source, storedQuestionBank.subjects, [{ op: 'deck.delete', id: 'd-one' }]),
    ).toThrow('explicit cascade');
    expect(() =>
      applyFlashcardOperations(source, storedQuestionBank.subjects, [
        { op: 'deck.create', value: { id: 'd-three', subjectId: 's1', name: 'Third' } },
        { op: 'deck.delete', id: 'missing' },
      ]),
    ).toThrow('does not exist');
    expect(source.decks.map((deck) => deck.id)).toEqual(['d-one', 'd-two']);
  });
});

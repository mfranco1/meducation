import { describe, expect, it } from 'vitest';
import { migrateFlashcardBankV1 } from './flashcardMigration';
import { checkpointForCard, flashcardContentSignature, resolveFlashcardLaunch } from '../../src/domain/flashcardStudy';
import fixture from '../../tests/fixtures/flashcard-bank-contract.json';

describe('flashcard schema migration', () => {
  const legacy = {
    schemaVersion: 1,
    topics: [
      { id: 't-a', subjectId: 's1', name: 'A' },
      { id: 't-b', subjectId: 's2', name: 'B' },
      { id: 't-empty', subjectId: 's1', name: 'Empty' },
    ],
    decks: [
      { id: 'd-a', topicId: 't-a', name: 'Deck A' },
      { id: 'd-b', topicId: 't-b', name: 'Deck B' },
      { id: 'd-c', topicId: 't-a', name: 'Deck C' },
    ],
    cards: [{ id: 'f-a', deckId: 'd-b', front: '**front**', back: 'back' }],
  };
  it('maps decks through topics and preserves record IDs, content, and canonical order', () => {
    const input = structuredClone(legacy);
    const report = migrateFlashcardBankV1(input, fixture.subjects);
    expect(report.bank).toEqual({
      schemaVersion: 2,
      decks: [
        { id: 'd-a', name: 'Deck A', subjectId: 's1' },
        { id: 'd-b', name: 'Deck B', subjectId: 's2' },
        { id: 'd-c', name: 'Deck C', subjectId: 's1' },
      ],
      cards: legacy.cards,
    });
    expect(report.removedTopics).toHaveLength(3);
    expect(report.mappedDecks.map((deck) => deck.id)).toEqual(['d-a', 'd-b', 'd-c']);
    expect(input).toEqual(legacy);
  });
  it('rejects dangling old relationships and unknown subject references', () => {
    expect(() =>
      migrateFlashcardBankV1({ ...legacy, decks: [{ ...legacy.decks[0], topicId: 't404' }] }, fixture.subjects),
    ).toThrow('unknown topic');
    expect(() =>
      migrateFlashcardBankV1({ ...legacy, topics: [{ ...legacy.topics[0], subjectId: 's404' }] }, fixture.subjects),
    ).toThrow('unknown subject');
  });
  it('rejects the wrong schema and unknown fields', () => {
    expect(() => migrateFlashcardBankV1({ ...legacy, schemaVersion: 2 }, fixture.subjects)).toThrow(
      'Expected flashcard schema version 1',
    );
    expect(() => migrateFlashcardBankV1({ ...legacy, unexpected: true }, fixture.subjects)).toThrow('unknown field');
  });

  it('reports duplicate sibling deck names after topic removal', () => {
    const duplicate = {
      ...legacy,
      decks: [...legacy.decks, { id: 'd-duplicate', topicId: 't-a', name: ' deck a ' }],
    };
    const report = migrateFlashcardBankV1(duplicate, fixture.subjects);
    expect(report.warnings).toEqual([
      expect.objectContaining({ level: 'warning', message: expect.stringContaining('Duplicate sibling name') }),
    ]);
  });

  it('preserves a saved deck position because ordered card study content is unchanged', async () => {
    const cards = [
      { id: 'f-1', deckId: 'd-a', front: 'First', back: 'Answer 1' },
      { id: 'f-2', deckId: 'd-a', front: '**Second**', back: 'Answer 2', sources: 'Source' },
    ];
    const source = { ...legacy, cards };
    const beforeSignature = await flashcardContentSignature(cards);
    const checkpoint = checkpointForCard('d-a', cards, 'f-2', beforeSignature, '2026-10-06');
    const migrated = migrateFlashcardBankV1(source, fixture.subjects).bank;
    const afterCards = migrated.cards.filter((card) => card.deckId === 'd-a');
    const afterSignature = await flashcardContentSignature(afterCards);
    expect(afterSignature).toBe(beforeSignature);
    expect(resolveFlashcardLaunch('d-a', afterCards, afterSignature, checkpoint)).toEqual({
      kind: 'resume',
      cardId: 'f-2',
      index: 1,
    });
  });
});

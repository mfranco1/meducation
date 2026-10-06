import { describe, expect, it } from 'vitest';
import { storedQuestionBank } from '../../content/questionBank';
import { storedFlashcardBank } from '../../content/flashcardBank';
import {
  compileFlashcardBulkAddDraft,
  flashcardBulkAddTemplate,
  parseFlashcardBulkAddDraft,
} from './flashcardBulkAddDraft';
import { applyFlashcardOperations } from './flashcardChangeSet';

const subjectContext = { kind: 'subject', subjectId: 's1' } as const;

describe('flashcard bulk add drafts', () => {
  it('provides parseable templates for both selected destinations', () => {
    const cards = parseFlashcardBulkAddDraft(JSON.parse(flashcardBulkAddTemplate({ kind: 'deck', deckId: 'd1' })), {
      kind: 'deck',
      deckId: 'd1',
    });
    const decks = parseFlashcardBulkAddDraft(JSON.parse(flashcardBulkAddTemplate(subjectContext)), subjectContext);
    expect(cards.draft).toMatchObject({ kind: 'cards', cards: [{ front: 'Question text', back: 'Answer text' }] });
    expect(decks.draft).toMatchObject({
      kind: 'decks',
      decks: [{ name: 'Deck name', cards: [{ front: 'Question text' }] }],
    });
  });

  it('compiles nested decks and cards in input order with empty and populated decks', () => {
    const source = structuredClone(storedFlashcardBank);
    const parsed = parseFlashcardBulkAddDraft(
      {
        decks: [
          { name: 'Empty deck', description: 'Keep this description', cards: [] },
          {
            name: 'Populated deck',
            cards: [
              { front: '**One**', back: 'Answer one', sources: 'Source', reviewNote: 'Review later' },
              { front: 'Two', back: 'Answer two' },
            ],
          },
        ],
      },
      subjectContext,
    );
    expect(parsed.draft).toBeDefined();
    const compiled = compileFlashcardBulkAddDraft(
      parsed.draft!,
      subjectContext,
      source,
      storedQuestionBank.subjects,
      (() => {
        const ids = ['deck-one', 'deck-two', 'card-one', 'card-two'];
        return () => ids.shift()!;
      })(),
    );
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.compiled?.operations.map((operation) => operation.op)).toEqual([
      'deck.create',
      'deck.create',
      'card.create',
      'card.create',
    ]);
    expect(compiled.compiled?.candidate.decks.slice(source.decks.length).map((deck) => deck.name)).toEqual(['Empty deck', 'Populated deck']);
    expect(compiled.compiled?.candidate.cards.slice(source.cards.length).map((card) => [card.front, card.back])).toEqual([
      ['**One**', 'Answer one'],
      ['Two', 'Answer two'],
    ]);
    expect(compiled.compiled?.candidate.cards[source.cards.length]).toMatchObject({ sources: 'Source', reviewNote: 'Review later' });
    expect(compiled.compiled?.generatedIds).toEqual(['d-deck-one', 'd-deck-two', 'f-card-one', 'f-card-two']);
    expect(source).toEqual(storedFlashcardBank);
    expect(applyFlashcardOperations(source, storedQuestionBank.subjects, compiled.compiled!.operations)).toEqual(
      compiled.compiled?.candidate,
    );
  });

  it('compiles cards into a selected existing deck without editing its original cards', () => {
    const source = {
      schemaVersion: 2 as const,
      decks: [{ id: 'd-existing', subjectId: 's1', name: 'Existing' }],
      cards: [{ id: 'f-existing', deckId: 'd-existing', front: 'Keep', back: 'Existing content' }],
    };
    const context = { kind: 'deck', deckId: 'd-existing' } as const;
    const parsed = parseFlashcardBulkAddDraft({ cards: [{ front: 'Added', back: 'Answer' }] }, context);
    const compiled = compileFlashcardBulkAddDraft(
      parsed.draft!,
      context,
      source,
      storedQuestionBank.subjects,
      () => 'new',
    );
    expect(compiled.compiled?.candidate.cards.map((card) => card.id)).toEqual(['f-existing', 'f-new']);
    expect(source.cards).toHaveLength(1);
  });

  it('reports strict nested paths for technical fields, nulls, blank content, and malformed types', () => {
    const parsed = parseFlashcardBulkAddDraft(
      {
        decks: [
          {
            id: 'user-id',
            name: 'Valid name',
            cards: [{ front: ' ', back: 'Answer', deckId: 'd-user', sources: null, extra: 'no' }],
          },
        ],
      },
      subjectContext,
    );
    expect(parsed.draft).toBeUndefined();
    expect(parsed.diagnostics.map((issue) => issue.path)).toEqual([
      '$.decks[0].id',
      '$.decks[0].cards[0].deckId',
      '$.decks[0].cards[0].extra',
      '$.decks[0].cards[0].front',
      '$.decks[0].cards[0].sources',
    ]);
  });

  it('rejects empty batches and a draft intended for a different destination', () => {
    expect(parseFlashcardBulkAddDraft({ decks: [] }, subjectContext).diagnostics[0].path).toBe('$.decks');
    const context = { kind: 'deck', deckId: 'd-missing' } as const;
    const parsed = parseFlashcardBulkAddDraft({ cards: [{ front: 'Front', back: 'Back' }] }, context);
    const compiled = compileFlashcardBulkAddDraft(
      parsed.draft!,
      context,
      storedFlashcardBank,
      storedQuestionBank.subjects,
    );
    expect(compiled.diagnostics[0].message).toContain('selected deck no longer exists');
  });

  it('rejects unsafe rich content atomically and reports the source JSON path', () => {
    const parsed = parseFlashcardBulkAddDraft(
      { decks: [{ name: 'Unsafe', cards: [{ front: '<script>alert(1)</script>', back: 'Safe' }] }] },
      subjectContext,
    );
    const source = structuredClone(storedFlashcardBank);
    const compiled = compileFlashcardBulkAddDraft(
      parsed.draft!,
      subjectContext,
      source,
      storedQuestionBank.subjects,
      () => 'unsafe',
    );
    expect(compiled.compiled).toBeUndefined();
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        level: 'error',
        path: '$.decks[0].cards[0]',
        message: expect.stringContaining('unsupported HTML'),
      }),
    ]);
    expect(source).toEqual(storedFlashcardBank);
  });

  it('keeps duplicate deck names as separate records and reports a warning', () => {
    const parsed = parseFlashcardBulkAddDraft({ decks: [{ name: 'Same' }, { name: 'same' }] }, subjectContext);
    const compiled = compileFlashcardBulkAddDraft(
      parsed.draft!,
      subjectContext,
      storedFlashcardBank,
      storedQuestionBank.subjects,
      (() => {
        let id = 0;
        return () => `duplicate-${id++}`;
      })(),
    );
    expect(compiled.compiled?.candidate.decks).toHaveLength(storedFlashcardBank.decks.length + 2);
    expect(compiled.diagnostics).toEqual([
      expect.objectContaining({
        level: 'warning',
        path: '$.decks[1].name',
        message: expect.stringContaining('Duplicate sibling name'),
      }),
    ]);
  });
});

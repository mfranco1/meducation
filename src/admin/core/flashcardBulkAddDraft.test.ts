import { describe, expect, it } from 'vitest';
import { storedQuestionBank, storedFlashcardBank } from '../../test/contentFixtures';
import {
  compileFlashcardBulkAddDraft,
  flashcardBulkAddTemplate,
  parseFlashcardBulkAddDraft,
} from './flashcardBulkAddDraft';

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

  it('plans nested decks and cards in input order, with empty and populated decks and exact optional fields', () => {
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
    const compiled = compileFlashcardBulkAddDraft(parsed.draft!, subjectContext, storedFlashcardBank, storedQuestionBank.subjects);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.compiled?.plan).toEqual({
      subjectId: 's1',
      groups: [
        { create: { kind: 'decks', fields: { name: 'Empty deck', description: 'Keep this description' } }, childKind: 'cards', children: [] },
        {
          create: { kind: 'decks', fields: { name: 'Populated deck' } },
          childKind: 'cards',
          children: [
            { front: '**One**', back: 'Answer one', sources: 'Source', reviewNote: 'Review later' },
            { front: 'Two', back: 'Answer two' },
          ],
        },
      ],
    });
    expect(compiled.compiled?.deckSummaries).toEqual([{ name: 'Empty deck', cardCount: 0 }, { name: 'Populated deck', cardCount: 2 }]);
  });

  it('plans cards for a selected existing deck', () => {
    const context = { kind: 'deck', deckId: 'd-cranial' } as const;
    const parsed = parseFlashcardBulkAddDraft({ cards: [{ front: 'Added', back: 'Answer' }] }, context);
    const compiled = compileFlashcardBulkAddDraft(parsed.draft!, context, storedFlashcardBank, storedQuestionBank.subjects);
    expect(compiled.compiled?.plan).toEqual({
      groups: [{ parentId: 'd-cranial', childKind: 'cards', children: [{ front: 'Added', back: 'Answer' }] }],
    });
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
});

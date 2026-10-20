import { describe, expect, it } from 'vitest';
import { storedQuestionBank, storedFlashcardBank } from '../../test/contentFixtures';
import {
  compileFlashcardBulkAddDraft,
  flashcardBulkAddTemplate,
  parseFlashcardBulkAddDraft,
} from './flashcardBulkAddDraft';

const topicContext = { kind: 'topic', topicId: 't1' } as const;

describe('flashcard bulk add drafts', () => {
  it('provides parseable templates for both selected destinations', () => {
    const cards = parseFlashcardBulkAddDraft(JSON.parse(flashcardBulkAddTemplate({ kind: 'deck', deckId: 'd1' })), {
      kind: 'deck',
      deckId: 'd1',
    });
    const decks = parseFlashcardBulkAddDraft(JSON.parse(flashcardBulkAddTemplate(topicContext)), topicContext);
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
              { front: '**One**', back: 'Answer one', sources: 'Source' },
              { front: 'Two', back: 'Answer two' },
            ],
          },
        ],
      },
      topicContext,
    );
    const compiled = compileFlashcardBulkAddDraft(parsed.draft!, topicContext, storedFlashcardBank, storedQuestionBank.topics);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.plan).toEqual({
      topics: [
        {
          id: 't1',
          groups: [
            { create: { kind: 'decks', fields: { name: 'Empty deck', description: 'Keep this description' } }, childKind: 'cards', children: [] },
            {
              create: { kind: 'decks', fields: { name: 'Populated deck' } },
              childKind: 'cards',
              children: [
                { front: '**One**', back: 'Answer one', sources: 'Source' },
                { front: 'Two', back: 'Answer two' },
              ],
            },
          ],
        },
      ],
    });
  });

  it('plans cards for a selected existing deck', () => {
    const context = { kind: 'deck', deckId: 'd-cranial' } as const;
    const parsed = parseFlashcardBulkAddDraft({ cards: [{ front: 'Added', back: 'Answer' }] }, context);
    const compiled = compileFlashcardBulkAddDraft(parsed.draft!, context, storedFlashcardBank, storedQuestionBank.topics);
    expect(compiled.plan).toEqual({
      topics: [{ groups: [{ parentId: 'd-cranial', childKind: 'cards', children: [{ front: 'Added', back: 'Answer' }] }] }],
    });
  });

  it('plans several new topics under a subject, each with its own decks', () => {
    const context = { kind: 'subject', subjectId: 's1' } as const;
    const parsed = parseFlashcardBulkAddDraft(JSON.parse(flashcardBulkAddTemplate(context)), context);
    expect(parsed.draft).toMatchObject({ kind: 'topics', topics: [{ name: 'Topic name', decks: [{ name: 'Deck name' }] }] });
    const two = parseFlashcardBulkAddDraft(
      {
        topics: [
          { name: 'One', description: 'First', decks: [{ name: 'A', cards: [{ front: 'F', back: 'B' }] }] },
          { name: 'Two', decks: [{ name: 'B' }] },
        ],
      },
      context,
    );
    const compiled = compileFlashcardBulkAddDraft(two.draft!, context, storedFlashcardBank, storedQuestionBank.topics);
    expect(compiled.plan).toEqual({
      subjectId: 's1',
      topics: [
        {
          fields: { name: 'One', description: 'First' },
          groups: [{ create: { kind: 'decks', fields: { name: 'A' } }, childKind: 'cards', children: [{ front: 'F', back: 'B' }] }],
        },
        { fields: { name: 'Two' }, groups: [{ create: { kind: 'decks', fields: { name: 'B' } }, childKind: 'cards', children: [] }] },
      ],
    });
  });

  it('reports nested paths for subject drafts and rejects a draft for another destination', () => {
    const context = { kind: 'subject', subjectId: 's1' } as const;
    const bad = parseFlashcardBulkAddDraft(
      { topics: [{ name: 'Ok', decks: [{ name: 'D' }] }, { name: 'T', id: 'x', decks: [{ name: 'D', cards: [{ front: '', back: 'B' }] }] }] },
      context,
    );
    expect(bad.diagnostics.map((issue) => issue.path)).toEqual(['$.topics[1].id', '$.topics[1].decks[0].cards[0].front']);
    const decks = parseFlashcardBulkAddDraft({ decks: [{ name: 'D' }] }, topicContext);
    expect(compileFlashcardBulkAddDraft(decks.draft!, context, storedFlashcardBank, []).diagnostics[0].message).toContain('does not match');
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
      topicContext,
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
    expect(parseFlashcardBulkAddDraft({ decks: [] }, topicContext).diagnostics[0].path).toBe('$.decks');
    const context = { kind: 'deck', deckId: 'd-missing' } as const;
    const parsed = parseFlashcardBulkAddDraft({ cards: [{ front: 'Front', back: 'Back' }] }, context);
    const compiled = compileFlashcardBulkAddDraft(
      parsed.draft!,
      context,
      storedFlashcardBank,
      storedQuestionBank.topics,
    );
    expect(compiled.diagnostics[0].message).toContain('selected deck no longer exists');
  });
});

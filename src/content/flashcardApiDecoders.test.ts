import { describe, expect, it } from 'vitest';
import { isFlashcardCatalog, isFlashcardList, isFlashcardSubjectResponse } from './flashcardApiDecoders';

describe('flashcard API decoders', () => {
  it('rejects legacy topic fields and unexpected response fields', () => {
    const catalog = {
      revision: 'sha256-example',
      decks: [{ id: 'd-one', subjectId: 's1', name: 'Deck', cardCount: 0, cardIds: [] }],
    };
    expect(isFlashcardCatalog({ ...catalog, topics: [] }, 's1')).toBe(false);
    expect(
      isFlashcardCatalog({ revision: catalog.revision, decks: [{ ...catalog.decks[0], topicId: 't-one' }] }, 's1'),
    ).toBe(false);
    expect(isFlashcardSubjectResponse({ revision: 'r', subjects: [], topics: [] })).toBe(false);
    expect(isFlashcardList({ revision: 'r', cards: [], topics: [] }, 'd-one')).toBe(false);
  });
});

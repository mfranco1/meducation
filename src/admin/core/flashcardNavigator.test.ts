import { describe, expect, it } from 'vitest';
import type { StoredFlashcard } from '../../content/schema/schema';
import { FLASHCARD_PAGE_SIZE, selectFlashcardPage } from './flashcardNavigator';

const cards = Array.from({ length: 53 }, (_, index) => ({
  id: `f${index + 1}`,
  deckId: 'd1',
  front: `Front ${index + 1}`,
  back: `Answer ${index + 1}`,
})) satisfies StoredFlashcard[];

describe('selectFlashcardPage', () => {
  it('keeps canonical positions and limits each page to 25 cards', () => {
    const first = selectFlashcardPage(cards, '', 0);
    const third = selectFlashcardPage(cards, '', 2);
    expect(first.visible).toHaveLength(FLASHCARD_PAGE_SIZE);
    expect(third.visible.map(({ card, position }) => [card.id, position])).toEqual([
      ['f51', 51],
      ['f52', 52],
      ['f53', 53],
    ]);
  });

  it('searches front, back, and ID while preserving canonical order', () => {
    expect(selectFlashcardPage(cards, 'ANSWER 4', 0).matches.map(({ card }) => card.id)).toEqual([
      'f4',
      'f40',
      'f41',
      'f42',
      'f43',
      'f44',
      'f45',
      'f46',
      'f47',
      'f48',
      'f49',
    ]);
    expect(selectFlashcardPage(cards, 'f53', 0).matches[0]?.card.id).toBe('f53');
    expect(selectFlashcardPage(cards, 'front 2', 0).matches.map(({ card }) => card.id)).toContain('f2');
  });

  it('clamps stale pages and returns an empty range for no matches', () => {
    const result = selectFlashcardPage(cards, 'absent', 9);
    expect(result.page).toBe(0);
    expect(result.visible).toEqual([]);
    expect(result.rangeStart).toBe(0);
    expect(result.rangeEnd).toBe(0);
  });
});

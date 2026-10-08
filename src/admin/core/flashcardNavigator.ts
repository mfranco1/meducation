import type { StoredFlashcard } from '../../content/schema/schema';

export const FLASHCARD_PAGE_SIZE = 25;

export function selectFlashcardPage(cards: readonly StoredFlashcard[], query: string, page: number) {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = cards
    .map((card, index) => ({ card, position: index + 1 }))
    .filter(
      ({ card }) => !normalized || `${card.id}\n${card.front}\n${card.back}`.toLocaleLowerCase().includes(normalized),
    );
  const pageCount = Math.max(1, Math.ceil(matches.length / FLASHCARD_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * FLASHCARD_PAGE_SIZE;
  return {
    matches,
    page: safePage,
    pageCount,
    visible: matches.slice(start, start + FLASHCARD_PAGE_SIZE),
    rangeStart: matches.length ? start + 1 : 0,
    rangeEnd: Math.min(start + FLASHCARD_PAGE_SIZE, matches.length),
  };
}

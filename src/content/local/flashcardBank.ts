import type { Subject } from '../../domain/types';
import { sha256Text } from '../../domain/contentDigest';
import generated from '../flashcardBank.generated.json';
import { subjects } from './questionBank';
import type { StoredFlashcard, StoredFlashcardBank, StoredFlashcardDeck } from '../schema/schema';

export interface FlashcardDeckSummary extends StoredFlashcardDeck {
  subject: Subject;
  cardCount: number;
  cardIds: string[];
}

const bank = generated as unknown as StoredFlashcardBank;
/** Build indexes once while retaining the canonical array order in every parent. */
export function createFlashcardRepository(bank: StoredFlashcardBank, catalog: readonly Subject[]) {
  const subjectsById = new Map(catalog.map((subject) => [subject.id, subject]));
  const cardsByDeckId = new Map<string, StoredFlashcard[]>();
  for (const card of bank.cards) {
    const cards = cardsByDeckId.get(card.deckId) ?? [];
    cards.push(card);
    cardsByDeckId.set(card.deckId, cards);
  }

  const deckSummaries: FlashcardDeckSummary[] = bank.decks.flatMap((deck) => {
    const subject = subjectsById.get(deck.subjectId);
    if (!subject) return [];
    const cards = cardsByDeckId.get(deck.id) ?? [];
    return [{ ...deck, subject, cardCount: cards.length, cardIds: cards.map((card) => card.id) }];
  });
  const decksBySubjectId = new Map<string, FlashcardDeckSummary[]>();
  const decksById = new Map(deckSummaries.map((deck) => [deck.id, deck]));
  for (const deck of deckSummaries) {
    const subjectDecks = decksBySubjectId.get(deck.subjectId) ?? [];
    subjectDecks.push(deck);
    decksBySubjectId.set(deck.subjectId, subjectDecks);
  }

  return {
    listSubjects: () =>
      catalog.map((subject) => {
        const decks = decksBySubjectId.get(subject.id) ?? [];
        return {
          ...subject,
          deckCount: decks.length,
          deckIds: decks.map((deck) => deck.id),
          emptyDeckIds: decks.filter((deck) => deck.cardCount === 0).map((deck) => deck.id),
        };
      }),
    listDecks: (subjectId: string) => decksBySubjectId.get(subjectId) ?? [],
    listCards: (deckId: string) => cardsByDeckId.get(deckId) ?? [],
    getDeck: (deckId: string) => decksById.get(deckId),
  };
}

export const flashcardRepository = createFlashcardRepository(bank, subjects);
export { bank as storedFlashcardBank };

export function serializeFlashcardBank(value: StoredFlashcardBank): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Must stay byte-compatible with the flashcard repository's Python revision calculation. */
export async function flashcardContentRevision(value: StoredFlashcardBank, catalog = subjects): Promise<string> {
  const payload = `flashcards-v2\n${JSON.stringify(catalog)}\n${serializeFlashcardBank(value)}`;
  return sha256Text(payload);
}

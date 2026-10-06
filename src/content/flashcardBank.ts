import type { Subject } from '../domain/types';
import { sha256Text } from '../domain/contentDigest';
import generated from './flashcardBank.generated.json';
import { subjects } from './questionBank';
import type { StoredFlashcard, StoredFlashcardBank, StoredFlashcardDeck, StoredFlashcardTopic } from './schema';

export interface FlashcardDeckSummary extends StoredFlashcardDeck {
  topic: StoredFlashcardTopic;
  subject: Subject;
  cardCount: number;
  cardIds: string[];
}

const bank = generated as unknown as StoredFlashcardBank;
/** Build indexes once while retaining the canonical array order in every parent. */
export function createFlashcardRepository(bank: StoredFlashcardBank, catalog: readonly Subject[]) {
  const subjectsById = new Map(catalog.map((subject) => [subject.id, subject]));
  const topicsById = new Map(bank.topics.map((topic) => [topic.id, topic]));
  const cardsByDeckId = new Map<string, StoredFlashcard[]>();
  const topicsBySubjectId = new Map<string, StoredFlashcardTopic[]>();

  for (const card of bank.cards) {
    const cards = cardsByDeckId.get(card.deckId) ?? [];
    cards.push(card);
    cardsByDeckId.set(card.deckId, cards);
  }

  for (const topic of bank.topics) {
    const items = topicsBySubjectId.get(topic.subjectId) ?? [];
    items.push(topic);
    topicsBySubjectId.set(topic.subjectId, items);
  }

  const deckSummaries: FlashcardDeckSummary[] = bank.decks.flatMap((deck) => {
    const topic = topicsById.get(deck.topicId);
    const subject = topic && subjectsById.get(topic.subjectId);
    if (!topic || !subject) return [];
    const cards = cardsByDeckId.get(deck.id) ?? [];
    const summary = { ...deck, topic, subject, cardCount: cards.length, cardIds: cards.map((card) => card.id) };
    return [summary];
  });
  const decksBySubjectId = new Map<string, FlashcardDeckSummary[]>();
  const decksByTopicId = new Map<string, FlashcardDeckSummary[]>();
  const decksById = new Map(deckSummaries.map((deck) => [deck.id, deck]));
  for (const deck of deckSummaries) {
    const subjectDecks = decksBySubjectId.get(deck.subject.id) ?? [];
    subjectDecks.push(deck);
    decksBySubjectId.set(deck.subject.id, subjectDecks);
    const topicDecks = decksByTopicId.get(deck.topicId) ?? [];
    topicDecks.push(deck);
    decksByTopicId.set(deck.topicId, topicDecks);
  }

  /** Read-only indexed adapter for the canonical flashcard JSON. */
  return {
    listSubjects: () =>
      catalog.map((subject) => {
        const subjectTopics = topicsBySubjectId.get(subject.id) ?? [];
        const decks = decksBySubjectId.get(subject.id) ?? [];
        return {
          ...subject,
          topicCount: subjectTopics.length,
          deckCount: decks.length,
          deckIds: decks.map((deck) => deck.id),
          emptyDeckIds: decks.filter((deck) => deck.cardCount === 0).map((deck) => deck.id),
        };
      }),
    listTopics: (subjectId: string) => topicsBySubjectId.get(subjectId) ?? [],
    listDecks: (subjectId: string, topicId?: string) =>
      topicId === undefined
        ? (decksBySubjectId.get(subjectId) ?? [])
        : topicsById.get(topicId)?.subjectId === subjectId
          ? (decksByTopicId.get(topicId) ?? [])
          : [],
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
  const payload = `flashcards-v1\n${JSON.stringify(catalog)}\n${serializeFlashcardBank(value)}`;
  return sha256Text(payload);
}

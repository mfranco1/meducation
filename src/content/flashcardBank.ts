import type { Subject } from '../domain/types';
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
const subjectsById = new Map(subjects.map(subject => [subject.id, subject]));
const topicsById = new Map(bank.topics.map(topic => [topic.id, topic]));
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

const deckSummaries: FlashcardDeckSummary[] = bank.decks.flatMap(deck => {
  const topic = topicsById.get(deck.topicId);
  const subject = topic && subjectsById.get(topic.subjectId);
  if (!topic || !subject) return [];
  const cards = cardsByDeckId.get(deck.id) ?? [];
  const summary = { ...deck, topic, subject, cardCount: cards.length, cardIds: cards.map(card => card.id) };
  return [summary];
});

/** Read-only indexed adapter for the canonical flashcard JSON. */
export const flashcardRepository = {
  listSubjects: () => subjects.map(subject => {
    const subjectTopics = topicsBySubjectId.get(subject.id) ?? [];
    const topicIds = new Set(subjectTopics.map(topic => topic.id));
    const decks = deckSummaries.filter(deck => topicIds.has(deck.topicId));
    return { ...subject, topicCount: subjectTopics.length, deckCount: decks.length, deckIds: decks.map(deck => deck.id) };
  }),
  listTopics: (subjectId: string) => topicsBySubjectId.get(subjectId) ?? [],
  listDecks: (subjectId: string, topicId?: string) => deckSummaries.filter(deck =>
    deck.subject.id === subjectId && (topicId === undefined || deck.topicId === topicId)),
  listCards: (deckId: string) => cardsByDeckId.get(deckId) ?? [],
  getDeck: (deckId: string) => deckSummaries.find(deck => deck.id === deckId),
};

export { bank as storedFlashcardBank };

export function serializeFlashcardBank(value: StoredFlashcardBank): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Must stay byte-compatible with the flashcard repository's Python revision calculation. */
export async function flashcardContentRevision(value: StoredFlashcardBank, catalog = subjects): Promise<string> {
  const payload = `flashcards-v1\n${JSON.stringify(catalog)}\n${serializeFlashcardBank(value)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `sha256-${hex}`;
}

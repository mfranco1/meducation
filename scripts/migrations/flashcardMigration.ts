import type { Subject } from '../../src/domain/types';
import type { StoredFlashcardBank } from '../../src/content/schema/schema';
import { validateFlashcardBank } from '../../src/content/validation/flashcardValidation';
import type { ValidationIssue } from '../../src/content/validation/validate';

interface LegacyTopic {
  id: string;
  subjectId: string;
  name: string;
}
interface LegacyDeck {
  id: string;
  topicId: string;
  name: string;
  description?: string;
}
interface LegacyFlashcardBank {
  schemaVersion: 1;
  topics: LegacyTopic[];
  decks: LegacyDeck[];
  cards: StoredFlashcardBank['cards'];
}

export interface FlashcardMigrationReport {
  bank: StoredFlashcardBank;
  removedTopics: Array<{ id: string; subjectId: string; name: string }>;
  mappedDecks: Array<{ id: string; fromTopicId: string; toSubjectId: string }>;
  warnings: ValidationIssue[];
}

/** Builds a reviewed v2 candidate. It never mutates the input or edits canonical files. */
export function migrateFlashcardBankV1(value: unknown, subjects: readonly Subject[]): FlashcardMigrationReport {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Legacy flashcard bank must be an object.');
  const old = value as Partial<LegacyFlashcardBank> & Record<string, unknown>;
  if (old.schemaVersion !== 1)
    throw new Error(`Expected flashcard schema version 1; received ${String(old.schemaVersion)}.`);
  if (Object.keys(old).some((key) => !['schemaVersion', 'topics', 'decks', 'cards'].includes(key)))
    throw new Error('Legacy flashcard bank contains an unknown field.');
  if (!Array.isArray(old.topics) || !Array.isArray(old.decks) || !Array.isArray(old.cards))
    throw new Error('Legacy flashcard bank must contain topic, deck, and card arrays.');
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  const topicById = new Map<string, LegacyTopic>();
  for (const [index, topic] of old.topics.entries()) {
    if (
      !topic ||
      typeof topic !== 'object' ||
      Array.isArray(topic) ||
      Object.keys(topic).some((key) => !['id', 'subjectId', 'name'].includes(key))
    )
      throw new Error(`topics[${index}] is invalid.`);
    if (typeof topic.id !== 'string' || !/^t[a-zA-Z0-9-]+$/.test(topic.id) || topicById.has(topic.id))
      throw new Error(`topics[${index}].id is missing, invalid, or duplicated.`);
    if (typeof topic.subjectId !== 'string' || !subjectIds.has(topic.subjectId))
      throw new Error(`Topic ${topic.id} references an unknown subject.`);
    if (typeof topic.name !== 'string' || !topic.name.trim()) throw new Error(`Topic ${topic.id} has an empty name.`);
    topicById.set(topic.id, topic);
  }
  const mappedDecks = old.decks.map((deck, index) => {
    if (
      !deck ||
      typeof deck !== 'object' ||
      Array.isArray(deck) ||
      Object.keys(deck).some((key) => !['id', 'topicId', 'name', 'description'].includes(key))
    )
      throw new Error(`decks[${index}] is invalid.`);
    const topic = typeof deck.topicId === 'string' ? topicById.get(deck.topicId) : undefined;
    if (!topic) throw new Error(`Deck ${String(deck.id)} references an unknown topic.`);
    const { topicId, ...record } = deck;
    return {
      deck: { ...record, subjectId: topic.subjectId },
      map: { id: deck.id, fromTopicId: topicId, toSubjectId: topic.subjectId },
    };
  });
  const bank: StoredFlashcardBank = {
    schemaVersion: 2,
    decks: mappedDecks.map((item) => item.deck),
    cards: structuredClone(old.cards),
  };
  const validation = validateFlashcardBank(bank, subjects);
  const errors = validation.filter((issue) => issue.level === 'error');
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join(' '));
  return {
    bank,
    removedTopics: [...topicById.values()].map(({ id, subjectId, name }) => ({ id, subjectId, name })),
    mappedDecks: mappedDecks.map((item) => item.map),
    warnings: validation.filter((issue) => issue.level === 'warning'),
  };
}

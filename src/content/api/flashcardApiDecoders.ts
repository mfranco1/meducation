import type { Subject, Topic } from '../../domain/types';
import type { StoredFlashcard, StoredFlashcardDeck } from '../schema/schema';
import { ids, isTopicList, optionalString } from './apiDecoders';
import { isObject, nonBlank, onlyKeys, unique } from '../../domain/json';

export interface FlashcardSubjectSummary extends Subject {
  deckCount: number;
  deckIds: string[];
  emptyDeckIds?: string[];
}
export interface FlashcardDeckSummary extends StoredFlashcardDeck {
  subjectId: string;
  cardCount: number;
  cardIds: string[];
}
export interface FlashcardSubjectResponse {
  revision: string;
  subjects: FlashcardSubjectSummary[];
}
export interface FlashcardCatalogResponse {
  revision: string;
  topics: Topic[];
  decks: FlashcardDeckSummary[];
}
export interface FlashcardListResponse {
  revision: string;
  cards: StoredFlashcard[];
}

export function isFlashcardSubjectResponse(value: unknown): value is FlashcardSubjectResponse {
  if (
    !isObject(value) ||
    !onlyKeys(value, ['revision', 'subjects']) ||
    !nonBlank(value.revision) ||
    !Array.isArray(value.subjects)
  )
    return false;
  const subjectIds: string[] = [];
  const allDeckIds: string[] = [];
  return (
    value.subjects.every((subject: unknown) => {
      if (
        !isObject(subject) ||
        !onlyKeys(subject, ['id', 'name', 'accent', 'description', 'deckCount', 'deckIds', 'emptyDeckIds'])
      )
        return false;
      if (
        !nonBlank(subject.id) ||
        !/^s[1-9]\d*$/.test(subject.id) ||
        !nonBlank(subject.name) ||
        typeof subject.accent !== 'string' ||
        !optionalString(subject.description)
      )
        return false;
      if (
        !Number.isInteger(subject.deckCount) ||
        (subject.deckCount as number) < 0 ||
        !ids(subject.deckIds, /^d[a-zA-Z0-9-]+$/) ||
        subject.deckIds.length !== subject.deckCount
      )
        return false;
      subjectIds.push(subject.id);
      if (
        subject.emptyDeckIds !== undefined &&
        (!Array.isArray(subject.emptyDeckIds) ||
          !subject.emptyDeckIds.every(
            (id: unknown) => typeof id === 'string' && (subject.deckIds as string[]).includes(id),
          ) ||
          !unique(subject.emptyDeckIds as string[]))
      )
        return false;
      allDeckIds.push(...subject.deckIds);
      return true;
    }) &&
    unique(subjectIds) &&
    unique(allDeckIds)
  );
}

export function isFlashcardCatalog(
  value: unknown,
  subjectId: string,
  expectedDeckCount?: number,
): value is FlashcardCatalogResponse {
  if (
    !isObject(value) ||
    !onlyKeys(value, ['revision', 'topics', 'decks']) ||
    !nonBlank(value.revision) ||
    !isTopicList(value.topics, subjectId) ||
    !Array.isArray(value.decks)
  )
    return false;
  const topicIds = value.topics.map((topic) => topic.id);
  if (expectedDeckCount !== undefined && value.decks.length !== expectedDeckCount) return false;
  const deckIds: string[] = [];
  const decksValid = value.decks.every((deck: unknown) => {
    if (
      !isObject(deck) ||
      !onlyKeys(deck, ['id', 'subjectId', 'topicId', 'name', 'description', 'cardCount', 'cardIds'])
    )
      return false;
    if (
      !nonBlank(deck.id) ||
      !/^d[a-zA-Z0-9-]+$/.test(deck.id) ||
      deck.subjectId !== subjectId ||
      !topicIds.includes(deck.topicId as string) ||
      !nonBlank(deck.name)
    )
      return false;
    if (!optionalString(deck.description)) return false;
    if (
      !Number.isInteger(deck.cardCount) ||
      (deck.cardCount as number) < 0 ||
      !ids(deck.cardIds, /^f[a-zA-Z0-9-]+$/) ||
      deck.cardIds.length !== deck.cardCount
    )
      return false;
    deckIds.push(deck.id);
    return true;
  });
  return decksValid && unique(deckIds);
}

export function isFlashcardList(
  value: unknown,
  deckId: string,
  expectedCardIds?: string[],
): value is FlashcardListResponse {
  if (
    !isObject(value) ||
    !onlyKeys(value, ['revision', 'cards']) ||
    !nonBlank(value.revision) ||
    !Array.isArray(value.cards)
  )
    return false;
  const cardIds: string[] = [];
  const cardsValid = value.cards.every((card: unknown) => {
    if (!isObject(card) || !onlyKeys(card, ['id', 'deckId', 'front', 'back', 'sources'])) return false;
    if (
      !nonBlank(card.id) ||
      !/^f[a-zA-Z0-9-]+$/.test(card.id) ||
      card.deckId !== deckId ||
      !nonBlank(card.front) ||
      !nonBlank(card.back)
    )
      return false;
    if (!optionalString(card.sources)) return false;
    cardIds.push(card.id);
    return true;
  });
  return (
    cardsValid &&
    unique(cardIds) &&
    (expectedCardIds === undefined ||
      (cardIds.length === expectedCardIds.length && cardIds.every((id, index) => id === expectedCardIds[index])))
  );
}

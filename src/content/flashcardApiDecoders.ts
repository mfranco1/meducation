import type { Subject } from '../domain/types';
import type { StoredFlashcard, StoredFlashcardDeck } from './schema';

export interface FlashcardSubjectSummary extends Subject {
  deckCount: number;
  deckIds: string[];
  emptyDeckIds?: string[];
}
export interface FlashcardDeckSummary extends StoredFlashcardDeck {
  cardCount: number;
  cardIds: string[];
}
export interface FlashcardSubjectResponse {
  revision: string;
  subjects: FlashcardSubjectSummary[];
}
export interface FlashcardCatalogResponse {
  revision: string;
  decks: FlashcardDeckSummary[];
}
export interface FlashcardListResponse {
  revision: string;
  cards: StoredFlashcard[];
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const unique = (values: string[]) => new Set(values).size === values.length;
const onlyKeys = (value: RecordValue, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));

export function isFlashcardSubjectResponse(value: unknown): value is FlashcardSubjectResponse {
  if (
    !record(value) ||
    !onlyKeys(value, ['revision', 'subjects']) ||
    !nonempty(value.revision) ||
    !Array.isArray(value.subjects)
  )
    return false;
  const subjectIds: string[] = [];
  const allDeckIds: string[] = [];
  return (
    value.subjects.every((subject: unknown) => {
      if (!record(subject) || !onlyKeys(subject, ['id', 'name', 'accent', 'deckCount', 'deckIds', 'emptyDeckIds']))
        return false;
      if (
        !nonempty(subject.id) ||
        !/^s[1-9]\d*$/.test(subject.id) ||
        !nonempty(subject.name) ||
        typeof subject.accent !== 'string'
      )
        return false;
      if (
        !Number.isInteger(subject.deckCount) ||
        (subject.deckCount as number) < 0 ||
        !Array.isArray(subject.deckIds) ||
        !subject.deckIds.every((id: unknown) => typeof id === 'string' && /^d[a-zA-Z0-9-]+$/.test(id)) ||
        subject.deckIds.length !== subject.deckCount ||
        !unique(subject.deckIds as string[])
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
      allDeckIds.push(...(subject.deckIds as string[]));
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
    !record(value) ||
    !onlyKeys(value, ['revision', 'decks']) ||
    !nonempty(value.revision) ||
    !Array.isArray(value.decks)
  )
    return false;
  if (expectedDeckCount !== undefined && value.decks.length !== expectedDeckCount) return false;
  const deckIds: string[] = [];
  const decksValid = value.decks.every((deck: unknown) => {
    if (!record(deck) || !onlyKeys(deck, ['id', 'subjectId', 'name', 'description', 'cardCount', 'cardIds']))
      return false;
    if (!nonempty(deck.id) || !/^d[a-zA-Z0-9-]+$/.test(deck.id) || deck.subjectId !== subjectId || !nonempty(deck.name))
      return false;
    if (deck.description !== undefined && typeof deck.description !== 'string') return false;
    if (
      !Number.isInteger(deck.cardCount) ||
      (deck.cardCount as number) < 0 ||
      !Array.isArray(deck.cardIds) ||
      !deck.cardIds.every((id: unknown) => typeof id === 'string' && /^f[a-zA-Z0-9-]+$/.test(id)) ||
      deck.cardIds.length !== deck.cardCount ||
      !unique(deck.cardIds as string[])
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
    !record(value) ||
    !onlyKeys(value, ['revision', 'cards']) ||
    !nonempty(value.revision) ||
    !Array.isArray(value.cards)
  )
    return false;
  const cardIds: string[] = [];
  const cardsValid = value.cards.every((card: unknown) => {
    if (!record(card) || !onlyKeys(card, ['id', 'deckId', 'front', 'back', 'sources', 'reviewNote'])) return false;
    if (
      !nonempty(card.id) ||
      !/^f[a-zA-Z0-9-]+$/.test(card.id) ||
      card.deckId !== deckId ||
      !nonempty(card.front) ||
      !nonempty(card.back)
    )
      return false;
    if (card.sources !== undefined && typeof card.sources !== 'string') return false;
    if (card.reviewNote !== undefined && typeof card.reviewNote !== 'string') return false;
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

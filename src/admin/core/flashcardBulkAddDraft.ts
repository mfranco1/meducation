import type { StoredFlashcardBank } from '../../content/schema/schema';
import type { BulkPlan } from '../data/DraftStore';
import { foldByName, nameKey } from './bulkAddDraft';

export type FlashcardBulkAddContext =
  | { kind: 'subject'; subjectId: string }
  | { kind: 'topic'; topicId: string }
  | { kind: 'deck'; deckId: string };

export interface FlashcardCardDraft {
  front: string;
  back: string;
  sources?: string;
}

export interface FlashcardDeckDraft {
  name: string;
  description?: string;
  cards?: FlashcardCardDraft[];
}

export interface FlashcardTopicDraft {
  name: string;
  description?: string;
  decks: FlashcardDeckDraft[];
}

export type FlashcardBulkAddDraft =
  | { kind: 'cards'; cards: FlashcardCardDraft[] }
  | { kind: 'decks'; decks: FlashcardDeckDraft[] }
  | { kind: 'topics'; topics: FlashcardTopicDraft[] };

export interface FlashcardBulkDiagnostic {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const nonBlank = (value: unknown): value is string => isString(value) && Boolean(value.trim());
const cardKeys = ['front', 'back', 'sources'] as const;

function parseCard(
  value: unknown,
  path: string,
  diagnostics: FlashcardBulkDiagnostic[],
): FlashcardCardDraft | undefined {
  if (!isObject(value)) {
    diagnostics.push({ level: 'error', path, message: 'must be an object.' });
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!cardKeys.includes(key as (typeof cardKeys)[number]))
      diagnostics.push({ level: 'error', path: `${path}.${key}`, message: 'is not an editable card field.' });
  }
  for (const field of ['front', 'back'] as const) {
    if (!nonBlank(value[field]))
      diagnostics.push({ level: 'error', path: `${path}.${field}`, message: 'must be a non-empty string.' });
  }
  if (value.sources !== undefined && !isString(value.sources))
    diagnostics.push({ level: 'error', path: `${path}.sources`, message: 'must be a string when provided.' });
  if (diagnostics.some((issue) => issue.level === 'error' && issue.path.startsWith(`${path}.`))) return undefined;
  return {
    front: value.front as string,
    back: value.back as string,
    ...(value.sources === undefined ? {} : { sources: value.sources as string }),
  };
}

/** A blank description is left unset so an untouched template stores nothing. */
const optionalDescription = (value: unknown) => (isString(value) && value.trim() ? { description: value } : {});

function parseDecks(value: unknown, path: string, diagnostics: FlashcardBulkDiagnostic[]): FlashcardDeckDraft[] {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ level: 'error', path, message: 'must be a non-empty array.' });
    return [];
  }
  const decks: FlashcardDeckDraft[] = [];
  value.forEach((rawDeck, index) => {
    const deckPath = `${path}[${index}]`;
    if (!isObject(rawDeck)) {
      diagnostics.push({ level: 'error', path: deckPath, message: 'must be an object.' });
      return;
    }
    for (const key of Object.keys(rawDeck))
      if (!['name', 'description', 'cards'].includes(key))
        diagnostics.push({ level: 'error', path: `${deckPath}.${key}`, message: 'is not an editable deck field.' });
    if (!nonBlank(rawDeck.name))
      diagnostics.push({ level: 'error', path: `${deckPath}.name`, message: 'must be a non-empty string.' });
    if (rawDeck.description !== undefined && !isString(rawDeck.description))
      diagnostics.push({ level: 'error', path: `${deckPath}.description`, message: 'must be a string when provided.' });
    let cards: FlashcardCardDraft[] | undefined;
    if (rawDeck.cards !== undefined) {
      if (!Array.isArray(rawDeck.cards)) {
        diagnostics.push({ level: 'error', path: `${deckPath}.cards`, message: 'must be an array when provided.' });
      } else {
        cards = rawDeck.cards
          .map((item, cardIndex) => parseCard(item, `${deckPath}.cards[${cardIndex}]`, diagnostics))
          .filter((item): item is FlashcardCardDraft => item !== undefined);
      }
    }
    if (nonBlank(rawDeck.name) && (rawDeck.description === undefined || isString(rawDeck.description))) {
      decks.push({ name: rawDeck.name, ...optionalDescription(rawDeck.description), ...(cards === undefined ? {} : { cards }) });
    }
  });
  return decks;
}

export function parseFlashcardBulkAddDraft(
  value: unknown,
  context: FlashcardBulkAddContext,
): { draft?: FlashcardBulkAddDraft; diagnostics: FlashcardBulkDiagnostic[] } {
  const diagnostics: FlashcardBulkDiagnostic[] = [];
  if (!isObject(value)) return { diagnostics: [{ level: 'error', path: '$', message: 'must be a JSON object.' }] };

  if (context.kind === 'deck') {
    for (const key of Object.keys(value))
      if (key !== 'cards')
        diagnostics.push({ level: 'error', path: `$.${key}`, message: 'is not editable in this template.' });
    if (!Array.isArray(value.cards) || value.cards.length === 0) {
      diagnostics.push({ level: 'error', path: '$.cards', message: 'must be a non-empty array.' });
    }
    const cards = Array.isArray(value.cards)
      ? value.cards
          .map((item, index) => parseCard(item, `$.cards[${index}]`, diagnostics))
          .filter((item): item is FlashcardCardDraft => item !== undefined)
      : [];
    return diagnostics.some((issue) => issue.level === 'error')
      ? { diagnostics }
      : { draft: { kind: 'cards', cards }, diagnostics };
  }

  if (context.kind === 'subject') {
    for (const key of Object.keys(value))
      if (key !== 'topics')
        diagnostics.push({ level: 'error', path: `$.${key}`, message: 'is not editable in this template.' });
    if (!Array.isArray(value.topics) || value.topics.length === 0)
      diagnostics.push({ level: 'error', path: '$.topics', message: 'must be a non-empty array.' });
    const topics: FlashcardTopicDraft[] = [];
    if (Array.isArray(value.topics)) {
      value.topics.forEach((rawTopic, index) => {
        const path = `$.topics[${index}]`;
        if (!isObject(rawTopic)) {
          diagnostics.push({ level: 'error', path, message: 'must be an object.' });
          return;
        }
        for (const key of Object.keys(rawTopic))
          if (!['name', 'description', 'decks'].includes(key))
            diagnostics.push({ level: 'error', path: `${path}.${key}`, message: 'is not an editable topic field.' });
        if (!nonBlank(rawTopic.name))
          diagnostics.push({ level: 'error', path: `${path}.name`, message: 'must be a non-empty string.' });
        if (rawTopic.description !== undefined && !isString(rawTopic.description))
          diagnostics.push({ level: 'error', path: `${path}.description`, message: 'must be a string when provided.' });
        const decks = parseDecks(rawTopic.decks, `${path}.decks`, diagnostics);
        if (nonBlank(rawTopic.name) && (rawTopic.description === undefined || isString(rawTopic.description)))
          topics.push({ name: rawTopic.name, ...optionalDescription(rawTopic.description), decks });
      });
    }
    return diagnostics.some((issue) => issue.level === 'error')
      ? { diagnostics }
      : { draft: { kind: 'topics', topics }, diagnostics };
  }

  for (const key of Object.keys(value))
    if (key !== 'decks')
      diagnostics.push({ level: 'error', path: `$.${key}`, message: 'is not editable in this template.' });
  const decks = parseDecks(value.decks, '$.decks', diagnostics);
  return diagnostics.some((issue) => issue.level === 'error')
    ? { diagnostics }
    : { draft: { kind: 'decks', decks }, diagnostics };
}

/** Decks matching an existing deck by name add to it; the rest are created. */
const deckGroups = (decks: FlashcardDeckDraft[], existing: { id: string; name: string }[], merged: string[]) =>
  foldByName(decks, (into, deck) => ({ ...into, cards: [...(into.cards ?? []), ...(deck.cards ?? [])] })).map((deck) => {
    const match = existing.find((row) => nameKey(row.name) === nameKey(deck.name));
    const children = (deck.cards ?? []).map((card) => ({ ...card }));
    if (match) {
      merged.push(`Deck · ${match.name} · ${match.id}`);
      return { parentId: match.id, childKind: 'cards' as const, children };
    }
    return {
      create: {
        kind: 'decks' as const,
        fields: { name: deck.name, ...(deck.description === undefined ? {} : { description: deck.description }) },
      },
      childKind: 'cards' as const,
      children,
    };
  });

/** Turns a parsed draft into the records to create; the server assigns every ID. Names that already exist are reused. */
export function compileFlashcardBulkAddDraft(
  draft: FlashcardBulkAddDraft,
  context: FlashcardBulkAddContext,
  bank: StoredFlashcardBank,
  topics: readonly { id: string; subjectId: string; name: string }[],
): { plan?: BulkPlan; diagnostics: FlashcardBulkDiagnostic[]; merged: string[] } {
  const merged: string[] = [];
  const fail = (message: string) => ({ diagnostics: [{ level: 'error' as const, path: '$', message }], merged });
  const decksOf = (topicId: string) => bank.decks.filter((deck) => deck.topicId === topicId);
  if (context.kind === 'subject' && draft.kind === 'topics') {
    const existing = topics.filter((topic) => topic.subjectId === context.subjectId);
    return {
      plan: {
        subjectId: context.subjectId,
        topics: foldByName(draft.topics, (into, topic) => ({ ...into, decks: [...into.decks, ...topic.decks] })).map((topic) => {
          const match = existing.find((row) => nameKey(row.name) === nameKey(topic.name));
          if (match) {
            merged.push(`Topic · ${match.name} · ${match.id}`);
            return { id: match.id, groups: deckGroups(topic.decks, decksOf(match.id), merged) };
          }
          return {
            fields: { name: topic.name, ...(topic.description === undefined ? {} : { description: topic.description }) },
            groups: deckGroups(topic.decks, [], merged),
          };
        }),
      },
      diagnostics: [],
      merged,
    };
  }
  if (context.kind === 'topic' && draft.kind === 'decks') {
    if (!topics.some((topic) => topic.id === context.topicId)) return fail('selected topic no longer exists.');
    return {
      plan: { topics: [{ id: context.topicId, groups: deckGroups(draft.decks, decksOf(context.topicId), merged) }] },
      diagnostics: [],
      merged,
    };
  }
  if (context.kind === 'deck' && draft.kind === 'cards') {
    const deck = bank.decks.find((row) => row.id === context.deckId);
    if (!deck) return fail('selected deck no longer exists.');
    return {
      plan: { topics: [{ groups: [{ parentId: deck.id, childKind: 'cards', children: draft.cards.map((card) => ({ ...card })) }] }] },
      diagnostics: [],
      merged,
    };
  }
  return fail('draft type does not match the selected destination.');
}

export function flashcardBulkAddTemplate(context: FlashcardBulkAddContext): string {
  const card = { front: 'Question text', back: 'Answer text' };
  const deck = { name: 'Deck name', description: '', cards: [card] };
  return JSON.stringify(
    context.kind === 'deck'
      ? { cards: [card] }
      : context.kind === 'topic'
        ? { decks: [deck] }
        : { topics: [{ name: 'Topic name', description: '', decks: [deck] }] },
    null,
    2,
  );
}

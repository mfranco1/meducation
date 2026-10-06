import type { Subject } from '../../domain/types';
import { validateFlashcardBank } from '../../content/flashcardValidation';
import type { StoredFlashcard, StoredFlashcardBank, StoredFlashcardDeck } from '../../content/schema';
import type { FlashcardAdminOperation } from './flashcardChangeSet';

export type FlashcardBulkAddContext = { kind: 'subject'; subjectId: string } | { kind: 'deck'; deckId: string };

export interface FlashcardCardDraft {
  front: string;
  back: string;
  sources?: string;
  reviewNote?: string;
}

export interface FlashcardDeckDraft {
  name: string;
  description?: string;
  cards?: FlashcardCardDraft[];
}

export type FlashcardBulkAddDraft =
  { kind: 'cards'; cards: FlashcardCardDraft[] } | { kind: 'decks'; decks: FlashcardDeckDraft[] };

export interface FlashcardBulkDiagnostic {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export interface CompiledFlashcardBulkAdd {
  candidate: StoredFlashcardBank;
  operations: FlashcardAdminOperation[];
  generatedIds: string[];
  diagnostics: FlashcardBulkDiagnostic[];
  deckSummaries: Array<{
    id: string;
    name: string;
    cardCount: number;
    cards: Array<{ id: string; front: string; back: string; sources?: string; reviewNote?: string }>;
  }>;
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const nonBlank = (value: unknown): value is string => isString(value) && Boolean(value.trim());
const onlyKeys = (value: JsonObject, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));
const cardKeys = ['front', 'back', 'sources', 'reviewNote'] as const;

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
  for (const field of ['sources', 'reviewNote'] as const) {
    if (value[field] !== undefined && !isString(value[field]))
      diagnostics.push({ level: 'error', path: `${path}.${field}`, message: 'must be a string when provided.' });
  }
  if (diagnostics.some((issue) => issue.level === 'error' && issue.path.startsWith(`${path}.`))) return undefined;
  return {
    front: value.front as string,
    back: value.back as string,
    ...(value.sources === undefined ? {} : { sources: value.sources as string }),
    ...(value.reviewNote === undefined ? {} : { reviewNote: value.reviewNote as string }),
  };
}

export function parseFlashcardBulkAddDraft(
  value: unknown,
  context: FlashcardBulkAddContext,
): { draft?: FlashcardBulkAddDraft; diagnostics: FlashcardBulkDiagnostic[] } {
  const diagnostics: FlashcardBulkDiagnostic[] = [];
  if (!isObject(value)) return { diagnostics: [{ level: 'error', path: '$', message: 'must be a JSON object.' }] };

  if (context.kind === 'deck') {
    if (!onlyKeys(value, ['cards'])) {
      for (const key of Object.keys(value))
        if (key !== 'cards')
          diagnostics.push({ level: 'error', path: `$.${key}`, message: 'is not editable in this template.' });
    }
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

  if (!onlyKeys(value, ['decks'])) {
    for (const key of Object.keys(value))
      if (key !== 'decks')
        diagnostics.push({ level: 'error', path: `$.${key}`, message: 'is not editable in this template.' });
  }
  if (!Array.isArray(value.decks) || value.decks.length === 0)
    diagnostics.push({ level: 'error', path: '$.decks', message: 'must be a non-empty array.' });
  const decks: FlashcardDeckDraft[] = [];
  if (Array.isArray(value.decks)) {
    value.decks.forEach((rawDeck, index) => {
      const path = `$.decks[${index}]`;
      if (!isObject(rawDeck)) {
        diagnostics.push({ level: 'error', path, message: 'must be an object.' });
        return;
      }
      if (!onlyKeys(rawDeck, ['name', 'description', 'cards'])) {
        for (const key of Object.keys(rawDeck))
          if (!['name', 'description', 'cards'].includes(key))
            diagnostics.push({ level: 'error', path: `${path}.${key}`, message: 'is not an editable deck field.' });
      }
      if (!nonBlank(rawDeck.name))
        diagnostics.push({ level: 'error', path: `${path}.name`, message: 'must be a non-empty string.' });
      if (rawDeck.description !== undefined && !isString(rawDeck.description))
        diagnostics.push({ level: 'error', path: `${path}.description`, message: 'must be a string when provided.' });
      let cards: FlashcardCardDraft[] | undefined;
      if (rawDeck.cards !== undefined) {
        if (!Array.isArray(rawDeck.cards)) {
          diagnostics.push({ level: 'error', path: `${path}.cards`, message: 'must be an array when provided.' });
        } else {
          cards = rawDeck.cards
            .map((item, cardIndex) => parseCard(item, `${path}.cards[${cardIndex}]`, diagnostics))
            .filter((item): item is FlashcardCardDraft => item !== undefined);
        }
      }
      if (nonBlank(rawDeck.name) && (rawDeck.description === undefined || isString(rawDeck.description))) {
        decks.push({
          name: rawDeck.name,
          ...(rawDeck.description === undefined ? {} : { description: rawDeck.description as string }),
          ...(cards === undefined ? {} : { cards }),
        });
      }
    });
  }
  return diagnostics.some((issue) => issue.level === 'error')
    ? { diagnostics }
    : { draft: { kind: 'decks', decks }, diagnostics };
}

function nextId(prefix: 'd' | 'f', used: Set<string>, idFactory: () => string): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = `${prefix}-${idFactory()}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error(`Unable to allocate a unique ${prefix === 'd' ? 'deck' : 'card'} ID.`);
}

/** Compiles a parsed draft once. The returned IDs and operation list should be retained through Stage. */
export function compileFlashcardBulkAddDraft(
  draft: FlashcardBulkAddDraft,
  context: FlashcardBulkAddContext,
  bank: StoredFlashcardBank,
  subjects: readonly Subject[],
  idFactory: () => string = () => crypto.randomUUID(),
): { compiled?: CompiledFlashcardBulkAdd; diagnostics: FlashcardBulkDiagnostic[] } {
  const diagnostics: FlashcardBulkDiagnostic[] = [];
  if (context.kind === 'subject' && !subjects.some((subject) => subject.id === context.subjectId))
    return { diagnostics: [{ level: 'error', path: '$', message: 'selected subject no longer exists.' }] };
  const selectedDeck = context.kind === 'deck' ? bank.decks.find((deck) => deck.id === context.deckId) : undefined;
  if (context.kind === 'deck' && !selectedDeck)
    return { diagnostics: [{ level: 'error', path: '$', message: 'selected deck no longer exists.' }] };
  if ((context.kind === 'deck') !== (draft.kind === 'cards'))
    return {
      diagnostics: [{ level: 'error', path: '$', message: 'draft type does not match the selected destination.' }],
    };

  const used = new Set([...bank.decks.map((deck) => deck.id), ...bank.cards.map((card) => card.id)]);
  const operations: FlashcardAdminOperation[] = [];
  const generatedIds: string[] = [];
  const pathById = new Map<string, string>();
  const pathByWarning = new Map<string, string>();
  const deckSummaries: CompiledFlashcardBulkAdd['deckSummaries'] = [];
  const createCard = (card: FlashcardCardDraft, deckId: string, path: string) => {
    const id = nextId('f', used, idFactory);
    generatedIds.push(id);
    pathById.set(id, path);
    const value: StoredFlashcard = {
      id,
      deckId,
      front: card.front,
      back: card.back,
      ...(card.sources === undefined ? {} : { sources: card.sources }),
      ...(card.reviewNote === undefined ? {} : { reviewNote: card.reviewNote }),
    };
    operations.push({ op: 'card.create', value });
    return value;
  };

  if (draft.kind === 'cards') {
    const deck = selectedDeck!;
    const cards = draft.cards.map((card, index) => createCard(card, deck.id, `$.cards[${index}]`));
    deckSummaries.push({ id: deck.id, name: deck.name, cardCount: cards.length, cards });
  } else {
    draft.decks.forEach((deckDraft, deckIndex) => {
      const deckId = nextId('d', used, idFactory);
      generatedIds.push(deckId);
      pathById.set(deckId, `$.decks[${deckIndex}]`);
      pathByWarning.set(
        `Duplicate sibling name “${deckDraft.name}” under ${(context as Extract<FlashcardBulkAddContext, { kind: 'subject' }>).subjectId}; records retain distinct IDs.`,
        `$.decks[${deckIndex}].name`,
      );
      const value: StoredFlashcardDeck = {
        id: deckId,
        subjectId: (context as Extract<FlashcardBulkAddContext, { kind: 'subject' }>).subjectId,
        name: deckDraft.name,
        ...(deckDraft.description === undefined ? {} : { description: deckDraft.description }),
      };
      operations.push({ op: 'deck.create', value });
      const cards = (deckDraft.cards ?? []).map((card, cardIndex) =>
        createCard(card, deckId, `$.decks[${deckIndex}].cards[${cardIndex}]`),
      );
      deckSummaries.push({ id: deckId, name: deckDraft.name, cardCount: cards.length, cards });
    });
  }

  const candidate: StoredFlashcardBank = structuredClone(bank);
  for (const operation of operations) {
    if (operation.op === 'deck.create') candidate.decks.push(structuredClone(operation.value));
    else if (operation.op === 'card.create') candidate.cards.push(structuredClone(operation.value));
  }
  for (const issue of validateFlashcardBank(candidate, subjects)) {
    const path = issue.questionId ? (pathById.get(issue.questionId) ?? '$') : (pathByWarning.get(issue.message) ?? '$');
    diagnostics.push({ level: issue.level, path, message: issue.message });
  }
  if (diagnostics.some((issue) => issue.level === 'error')) return { diagnostics };
  return { compiled: { candidate, operations, generatedIds, diagnostics, deckSummaries }, diagnostics };
}

export function flashcardBulkAddTemplate(context: FlashcardBulkAddContext): string {
  return JSON.stringify(
    context.kind === 'deck'
      ? { cards: [{ front: 'Question text', back: 'Answer text' }] }
      : {
          decks: [
            {
              name: 'Deck name',
              description: 'Optional description',
              cards: [{ front: 'Question text', back: 'Answer text' }],
            },
          ],
        },
    null,
    2,
  );
}

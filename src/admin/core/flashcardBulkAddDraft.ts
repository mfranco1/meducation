import type { StoredFlashcardBank } from '../../content/schema/schema';
import type { BulkPlan } from '../data/DraftStore';

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

export interface CompiledFlashcardBulkAdd {
  plan: BulkPlan;
  deckSummaries: Array<{ name: string; cardCount: number }>;
}

/** Turns a parsed draft into the records to create; the server assigns every ID. */
export function compileFlashcardBulkAddDraft(
  draft: FlashcardBulkAddDraft,
  context: FlashcardBulkAddContext,
  bank: StoredFlashcardBank,
  subjects: readonly { id: string }[],
): { compiled?: CompiledFlashcardBulkAdd; diagnostics: FlashcardBulkDiagnostic[] } {
  const fail = (message: string) => ({ diagnostics: [{ level: 'error' as const, path: '$', message }] });
  if (context.kind === 'subject' && !subjects.some((subject) => subject.id === context.subjectId))
    return fail('selected subject no longer exists.');
  const selectedDeck = context.kind === 'deck' ? bank.decks.find((deck) => deck.id === context.deckId) : undefined;
  if (context.kind === 'deck' && !selectedDeck) return fail('selected deck no longer exists.');
  if ((context.kind === 'deck') !== (draft.kind === 'cards')) return fail('draft type does not match the selected destination.');
  if (draft.kind === 'cards')
    return {
      compiled: {
        plan: { groups: [{ parentId: selectedDeck!.id, childKind: 'cards', children: draft.cards.map((card) => ({ ...card })) }] },
        deckSummaries: [{ name: selectedDeck!.name, cardCount: draft.cards.length }],
      },
      diagnostics: [],
    };
  return {
    compiled: {
      plan: {
        subjectId: (context as Extract<FlashcardBulkAddContext, { kind: 'subject' }>).subjectId,
        groups: draft.decks.map((deck) => ({
          create: {
            kind: 'decks' as const,
            fields: { name: deck.name, ...(deck.description === undefined ? {} : { description: deck.description }) },
          },
          childKind: 'cards' as const,
          children: (deck.cards ?? []).map((card) => ({ ...card })),
        })),
      },
      deckSummaries: draft.decks.map((deck) => ({ name: deck.name, cardCount: deck.cards?.length ?? 0 })),
    },
    diagnostics: [],
  };
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

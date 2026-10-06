import type { StoredFlashcard, StoredFlashcardBank, StoredFlashcardDeck, StoredFlashcardTopic } from '../../content/schema';
import type { Subject } from '../../domain/types';
import { validateFlashcardBank } from '../../content/flashcardValidation';
import { flashcardContentRevision } from '../../content/flashcardBank';
import { sha256Text } from '../../domain/contentDigest';

type Kind = 'topic' | 'deck' | 'card';
type EntityFor<K extends Kind> = K extends 'topic' ? StoredFlashcardTopic : K extends 'deck' ? StoredFlashcardDeck : StoredFlashcard;
export type FlashcardAdminOperation =
  | { op: 'topic.create'; value: StoredFlashcardTopic; afterId?: string }
  | { op: 'topic.update'; id: string; value: StoredFlashcardTopic }
  | { op: 'topic.delete'; id: string; cascade?: true }
  | { op: 'topic.move'; id: string; afterId?: string; first?: true }
  | { op: 'deck.create'; value: StoredFlashcardDeck; afterId?: string }
  | { op: 'deck.update'; id: string; value: StoredFlashcardDeck }
  | { op: 'deck.delete'; id: string; cascade?: true }
  | { op: 'deck.move'; id: string; afterId?: string; first?: true }
  | { op: 'card.create'; value: StoredFlashcard; afterId?: string }
  | { op: 'card.update'; id: string; value: StoredFlashcard }
  | { op: 'card.delete'; id: string }
  | { op: 'card.move'; id: string; afterId?: string; first?: true };

export interface FlashcardAdminChangeSet {
  changeSetVersion: 1;
  base: { schemaVersion: 1; revision: string; subjectRevision: string };
  resultRevision: string;
  resultSubjectRevision: string;
  reason: string;
  operations: FlashcardAdminOperation[];
}

const clone = (bank: StoredFlashcardBank) => structuredClone(bank);
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const keyFor = (kind: Kind) => kind === 'topic' ? 'topics' : kind === 'deck' ? 'decks' : 'cards';
const parentFor = (kind: Kind, value: EntityFor<Kind>) => kind === 'topic'
  ? (value as StoredFlashcardTopic).subjectId
  : kind === 'deck' ? (value as StoredFlashcardDeck).topicId : (value as StoredFlashcard).deckId;
const uniqueId = (bank: StoredFlashcardBank, id: string) => !bank.topics.some(value => value.id === id) && !bank.decks.some(value => value.id === id) && !bank.cards.some(value => value.id === id);

function insert<K extends Kind>(bank: StoredFlashcardBank, kind: K, value: EntityFor<K>, afterId?: string) {
  const items = bank[keyFor(kind)] as Array<EntityFor<K>>;
  if (!uniqueId(bank, value.id)) throw new Error(`Flashcard record ID ${value.id} already exists.`);
  if (kind === 'deck' && !bank.topics.some(topic => topic.id === (value as StoredFlashcardDeck).topicId)) throw new Error('Deck references an unknown topic.');
  if (kind === 'card' && !bank.decks.some(deck => deck.id === (value as StoredFlashcard).deckId)) throw new Error('Card references an unknown deck.');
  if (!afterId) { items.push(value); return; }
  const afterIndex = items.findIndex(item => item.id === afterId);
  if (afterIndex < 0 || parentFor(kind, items[afterIndex]) !== parentFor(kind, value)) throw new Error(`Relative ${kind} ${afterId} is missing or belongs to another parent.`);
  items.splice(afterIndex + 1, 0, value);
}

function move<K extends Kind>(bank: StoredFlashcardBank, kind: K, id: string, afterId?: string, first?: true) {
  const items = bank[keyFor(kind)] as Array<EntityFor<K>>;
  const index = items.findIndex(item => item.id === id);
  if (index < 0) throw new Error(`${kind} ${id} does not exist.`);
  const [value] = items.splice(index, 1);
  if (first) {
    const parent = parentFor(kind, value);
    const firstSibling = items.findIndex(item => parentFor(kind, item) === parent);
    items.splice(firstSibling < 0 ? items.length : firstSibling, 0, value);
    return;
  }
  if (!afterId) { items.push(value); return; }
  const afterIndex = items.findIndex(item => item.id === afterId);
  if (afterIndex < 0 || parentFor(kind, items[afterIndex]) !== parentFor(kind, value)) throw new Error(`Relative ${kind} ${afterId} is missing or belongs to another parent.`);
  items.splice(afterIndex + 1, 0, value);
}

/** Applies the complete batch to a clone and only returns it after all references validate. */
export function applyFlashcardOperations(source: StoredFlashcardBank, subjects: readonly Subject[], operations: readonly FlashcardAdminOperation[]): StoredFlashcardBank {
  const bank = clone(source);
  for (const original of operations) {
    const operation = original as unknown as { op: string; value?: StoredFlashcardTopic | StoredFlashcardDeck | StoredFlashcard; id?: string; afterId?: string; cascade?: true; first?: true };
    const [kind, action] = operation.op.split('.') as [Kind, string];
    const items = bank[keyFor(kind)] as Array<{ id: string }>;
    if (action === 'create') {
      if (!operation.value) throw new Error('Create operation is missing its value.');
      insert(bank, kind, operation.value as EntityFor<typeof kind>, operation.afterId);
    }
    else if (action === 'move') {
      if (!operation.id) throw new Error('Move operation is missing its ID.');
      move(bank, kind, operation.id, operation.afterId, operation.first);
    }
    else if (action === 'update') {
      if (!operation.id || !operation.value) throw new Error('Update operation is missing its ID or value.');
      const index = items.findIndex(item => item.id === operation.id);
      if (index < 0) throw new Error(`${kind} ${operation.id} does not exist.`);
      if (operation.value.id !== operation.id) throw new Error(`${kind} IDs cannot be changed.`);
      items[index] = operation.value as never;
    } else if (action === 'delete') {
      if (!operation.id) throw new Error('Delete operation is missing its ID.');
      const index = items.findIndex(item => item.id === operation.id);
      if (index < 0) throw new Error(`${kind} ${operation.id} does not exist.`);
      if (kind === 'topic') {
        const decks = bank.decks.filter(deck => deck.topicId === operation.id);
        if (decks.length && !('cascade' in operation && operation.cascade)) throw new Error(`Topic ${operation.id} contains ${decks.length} deck(s); explicit cascade is required.`);
        const deckIds = new Set(decks.map(deck => deck.id));
        bank.decks = bank.decks.filter(deck => !deckIds.has(deck.id));
        bank.cards = bank.cards.filter(card => !deckIds.has(card.deckId));
      } else if (kind === 'deck') {
        const count = bank.cards.filter(card => card.deckId === operation.id).length;
        if (count && !('cascade' in operation && operation.cascade)) throw new Error(`Deck ${operation.id} contains ${count} card(s); explicit cascade is required.`);
        bank.cards = bank.cards.filter(card => card.deckId !== operation.id);
      }
      items.splice(index, 1);
    } else throw new Error(`Unsupported flashcard operation ${operation.op}.`);
  }
  const errors = validateFlashcardBank(bank, subjects).filter(issue => issue.level === 'error');
  if (errors.length) throw new Error(errors.map(issue => issue.message).join(' '));
  return bank;
}

export function isFlashcardAdminChangeSet(value: unknown): value is FlashcardAdminChangeSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!only(candidate, ['changeSetVersion', 'base', 'resultRevision', 'resultSubjectRevision', 'reason', 'operations'])) return false;
  if (candidate.changeSetVersion !== 1 || !candidate.base || typeof candidate.base !== 'object' || !Array.isArray(candidate.operations) || !candidate.operations.length) return false;
  const base = candidate.base as Record<string, unknown>;
  if (!only(base, ['schemaVersion', 'revision', 'subjectRevision'])) return false;
  if (base.schemaVersion !== 1 || typeof base.revision !== 'string' || typeof base.subjectRevision !== 'string' || typeof candidate.resultRevision !== 'string' || typeof candidate.resultSubjectRevision !== 'string' || typeof candidate.reason !== 'string' || !candidate.reason.trim()) return false;
  return candidate.operations.every(operation => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return false;
    const op = operation as Record<string, unknown>;
    if (typeof op.op !== 'string' || !/^(topic|deck|card)\.(create|update|delete|move)$/.test(op.op)) return false;
    const [kind, action] = op.op.split('.');
    if (action === 'create') return only(op, ['op', 'value', 'afterId']) && Boolean(op.value && typeof op.value === 'object' && !Array.isArray(op.value)) && (op.afterId === undefined || (typeof op.afterId === 'string' && Boolean(op.afterId.trim())));
    if (action === 'update') return only(op, ['op', 'id', 'value']) && typeof op.id === 'string' && Boolean(op.id.trim()) && Boolean(op.value && typeof op.value === 'object' && !Array.isArray(op.value));
    if (typeof op.id !== 'string' || !op.id.trim()) return false;
    if (action === 'delete') return only(op, kind === 'card' ? ['op', 'id'] : ['op', 'id', 'cascade']) && (op.cascade === undefined || op.cascade === true);
    return only(op, ['op', 'id', 'afterId', 'first']) && (op.afterId === undefined || (typeof op.afterId === 'string' && Boolean(op.afterId.trim()))) && (op.first === undefined || op.first === true) && !(op.first === true && op.afterId !== undefined);
  });
}

export async function replayFlashcardAdminChangeSet(source: StoredFlashcardBank, baseSubjects: readonly Subject[], changeSet: FlashcardAdminChangeSet, resultSubjects: readonly Subject[] = baseSubjects): Promise<StoredFlashcardBank> {
  const subjectRevision = await sha256Text(JSON.stringify(baseSubjects));
  const resultSubjectRevision = await sha256Text(JSON.stringify(resultSubjects));
  const revision = await flashcardContentRevision(source, [...baseSubjects]);
  if (revision !== changeSet.base.revision || subjectRevision !== changeSet.base.subjectRevision) throw new Error('This flashcard change set is based on stale content.');
  const result = applyFlashcardOperations(source, resultSubjects, changeSet.operations);
  const resultRevision = await flashcardContentRevision(result, [...resultSubjects]);
  if (resultRevision !== changeSet.resultRevision || resultSubjectRevision !== changeSet.resultSubjectRevision) throw new Error('The replayed flashcard change set does not match its declared result revisions.');
  return result;
}

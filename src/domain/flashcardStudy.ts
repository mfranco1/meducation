import type { FlashcardCard } from './types';
import { sha256Text } from './contentDigest';

export interface FlashcardCheckpoint {
  deckId: string;
  currentCardId: string;
  contentSignature: string;
  updatedAt: string;
  openedCardIds: string[];
  flaggedCardIds: string[];
}

export interface FlashcardProgressState {
  schemaVersion: 2;
  revision: string;
  checkpoints: Record<string, FlashcardCheckpoint>;
}

function serializedStudyContent(cards: readonly FlashcardCard[]): string {
  return JSON.stringify(cards.map(card => [card.id, card.front, card.back, card.sources ?? null, card.reviewNote ?? null]));
}

/** Compute once at launch: checkpoints contain a bounded digest, never copied card bodies. */
export async function flashcardContentSignature(cards: readonly FlashcardCard[]): Promise<string> {
  return sha256Text(serializedStudyContent(cards));
}

export function validateFlashcardCheckpoint(checkpoint: FlashcardCheckpoint, deckId: string, cards: readonly FlashcardCard[], signature: string): 'valid' | 'missing-card' | 'changed-content' {
  if (checkpoint.deckId !== deckId || !cards.some(card => card.id === checkpoint.currentCardId)) return 'missing-card';
  return checkpoint.contentSignature === signature ? 'valid' : 'changed-content';
}

export type FlashcardLaunch =
  | { kind: 'empty' }
  | { kind: 'start'; cardId: string }
  | { kind: 'resume'; cardId: string; index: number }
  | { kind: 'restart-required'; reason: 'missing-card' | 'changed-content' };

export function resolveFlashcardLaunch(deckId: string, cards: readonly FlashcardCard[], signature: string, checkpoint?: FlashcardCheckpoint, restart = false): FlashcardLaunch {
  if (!cards.length) return { kind: 'empty' };
  if (!checkpoint || restart) return { kind: 'start', cardId: cards[0].id };
  const status = validateFlashcardCheckpoint(checkpoint, deckId, cards, signature);
  if (status !== 'valid') return { kind: 'restart-required', reason: status };
  const cardIds = new Set(cards.map(card => card.id));
  if ([...checkpoint.openedCardIds, ...checkpoint.flaggedCardIds].some(id => !cardIds.has(id))) return { kind: 'restart-required', reason: 'changed-content' };
  return { kind: 'resume', cardId: checkpoint.currentCardId, index: cards.findIndex(card => card.id === checkpoint.currentCardId) };
}

export function checkpointForCard(deckId: string, cards: readonly FlashcardCard[], cardId: string, signature: string, updatedAt = new Date().toISOString(), openedCardIds: readonly string[] = [], flaggedCardIds: readonly string[] = []): FlashcardCheckpoint {
  if (!cards.some(card => card.id === cardId && card.deckId === deckId)) throw new Error(`Card ${cardId} does not belong to deck ${deckId}.`);
  return { deckId, currentCardId: cardId, contentSignature: signature, updatedAt, openedCardIds: [...new Set(openedCardIds)], flaggedCardIds: [...new Set(flaggedCardIds)] };
}

export type FlashcardNavigatorFilter = 'all' | 'unopened' | 'flagged';
export function toggleFlashcardId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
}
export function filterFlashcardIndices(cards: readonly FlashcardCard[], openedCardIds: readonly string[], flaggedCardIds: readonly string[], filter: FlashcardNavigatorFilter): number[] {
  const opened = new Set(openedCardIds);
  const flagged = new Set(flaggedCardIds);
  return cards.flatMap((card, index) => filter === 'all' || (filter === 'unopened' && !opened.has(card.id)) || (filter === 'flagged' && flagged.has(card.id)) ? [index] : []);
}

export function nextFlashcardIndex(index: number, count: number): number {
  return Math.min(Math.max(index, 0) + 1, Math.max(count - 1, 0));
}

export function previousFlashcardIndex(index: number, count: number): number {
  return Math.max(Math.min(index, Math.max(count - 1, 0)) - 1, 0);
}

import type { FlashcardCard } from './types';

export interface FlashcardCheckpoint {
  deckId: string;
  currentCardId: string;
  contentSignature: string;
  updatedAt: string;
}

export interface FlashcardProgressState {
  schemaVersion: 1;
  revision: string;
  checkpoints: Record<string, FlashcardCheckpoint>;
}

/** Exact ordered identity prevents a same-sized edited/reordered deck from resuming silently. */
export function flashcardContentSignature(cards: readonly FlashcardCard[]): string {
  return JSON.stringify(cards.map(card => [card.id, card.front, card.back, card.sources ?? null, card.reviewNote ?? null]));
}

export function validateFlashcardCheckpoint(checkpoint: FlashcardCheckpoint, deckId: string, cards: readonly FlashcardCard[]): 'valid' | 'missing-card' | 'changed-content' {
  if (checkpoint.deckId !== deckId || !cards.some(card => card.id === checkpoint.currentCardId)) return 'missing-card';
  return checkpoint.contentSignature === flashcardContentSignature(cards) ? 'valid' : 'changed-content';
}

export function initialFlashcardCardId(cards: readonly FlashcardCard[]): string | undefined {
  return cards[0]?.id;
}

export type FlashcardLaunch =
  | { kind: 'empty' }
  | { kind: 'start'; cardId: string }
  | { kind: 'resume'; cardId: string; index: number }
  | { kind: 'restart-required'; reason: 'missing-card' | 'changed-content' };

export function resolveFlashcardLaunch(deckId: string, cards: readonly FlashcardCard[], checkpoint?: FlashcardCheckpoint, restart = false): FlashcardLaunch {
  if (!cards.length) return { kind: 'empty' };
  if (!checkpoint || restart) return { kind: 'start', cardId: cards[0].id };
  const status = validateFlashcardCheckpoint(checkpoint, deckId, cards);
  if (status !== 'valid') return { kind: 'restart-required', reason: status };
  return { kind: 'resume', cardId: checkpoint.currentCardId, index: cards.findIndex(card => card.id === checkpoint.currentCardId) };
}

export function checkpointForCard(deckId: string, cards: readonly FlashcardCard[], cardId: string, updatedAt = new Date().toISOString()): FlashcardCheckpoint {
  if (!cards.some(card => card.id === cardId)) throw new Error(`Card ${cardId} does not belong to deck ${deckId}.`);
  return { deckId, currentCardId: cardId, contentSignature: flashcardContentSignature(cards), updatedAt };
}

export function nextFlashcardIndex(index: number, count: number): number {
  return Math.min(Math.max(index, 0) + 1, Math.max(count - 1, 0));
}

export function previousFlashcardIndex(index: number, count: number): number {
  return Math.max(Math.min(index, Math.max(count - 1, 0)) - 1, 0);
}

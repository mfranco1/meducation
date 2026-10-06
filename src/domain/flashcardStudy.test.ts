import { describe, expect, it } from 'vitest';
import { checkpointForCard, filterFlashcardIndices, flashcardContentSignature, nextFlashcardIndex, previousFlashcardIndex, resolveFlashcardLaunch, toggleFlashcardId, validateFlashcardCheckpoint } from './flashcardStudy';
import type { FlashcardCard } from './types';

const cards: FlashcardCard[] = [
  { id: 'f1', deckId: 'd1', front: 'Front one', back: 'Back one' },
  { id: 'f2', deckId: 'd1', front: 'Front two', back: 'Back two' },
];

describe('flashcard study rules', () => {
  it('starts, resumes by stable card ID, or requests restart after content changes', async () => {
    const signature = await flashcardContentSignature(cards);
    expect(resolveFlashcardLaunch('d1', cards, signature)).toEqual({ kind: 'start', cardId: 'f1' });
    const checkpoint = checkpointForCard('d1', cards, 'f2', signature, '2026-10-06T00:00:00.000Z');
    expect(resolveFlashcardLaunch('d1', cards, signature, checkpoint)).toEqual({ kind: 'resume', cardId: 'f2', index: 1 });
    const changed = [{ ...cards[0], front: 'Changed' }, cards[1]];
    expect(resolveFlashcardLaunch('d1', changed, await flashcardContentSignature(changed), checkpoint)).toEqual({ kind: 'restart-required', reason: 'changed-content' });
    expect(resolveFlashcardLaunch('d1', [cards[0]], await flashcardContentSignature([cards[0]]), checkpoint)).toEqual({ kind: 'restart-required', reason: 'missing-card' });
    expect(resolveFlashcardLaunch('d1', cards, signature, checkpoint, true)).toEqual({ kind: 'start', cardId: 'f1' });
    expect(resolveFlashcardLaunch('d1', [], signature)).toEqual({ kind: 'empty' });
  });

  it('signs ordered study content and validates checkpoint ownership', async () => {
    const signature = await flashcardContentSignature(cards);
    const checkpoint = checkpointForCard('d1', cards, 'f1', signature);
    expect(validateFlashcardCheckpoint(checkpoint, 'd1', cards, signature)).toBe('valid');
    expect(validateFlashcardCheckpoint(checkpoint, 'd2', cards, signature)).toBe('missing-card');
    expect(await flashcardContentSignature([...cards].reverse())).not.toBe(signature);
    expect(() => checkpointForCard('d1', cards, 'f404', signature)).toThrow('does not belong');
    expect(() => checkpointForCard('d2', cards, 'f1', signature)).toThrow('does not belong');
  });

  it('stores only a bounded digest and accepts matching early-v1 checkpoints', async () => {
    const longCards = [{ ...cards[0], front: 'Long medical content '.repeat(20_000) }];
    const signature = await flashcardContentSignature(longCards);
    expect(signature).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(JSON.stringify(checkpointForCard('d1', longCards, 'f1', signature)).length).toBeLessThan(250);
    const oldSignature = JSON.stringify(longCards.map(card => [card.id, card.front, card.back, null, null]));
    const legacy = checkpointForCard('d1', longCards, 'f1', oldSignature);
    expect(validateFlashcardCheckpoint(legacy, 'd1', longCards, signature)).toBe('valid');
    const changed = [{ ...longCards[0], back: 'Changed' }];
    expect(validateFlashcardCheckpoint(legacy, 'd1', changed, await flashcardContentSignature(changed))).toBe('changed-content');
  });

  it('clamps previous and next navigation at both ends', () => {
    expect(previousFlashcardIndex(0, 2)).toBe(0);
    expect(nextFlashcardIndex(0, 2)).toBe(1);
    expect(nextFlashcardIndex(1, 2)).toBe(1);
    expect(previousFlashcardIndex(7, 2)).toBe(0);
  });

  it('filters in canonical order and toggles opened and flagged IDs independently', () => {
    expect(filterFlashcardIndices(cards, ['f2'], ['f1'], 'unopened')).toEqual([0]);
    expect(filterFlashcardIndices(cards, ['f2'], ['f1'], 'flagged')).toEqual([0]);
    expect(filterFlashcardIndices(cards, [], [], 'all')).toEqual([0, 1]);
    expect(toggleFlashcardId(['f1'], 'f2')).toEqual(['f1', 'f2']);
    expect(toggleFlashcardId(['f1', 'f2'], 'f1')).toEqual(['f2']);
  });
});

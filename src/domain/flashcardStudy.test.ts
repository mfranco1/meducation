import { describe, expect, it } from 'vitest';
import { checkpointForCard, flashcardContentSignature, nextFlashcardIndex, previousFlashcardIndex, resolveFlashcardLaunch, validateFlashcardCheckpoint } from './flashcardStudy';
import type { FlashcardCard } from './types';

const cards: FlashcardCard[] = [
  { id: 'f1', deckId: 'd1', front: 'Front one', back: 'Back one' },
  { id: 'f2', deckId: 'd1', front: 'Front two', back: 'Back two' },
];

describe('flashcard study rules', () => {
  it('starts, resumes by stable card ID, or requests restart after content changes', () => {
    expect(resolveFlashcardLaunch('d1', cards)).toEqual({ kind: 'start', cardId: 'f1' });
    const checkpoint = checkpointForCard('d1', cards, 'f2', '2026-10-06T00:00:00.000Z');
    expect(resolveFlashcardLaunch('d1', cards, checkpoint)).toEqual({ kind: 'resume', cardId: 'f2', index: 1 });
    expect(resolveFlashcardLaunch('d1', [{ ...cards[0], front: 'Changed' }, cards[1]], checkpoint)).toEqual({ kind: 'restart-required', reason: 'changed-content' });
    expect(resolveFlashcardLaunch('d1', [cards[0]], checkpoint)).toEqual({ kind: 'restart-required', reason: 'missing-card' });
    expect(resolveFlashcardLaunch('d1', cards, checkpoint, true)).toEqual({ kind: 'start', cardId: 'f1' });
    expect(resolveFlashcardLaunch('d1', [])).toEqual({ kind: 'empty' });
  });

  it('signs ordered study content and validates checkpoint ownership', () => {
    const checkpoint = checkpointForCard('d1', cards, 'f1');
    expect(validateFlashcardCheckpoint(checkpoint, 'd1', cards)).toBe('valid');
    expect(validateFlashcardCheckpoint(checkpoint, 'd2', cards)).toBe('missing-card');
    expect(flashcardContentSignature([...cards].reverse())).not.toBe(flashcardContentSignature(cards));
    expect(() => checkpointForCard('d1', cards, 'f404')).toThrow('does not belong');
  });

  it('clamps previous and next navigation at both ends', () => {
    expect(previousFlashcardIndex(0, 2)).toBe(0);
    expect(nextFlashcardIndex(0, 2)).toBe(1);
    expect(nextFlashcardIndex(1, 2)).toBe(1);
    expect(previousFlashcardIndex(7, 2)).toBe(0);
  });
});

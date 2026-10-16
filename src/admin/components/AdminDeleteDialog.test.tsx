import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/question-bank.json';
import type { StoredFlashcardBank, StoredQuestionBank } from '../../content/schema/schema';
import { AdminDeleteDialog, deletionReview } from './AdminDeleteDialog';
import flashcards from '../../../tests/fixtures/flashcard-bank-contract.json';

it('requires a current review and disables repeated confirmation while saving', () => {
  const bank = fixture as StoredQuestionBank;
  const props = {
    bank,
    flashcardBank: { schemaVersion: 2 as const, decks: [], cards: [] },
    request: { selection: { kind: 'quiz' as const, id: 'q1' }, label: 'First quiz', reviewKey: 'original' },
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  };
  const { rerender } = render(<AdminDeleteDialog {...props} currentReviewKey="changed" />);
  expect(screen.getByRole('button', { name: 'Save quiz deletion' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('content changed');
  rerender(<AdminDeleteDialog {...props} currentReviewKey="original" />);
  fireEvent.click(screen.getByRole('button', { name: 'Save quiz deletion' }));
  expect(props.onConfirm).toHaveBeenCalledTimes(1);
  rerender(<AdminDeleteDialog {...props} currentReviewKey="original" busy />);
  expect(screen.getByRole('button', { name: 'Save quiz deletion' })).toBeDisabled();
});

it('includes the complete shared-subject cascade and isolates selected leaf records', () => {
  const bank = fixture as StoredQuestionBank;
  const cards = flashcards.bank as StoredFlashcardBank;
  const original = JSON.stringify([bank, cards]);
  const review = deletionReview(bank, cards, { kind: 'subject', id: 's1' });
  expect(review.records).toContain('Subject · Subject One · s1');
  expect(review.records).not.toContain('Subject · Subject Two · s2');
  for (const deck of cards.decks.filter(row => row.subjectId === 's1')) {
    expect(review.records).toContain(`Deck · ${deck.name} · ${deck.id}`);
    for (const card of cards.cards.filter(row => row.deckId === deck.id)) expect(review.records).toContain(`Card · ${card.id}`);
  }
  const ids = bank.questions.slice(0, 2).map(row => row.id);
  expect(deletionReview(bank, cards, { kind: 'question' }, ids).records).toEqual(ids.map(id => `Item · ${id}`));
  expect(JSON.stringify([bank, cards])).toBe(original);
});

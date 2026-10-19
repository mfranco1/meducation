import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/question-bank.json';
import type { StoredFlashcardBank, StoredQuestionBank } from '../../content/schema/schema';
import { AdminDeleteDialog, deletionReview } from './AdminDeleteDialog';
import flashcards from '../../../tests/fixtures/flashcard-bank-contract.json';

it('shows the impact counts, confirms once and cannot be repeated while deleting', () => {
  const bank = fixture as StoredQuestionBank;
  const props = {
    bank,
    flashcardBank: { schemaVersion: 4 as const, decks: [], cards: [] },
    request: { selection: { kind: 'quiz' as const, id: 'q1' }, label: 'First quiz' },
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  };
  const { rerender } = render(<AdminDeleteDialog {...props} />);
  expect(screen.getByText(/Affected: 0 subjects · 0 topics · 1 quizzes · 2 items/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Delete quiz' }));
  expect(props.onConfirm).toHaveBeenCalledTimes(1);
  rerender(<AdminDeleteDialog {...props} busy />);
  expect(screen.getByRole('button', { name: 'Delete quiz' })).toBeDisabled();
  rerender(<AdminDeleteDialog {...props} error="This record changed on the server." />);
  expect(screen.getByRole('alert')).toHaveTextContent('changed on the server');
});

it('includes the complete shared-subject cascade and isolates selected leaf records', () => {
  const bank = fixture as StoredQuestionBank;
  const cards = flashcards.bank as StoredFlashcardBank;
  const original = JSON.stringify([bank, cards]);
  const review = deletionReview(bank, cards, { kind: 'subject', id: 's1' });
  expect(review.records).toContain('Subject · Subject One · s1');
  expect(review.records).not.toContain('Subject · Subject Two · s2');
  expect(review.records).toContain('Topic · Topic 1 · t1');
  expect(review.records).not.toContain('Topic · Topic 2 · t2');
  for (const deck of cards.decks.filter(row => row.topicId === 't1')) {
    expect(review.records).toContain(`Deck · ${deck.name} · ${deck.id}`);
    for (const card of cards.cards.filter(row => row.deckId === deck.id)) expect(review.records).toContain(`Card · ${card.id}`);
  }
  const ids = bank.questions.slice(0, 2).map(row => row.id);
  expect(deletionReview(bank, cards, { kind: 'question' }, ids).records).toEqual(ids.map(id => `Item · ${id}`));
  expect(JSON.stringify([bank, cards])).toBe(original);
});

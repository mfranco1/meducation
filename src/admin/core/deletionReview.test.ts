import { expect, it } from 'vitest';
import questions from '../../../tests/fixtures/question-bank.json';
import flashcards from '../../../tests/fixtures/flashcard-bank-contract.json';
import type { StoredFlashcardBank, StoredQuestionBank } from '../../content/schema/schema';
import { deletionReview } from './deletionReview';

it('includes the complete shared-subject cascade and isolates selected leaf records', () => {
  const bank = questions as StoredQuestionBank;
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

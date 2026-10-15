import quizzes from '../../tests/fixtures/question-bank.json';
import flashcards from '../../tests/fixtures/flashcard-bank-contract.json';
import emptyFlashcards from '../../tests/fixtures/empty-flashcard-bank.json';
import type { StoredFlashcardBank, StoredQuestionBank } from '../content/schema/schema';

// Synthetic inputs only. Tests must never obtain content from a runtime bank adapter.
export const storedQuestionBank = quizzes as unknown as StoredQuestionBank;
export const storedFlashcardBank = flashcards.bank as StoredFlashcardBank;
export const emptyFlashcardBank = emptyFlashcards as StoredFlashcardBank;

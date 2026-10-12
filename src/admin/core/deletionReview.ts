import type { StoredFlashcardBank, StoredQuestionBank } from '../../content/schema/schema';

export interface DeletionTarget {
  kind: 'subject' | 'quiz' | 'question' | 'deck' | 'card';
  id?: string;
  parentId?: string;
}

/** Full impact is computed before paging; display filtering never changes the batch. */
export function deletionReview(bank: StoredQuestionBank, flashcards: StoredFlashcardBank, target: DeletionTarget, ids?: readonly string[]) {
  const selected = new Set(ids ?? (target.id ? [target.id] : []));
  const subjects = target.kind === 'subject' ? bank.subjects.filter(row => selected.has(row.id)) : [];
  const subjectIds = new Set(subjects.map(row => row.id));
  const quizzes = bank.quizzes.filter(row => target.kind === 'quiz' ? selected.has(row.id) : subjectIds.has(row.subjectId));
  const quizIds = new Set(quizzes.map(row => row.id));
  const questions = bank.questions.filter(row => target.kind === 'question' ? selected.has(row.id) : quizIds.has(row.quizId));
  const decks = flashcards.decks.filter(row => target.kind === 'deck' ? selected.has(row.id) : subjectIds.has(row.subjectId));
  const deckIds = new Set(decks.map(row => row.id));
  const cards = flashcards.cards.filter(row => target.kind === 'card' ? selected.has(row.id) : deckIds.has(row.deckId));
  const records = [
    ...subjects.map(row => `Subject · ${row.name} · ${row.id}`),
    ...quizzes.map(row => `Quiz · ${row.name} · ${row.id}`),
    ...questions.map(row => `Item · ${row.id}`),
    ...decks.map(row => `Deck · ${row.name} · ${row.id}`),
    ...cards.map(row => `Card · ${row.id}`),
  ];
  return { records, summary: `${subjects.length} subjects · ${quizzes.length} quizzes · ${questions.length} items · ${decks.length} decks · ${cards.length} cards` };
}

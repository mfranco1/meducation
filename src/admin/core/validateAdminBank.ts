import type { Question, Quiz } from '../../domain/types';
import type { StoredFlashcardBank, StoredQuestionBank } from '../../content/schema';
import { validateQuestionMarkdown } from '../../content/markdownValidation';
import { validateQuestionBank, validateStoredQuestionBank, type ValidationIssue } from '../../content/validate';
import { storedFlashcardBank } from '../../content/flashcardBank';

export function validateAdminBank(bank: StoredQuestionBank, flashcards: StoredFlashcardBank = storedFlashcardBank): ValidationIssue[] {
  const questionCount = new Map<string, number>();
  bank.questions.forEach(question => questionCount.set(question.quizId, (questionCount.get(question.quizId) ?? 0) + 1));
  const quizzes: Quiz[] = bank.quizzes.map(quiz => ({ ...quiz, questionCount: questionCount.get(quiz.id) ?? 0 }));
  const questions: Question[] = bank.questions.map(question => ({ ...question, metadata: question.metadata ?? {} }));
  const subjectIds = new Set(bank.subjects.map(subject => subject.id));
  const danglingFlashcardSubjects = new Set(flashcards.decks.map(deck => deck.subjectId).filter(id => !subjectIds.has(id)));
  return [
    ...validateStoredQuestionBank(bank),
    ...validateQuestionBank(bank.subjects, quizzes, questions),
    ...validateQuestionMarkdown(questions),
    ...[...danglingFlashcardSubjects].map(subjectId => ({ level: 'error' as const, message: `Subject ${subjectId} is still referenced by flashcard decks; move or remove those decks first.` })),
  ];
}

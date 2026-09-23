import type { Question, Quiz } from '../../domain/types';
import type { StoredQuestionBank } from '../../content/schema';
import { validateQuestionMarkdown } from '../../content/markdownValidation';
import { validateQuestionBank, validateStoredQuestionBank, type ValidationIssue } from '../../content/validate';

export function validateAdminBank(bank: StoredQuestionBank): ValidationIssue[] {
  const questionCount = new Map<string, number>();
  bank.questions.forEach(question => questionCount.set(question.quizId, (questionCount.get(question.quizId) ?? 0) + 1));
  const quizzes: Quiz[] = bank.quizzes.map(quiz => ({ ...quiz, questionCount: questionCount.get(quiz.id) ?? 0 }));
  const questions: Question[] = bank.questions.map(question => ({ ...question, metadata: question.metadata ?? {} }));
  return [
    ...validateStoredQuestionBank(bank),
    ...validateQuestionBank(bank.subjects, quizzes, questions),
    ...validateQuestionMarkdown(questions),
  ];
}

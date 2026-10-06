import type { Attempt, CompletedAttempt, Quiz, Subject } from '../../../domain/types';

export type QuizSessionView =
  | { page: 'dashboard' }
  | { page: 'flashcards' }
  | { page: 'subject'; subject: Subject }
  | { page: 'quiz'; quiz: Quiz; attempt: Attempt; index: number }
  | { page: 'quiz-browse'; quiz: Quiz; index: number }
  | { page: 'quiz-review'; quiz: Quiz; attempt: CompletedAttempt; index: number }
  | { page: 'results'; quiz: Quiz; attempt: CompletedAttempt };

export function subjectForQuiz(subjects: Subject[], quiz: Quiz): Subject {
  const subject = subjects.find(candidate => candidate.id === quiz.subjectId);
  if (!subject) throw new Error(`Quiz ${quiz.id} references an unknown subject`);
  return subject;
}

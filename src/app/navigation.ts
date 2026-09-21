import type { Attempt, CompletedAttempt, Quiz, Subject } from '../domain/types';

export type View =
  | { page: 'dashboard' }
  | { page: 'subject'; subject: Subject }
  | { page: 'quiz'; quiz: Quiz; attempt: Attempt; index: number }
  | { page: 'results'; quiz: Quiz; attempt: CompletedAttempt };

export function subjectForQuiz(subjects: Subject[], quiz: Quiz): Subject {
  const subject = subjects.find(candidate => candidate.id === quiz.subjectId);
  if (!subject) throw new Error(`Quiz ${quiz.id} references an unknown subject`);
  return subject;
}

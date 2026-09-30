import type { Attempt, CompletedAttempt, Quiz, Subject } from '../domain/types';

export type View =
  | { page: 'dashboard' }
  | { page: 'subject'; subject: Subject }
  | { page: 'quiz'; quiz: Quiz; attempt: Attempt; index: number }
  | { page: 'quiz-browse'; quiz: Quiz; index: number }
  | { page: 'results'; quiz: Quiz; attempt: CompletedAttempt };

export function screenIdentity(view: View): string {
  switch (view.page) {
    case 'dashboard': return 'dashboard';
    case 'subject': return `subject:${view.subject.id}`;
    case 'quiz': return `quiz:${view.quiz.id}:${view.attempt.id}`;
    case 'quiz-browse': return `quiz-browse:${view.quiz.id}`;
    case 'results': return `results:${view.attempt.id}`;
  }
}

export function subjectForQuiz(subjects: Subject[], quiz: Quiz): Subject {
  const subject = subjects.find(candidate => candidate.id === quiz.subjectId);
  if (!subject) throw new Error(`Quiz ${quiz.id} references an unknown subject`);
  return subject;
}

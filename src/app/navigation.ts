import type { Attempt, CompletedAttempt, Quiz, Subject } from '../domain/types';
import type { FlashcardDeckSummary } from '../content/flashcardApiDecoders';

export type FlashcardsView =
  | { page: 'flashcards' }
  | { page: 'flashcards-subject'; subject: Subject }
  | { page: 'flashcards-study'; subject: Subject; deck: FlashcardDeckSummary; index: number; revealed: boolean };

export type QuizSessionView =
  | { page: 'dashboard' }
  | { page: 'flashcards' }
  | { page: 'subject'; subject: Subject }
  | { page: 'quiz'; quiz: Quiz; attempt: Attempt; index: number }
  | { page: 'quiz-browse'; quiz: Quiz; index: number }
  | { page: 'quiz-review'; quiz: Quiz; attempt: CompletedAttempt; index: number }
  | { page: 'results'; quiz: Quiz; attempt: CompletedAttempt };

export type View = QuizSessionView | FlashcardsView;

export function screenIdentity(view: View): string {
  switch (view.page) {
    case 'dashboard': return 'dashboard';
    case 'flashcards': return 'flashcards';
    case 'flashcards-subject': return `flashcards-subject:${view.subject.id}`;
    case 'flashcards-study': return `flashcards-study:${view.deck.id}`;
    case 'subject': return `subject:${view.subject.id}`;
    case 'quiz': return `quiz:${view.quiz.id}:${view.attempt.id}`;
    case 'quiz-browse': return `quiz-browse:${view.quiz.id}`;
    case 'quiz-review': return `quiz-review:${view.quiz.id}:${view.attempt.id}`;
    case 'results': return `results:${view.attempt.id}`;
  }
}

export function subjectForQuiz(subjects: Subject[], quiz: Quiz): Subject {
  const subject = subjects.find(candidate => candidate.id === quiz.subjectId);
  if (!subject) throw new Error(`Quiz ${quiz.id} references an unknown subject`);
  return subject;
}

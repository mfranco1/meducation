import type { QuizSessionView } from '../features/quizzes/session/navigation';
import type { FlashcardsView } from '../features/flashcards/session/navigation';

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

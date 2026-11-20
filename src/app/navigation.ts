import { MIXED_TEST_ID, subjectTestId } from '../domain/generatedTests';
import type { QuizSessionView } from '../features/quizzes/session/navigation';
import type { FlashcardsView } from '../features/flashcards/session/navigation';

export type View = QuizSessionView | FlashcardsView;

export function screenIdentity(view: View): string {
  switch (view.page) {
    case 'dashboard':
      return 'dashboard';
    case 'flashcards':
      return 'flashcards';
    case 'flashcards-subject':
      return `flashcards-subject:${view.subject.id}`;
    case 'flashcards-study':
      return `flashcards-study:${view.deck.id}`;
    case 'subject':
      return `subject:${view.subject.id}`;
    case 'quiz':
      return `quiz:${view.quiz.id}:${view.attempt.id}`;
    case 'quiz-browse':
      return `quiz-browse:${view.quiz.id}`;
    case 'quiz-review':
      return `quiz-review:${view.quiz.id}:${view.attempt.id}`;
    case 'results':
      return `results:${view.attempt.id}`;
  }
}

/** Subject tabs share a mounted frame while retaining separate navigation and toast scopes. */
export function presentationIdentity(view: View): string {
  return view.page === 'subject' || view.page === 'flashcards-subject'
    ? `subject-browse:${view.subject.id}`
    : screenIdentity(view);
}

/** A dashboard keeps its scroll position when the learner returns to it from one of its subjects. */
export function restoresScroll(fromScreenId: string, toScreenId: string): boolean {
  return (
    (toScreenId === 'dashboard' && fromScreenId.startsWith('subject:')) ||
    (toScreenId === 'flashcards' && fromScreenId.startsWith('flashcards-subject:'))
  );
}

export type Route =
  | { page: 'dashboard' }
  | { page: 'flashcards' }
  | { page: 'mixed-test' }
  | { page: 'subject'; subjectId: string; quizId?: string; subjectTest?: true }
  | { page: 'flashcards-subject'; subjectId: string; deckId?: string };

/** The address of a view. Study screens share their quiz's or deck's address. */
export function pathFor(view: View): string {
  const path = (...parts: string[]) => `/${parts.map(encodeURIComponent).join('/')}`;
  switch (view.page) {
    case 'dashboard':
      return '/';
    case 'flashcards':
      return '/flashcards';
    case 'subject':
      return path('quizzes', view.subject.id);
    case 'flashcards-subject':
      return path('flashcards', view.subject.id);
    case 'flashcards-study':
      return path('flashcards', view.subject.id, view.deck.id);
    case 'quiz':
    case 'quiz-browse':
    case 'quiz-review':
    case 'results':
      if (view.quiz.id === MIXED_TEST_ID) return path('quizzes', 'mixed-test');
      if (view.quiz.id === subjectTestId(view.quiz.subjectId)) return path('quizzes', view.quiz.subjectId, 'test');
      return path('quizzes', view.quiz.subjectId, view.quiz.id);
  }
}

/** Unknown addresses open the quiz dashboard. */
export function routeFor(path: string): Route {
  let parts: string[];
  try {
    parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { page: 'dashboard' };
  }
  const [section, subjectId, itemId, ...rest] = parts;
  if (rest.length > 0) return { page: 'dashboard' };
  if (section === 'flashcards') {
    if (!subjectId) return { page: 'flashcards' };
    return { page: 'flashcards-subject', subjectId, ...(itemId ? { deckId: itemId } : {}) };
  }
  if (section === 'quizzes' && subjectId === MIXED_TEST_ID && !itemId) return { page: 'mixed-test' };
  if (section === 'quizzes' && subjectId && itemId === 'test') return { page: 'subject', subjectId, subjectTest: true };
  if (section === 'quizzes' && subjectId) return { page: 'subject', subjectId, ...(itemId ? { quizId: itemId } : {}) };
  return { page: 'dashboard' };
}

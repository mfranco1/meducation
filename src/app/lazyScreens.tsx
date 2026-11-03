import { lazy } from 'react';
import { preloadMarkdownRenderer } from '../shared/ui/content/MarkdownContent';

const quizModule = () => import('../features/quizzes/screens/QuizScreen');
// Browse Answers is a development tool and is left out of production builds.
const browseModule = () => import('../features/quizzes/screens/QuizBrowseScreen');
const resultsModule = () => import('../features/quizzes/screens/ResultsScreen');
const reviewModule = () => import('../features/quizzes/screens/QuizReviewScreen');
const flashcardStudyModule = () => import('../features/flashcards/screens/FlashcardStudyScreen');

export const QuizScreen = lazy(async () => ({ default: (await quizModule()).QuizScreen }));
export const QuizBrowseScreen = import.meta.env.DEV
  ? lazy(async () => ({ default: (await browseModule()).QuizBrowseScreen }))
  : () => null;
export const ResultsScreen = lazy(async () => ({ default: (await resultsModule()).ResultsScreen }));
export const QuizReviewScreen = lazy(async () => ({ default: (await reviewModule()).QuizReviewScreen }));
export const FlashcardStudyScreen = lazy(async () => ({
  default: (await flashcardStudyModule()).FlashcardStudyScreen,
}));

// Start loading presentation beside the question request, without blocking it.
export const preloadQuizScreen = () => {
  void quizModule().catch(() => undefined);
  preloadMarkdownRenderer();
};
export const preloadBrowseScreen = () => {
  if (!import.meta.env.DEV) return;
  void browseModule().catch(() => undefined);
  preloadMarkdownRenderer();
};
export const preloadResultsScreen = () => {
  void resultsModule().catch(() => undefined);
};
export const preloadReviewScreen = () => {
  void reviewModule().catch(() => undefined);
  preloadMarkdownRenderer();
};
export const preloadFlashcardStudyScreen = () => {
  void flashcardStudyModule().catch(() => undefined);
  preloadMarkdownRenderer();
};

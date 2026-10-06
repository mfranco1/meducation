import { lazy } from 'react';

const quizModule = () => import('../features/quizzes/screens/QuizScreen');
const browseModule = () => import('../features/quizzes/screens/QuizBrowseScreen');
const resultsModule = () => import('../features/quizzes/screens/ResultsScreen');
const reviewModule = () => import('../features/quizzes/screens/QuizReviewScreen');
const flashcardStudyModule = () => import('../features/flashcards/screens/FlashcardStudyScreen');

export const QuizScreen = lazy(async () => ({ default: (await quizModule()).QuizScreen }));
export const QuizBrowseScreen = lazy(async () => ({ default: (await browseModule()).QuizBrowseScreen }));
export const ResultsScreen = lazy(async () => ({ default: (await resultsModule()).ResultsScreen }));
export const QuizReviewScreen = lazy(async () => ({ default: (await reviewModule()).QuizReviewScreen }));
export const FlashcardStudyScreen = lazy(async () => ({ default: (await flashcardStudyModule()).FlashcardStudyScreen }));

// Start loading presentation beside the question request, without blocking it.
export const preloadQuizScreen = () => { void quizModule().catch(() => undefined); };
export const preloadBrowseScreen = () => { void browseModule().catch(() => undefined); };
export const preloadResultsScreen = () => { void resultsModule().catch(() => undefined); };
export const preloadReviewScreen = () => { void reviewModule().catch(() => undefined); };
export const preloadFlashcardStudyScreen = () => { void flashcardStudyModule().catch(() => undefined); };

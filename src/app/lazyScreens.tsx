import { lazy } from 'react';

const quizModule = () => import('./screens/QuizScreen');
const browseModule = () => import('./screens/QuizBrowseScreen');
const resultsModule = () => import('./screens/ResultsScreen');

export const QuizScreen = lazy(async () => ({ default: (await quizModule()).QuizScreen }));
export const QuizBrowseScreen = lazy(async () => ({ default: (await browseModule()).QuizBrowseScreen }));
export const ResultsScreen = lazy(async () => ({ default: (await resultsModule()).ResultsScreen }));

// Start loading presentation beside the question request, without blocking it.
export const preloadQuizScreen = () => { void quizModule().catch(() => undefined); };
export const preloadBrowseScreen = () => { void browseModule().catch(() => undefined); };
export const preloadResultsScreen = () => { void resultsModule().catch(() => undefined); };

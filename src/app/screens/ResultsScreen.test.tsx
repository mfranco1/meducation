import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../theme';
import { ResultsScreen } from './ResultsScreen';
import type { CompletedAttempt, Quiz } from '../../domain/types';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', name: 'Quiz', questionCount: 3 };
const attemptFor = (correct: number, total: number, percentage: number): CompletedAttempt => ({
  id: 'attempt', quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: 'exam', startedAt: new Date(0).toISOString(), completedAt: new Date(1).toISOString(), responses: {},
  score: { correct, incorrect: total - correct, unanswered: 0, total, percentage, elapsedMs: 0 },
});
const renderResults = (attempt: CompletedAttempt) => render(<ThemeProvider theme={theme}><ResultsScreen quiz={quiz} attempt={attempt} questions={[]} onBack={() => {}} /></ThemeProvider>);

describe('perfect-test celebration', () => {
  it('celebrates an exact non-empty perfect score', () => {
    renderResults(attemptFor(3, 3, 100));
    expect(screen.getByRole('status')).toHaveTextContent('Perfect Test!');
  });

  it('does not celebrate rounded 100%, incomplete, or zero-question scores', () => {
    const { rerender } = renderResults(attemptFor(99, 100, 100));
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<ThemeProvider theme={theme}><ResultsScreen quiz={quiz} attempt={attemptFor(2, 3, 67)} questions={[]} onBack={() => {}} /></ThemeProvider>);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<ThemeProvider theme={theme}><ResultsScreen quiz={quiz} attempt={attemptFor(0, 0, 100)} questions={[]} onBack={() => {}} /></ThemeProvider>);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

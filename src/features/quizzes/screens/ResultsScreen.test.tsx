import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../../shared/theme';
import { ResultsScreen } from './ResultsScreen';
import type { CompletedAttempt, Quiz } from '../../../domain/types';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', name: 'Quiz', questionCount: 3 };
const attemptFor = (correct: number, total: number, percentage: number): CompletedAttempt => ({
  id: 'attempt', quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: 'exam', elapsedMs: 0, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, startedAt: new Date(0).toISOString(), completedAt: new Date(1).toISOString(), responses: {},
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

describe('results score hero', () => {
  it('shows the score ring in place of the check and preserves the result summary and back action', () => {
    const onBack = vi.fn();
    render(<ThemeProvider theme={theme}><ResultsScreen quiz={quiz} attempt={attemptFor(2, 3, 67)} questions={[]} onBack={onBack} /></ThemeProvider>);
    expect(screen.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
    expect(screen.getByText('Final score: 67%.')).toBeInTheDocument();
    expect(screen.getByText('2 correct · 1 incorrect · 0 unanswered')).toBeVisible();
    expect(screen.getByText('2 correct · 1 incorrect · 0 unanswered')).toHaveStyle({ marginTop: '8px' });
    expect(screen.getByText('Total time')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to quizzes' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('offers review only for an Exam Mode result', () => {
    const onReview = vi.fn();
    render(<ThemeProvider theme={theme}><ResultsScreen quiz={quiz} attempt={attemptFor(2, 3, 67)} questions={[]} onBack={() => {}} onReview={onReview} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Review results' }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Back to quizzes' })).toBeVisible();
  });

  it('does not offer review for Fast Feedback results', () => {
    render(<ThemeProvider theme={theme}><ResultsScreen quiz={quiz} attempt={{ ...attemptFor(2, 3, 67), feedbackMode: 'immediate' }} questions={[]} onBack={() => {}} onReview={() => {}} /></ThemeProvider>);
    expect(screen.queryByRole('button', { name: 'Review results' })).toBeNull();
  });
});

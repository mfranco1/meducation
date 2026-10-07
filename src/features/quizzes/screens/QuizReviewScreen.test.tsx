import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompletedAttempt, Question, Quiz } from '../../../domain/types';
import { theme } from '../../../shared/theme';
import { QuizReviewScreen } from './QuizReviewScreen';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', name: 'Quiz', questionCount: 2 };
const questions: Question[] = [
  { id: 'q1', quizId: quiz.id, stem: 'First question', choices: [{ id: 'A', text: 'Wrong' }, { id: 'B', text: 'Right' }], verifiedAnswer: 'B', rationale: 'Why B is right.', metadata: {} },
  { id: 'q2', quizId: quiz.id, stem: 'Second question', choices: [{ id: 'A', text: 'Answer' }], verifiedAnswer: 'A', rationale: 'Why A is right.', metadata: {} },
];
const attempt: CompletedAttempt = {
  id: 'attempt', quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: 'exam', elapsedMs: 0, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, startedAt: 'now', completedAt: 'later',
  responses: { q1: { questionId: 'q1', selectedChoiceId: 'A', flagged: true, locked: false, timeMs: 0 } },
  score: { correct: 0, incorrect: 1, unanswered: 1, total: 2, percentage: 0, elapsedMs: 4_000 },
};

describe('QuizReviewScreen', () => {
  it('reveals the submitted incorrect choice, correct answer, and explanation without answer controls', () => {
    const onExit = vi.fn();
    render(<ThemeProvider theme={theme}><QuizReviewScreen quiz={quiz} attempt={attempt} index={0} questions={questions} onNavigate={() => {}} onRequestExit={onExit} /></ThemeProvider>);
    expect(screen.getByText('Incorrect')).toBeVisible();
    expect(screen.getByRole('listitem', { name: /Your answer/ })).toBeVisible();
    expect(screen.queryByText(/Your answer/)).toBeNull();
    expect(screen.getByRole('listitem', { name: /Correct answer/ })).toBeVisible();
    expect(screen.queryByText(/Correct answer/)).toBeNull();
    expect(screen.getByText('Why B is right.')).toBeVisible();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('img', { name: 'Flagged question' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Leave review' }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('labels unanswered responses and keeps the final duration static', () => {
    render(<ThemeProvider theme={theme}><QuizReviewScreen quiz={quiz} attempt={attempt} index={1} questions={questions} onNavigate={() => {}} onRequestExit={() => {}} /></ThemeProvider>);
    expect(screen.getByText('Unanswered')).toBeVisible();
    expect(screen.getByLabelText('Final time: 00:04')).toBeVisible();
    expect(screen.getByRole('listitem', { name: /Correct answer/ })).toBeVisible();
    expect(screen.queryByText(/Correct answer/)).toBeNull();
    expect(screen.queryByText(/Your answer/)).toBeNull();
  });

  it('shows All, Wrong, and Flagged filters and retains the chosen filter during navigation', () => {
    const onNavigate = vi.fn();
    render(<ThemeProvider theme={theme}><QuizReviewScreen quiz={quiz} attempt={attempt} index={0} questions={questions} onNavigate={onNavigate} onRequestExit={() => {}} /></ThemeProvider>);
    const navigator = screen.getAllByLabelText('Question navigator')[0];
    expect(screen.getByRole('button', { name: 'All questions, 2' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Wrong questions, 1' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Flagged questions, 1' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Unanswered questions/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Wrong questions, 1' }));
    expect(within(navigator).getByRole('button', { name: 'Question 1, answered incorrectly, flagged, current question' })).toBeVisible();
    expect(within(navigator).queryByRole('button', { name: /Question 2/ })).toBeNull();
    fireEvent.click(within(navigator).getByRole('button', { name: 'Question 1, answered incorrectly, flagged, current question' }));
    expect(onNavigate).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: 'Wrong questions, 1' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Flagged questions, 1' }));
    expect(within(navigator).getByRole('button', { name: /Question 1, answered incorrectly, flagged/ })).toBeVisible();
  });

  it('shows a clear empty state for the Wrong filter', () => {
    const correctAttempt = { ...attempt, responses: { q1: { ...attempt.responses.q1, selectedChoiceId: 'B' } } };
    render(<ThemeProvider theme={theme}><QuizReviewScreen quiz={quiz} attempt={correctAttempt} index={0} questions={questions} onNavigate={() => {}} onRequestExit={() => {}} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Wrong questions, 0' }));
    expect(screen.getByText('No wrong answers.')).toBeVisible();
  });
});

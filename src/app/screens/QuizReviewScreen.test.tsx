import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompletedAttempt, Question, Quiz } from '../../domain/types';
import { theme } from '../theme';
import { QuizReviewScreen } from './QuizReviewScreen';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', name: 'Quiz', questionCount: 2 };
const questions: Question[] = [
  { id: 'q1', quizId: quiz.id, stem: 'First question', choices: [{ id: 'A', text: 'Wrong' }, { id: 'B', text: 'Right' }], verifiedAnswer: 'B', rationale: 'Why B is right.', metadata: {} },
  { id: 'q2', quizId: quiz.id, stem: 'Second question', choices: [{ id: 'A', text: 'Answer' }], verifiedAnswer: 'A', rationale: 'Why A is right.', metadata: {} },
];
const attempt: CompletedAttempt = {
  id: 'attempt', quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: 'exam', startedAt: 'now', completedAt: 'later',
  responses: { q1: { questionId: 'q1', selectedChoiceId: 'A', flagged: false, locked: false, timeMs: 0 } },
  score: { correct: 0, incorrect: 1, unanswered: 1, total: 2, percentage: 0, elapsedMs: 4_000 },
};

describe('QuizReviewScreen', () => {
  it('reveals the submitted incorrect choice, correct answer, and explanation without answer controls', () => {
    const onExit = vi.fn();
    render(<ThemeProvider theme={theme}><QuizReviewScreen quiz={quiz} attempt={attempt} index={0} questions={questions} onNavigate={() => {}} onRequestExit={onExit} /></ThemeProvider>);
    expect(screen.getByText('Incorrect')).toBeVisible();
    expect(screen.getByText('Your answer')).toBeVisible();
    expect(screen.getByText('Correct answer')).toBeVisible();
    expect(screen.getByText('Why B is right.')).toBeVisible();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave review' }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('labels unanswered responses and keeps the final duration static', () => {
    render(<ThemeProvider theme={theme}><QuizReviewScreen quiz={quiz} attempt={attempt} index={1} questions={questions} onNavigate={() => {}} onRequestExit={() => {}} /></ThemeProvider>);
    expect(screen.getByText('Unanswered')).toBeVisible();
    expect(screen.getByText('Final time: 00:04')).toBeVisible();
  });
});

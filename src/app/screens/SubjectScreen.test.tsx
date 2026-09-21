import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Attempt, FeedbackMode, Quiz } from '../../domain/types';
import { theme } from '../theme';
import { SubjectScreen, type QuizProgress } from './SubjectScreen';

const subject = { id: 'subject', name: 'Biochemistry', description: '', accent: '#b9511b' };
const quiz = { id: 'quiz', subjectId: subject.id, name: 'Practice test 1', questionCount: 10 };
const activeAttempt: Attempt = {
  id: 'attempt',
  quizId: quiz.id,
  subjectId: subject.id,
  feedbackMode: 'exam',
  startedAt: '2026-09-21T00:00:00.000Z',
  responses: {},
};

function renderSubject(progress: Partial<QuizProgress>) {
  const onResumeQuiz = vi.fn();
  const onStartQuiz = vi.fn<(quiz: Quiz, mode: FeedbackMode) => void>();
  render(<ThemeProvider theme={theme}><SubjectScreen
    subject={subject}
    progress={[{ quiz, completionCount: 0, ...progress }]}
    onBack={() => {}}
    onResumeQuiz={onResumeQuiz}
    onStartQuiz={onStartQuiz}
  /></ThemeProvider>);
  return { onResumeQuiz, onStartQuiz };
}

describe('subject quiz action', () => {
  it('labels a never-started quiz as Start quiz', () => {
    renderSubject({});

    expect(screen.getByRole('button', { name: 'Start quiz' })).toBeVisible();
  });

  it('labels a completed quiz as Retake quiz', () => {
    renderSubject({ completionCount: 1 });

    expect(screen.getByRole('button', { name: 'Retake quiz' })).toBeVisible();
  });

  it('prioritizes Resume test when a saved attempt exists', () => {
    const { onResumeQuiz } = renderSubject({ active: activeAttempt, completionCount: 1, currentQuestion: 3 });

    expect(screen.getByRole('button', { name: 'Resume quiz' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retake quiz' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume quiz' }));
    expect(onResumeQuiz).toHaveBeenCalledWith(quiz);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    [{}, 'Start quiz'],
    [{ completionCount: 1 }, 'Retake quiz'],
  ])('opens setup for %s', (progress, actionLabel) => {
    renderSubject(progress);

    fireEvent.click(screen.getByRole('button', { name: actionLabel }));

    const dialog = screen.getByRole('dialog', { name: quiz.name });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText(quiz.name)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Begin quiz' })).toBeVisible();
  });

  it('starts a selected mode and resets it when setup is reopened', () => {
    const { onStartQuiz } = renderSubject({});

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exam Mode' }));
    expect(screen.getByText('Answers remain hidden until you finish and submit the entire test.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Begin quiz' }));
    expect(onStartQuiz).toHaveBeenCalledWith(quiz, 'exam');

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz' }));
    expect(screen.getByText('Selecting an answer locks it and shows the explanation right away.')).toBeVisible();
  });

  it('dismisses setup without starting a quiz', () => {
    const { onStartQuiz } = renderSubject({});

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close quiz setup' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onStartQuiz).not.toHaveBeenCalled();
  });
});

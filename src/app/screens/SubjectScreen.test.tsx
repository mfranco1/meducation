import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Attempt } from '../../domain/types';
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
  return render(<ThemeProvider theme={theme}><SubjectScreen
    subject={subject}
    progress={[{ quiz, completionCount: 0, ...progress }]}
    onBack={() => {}}
    onOpenQuiz={() => {}}
  /></ThemeProvider>);
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
    renderSubject({ active: activeAttempt, completionCount: 1, currentQuestion: 3 });

    expect(screen.getByRole('button', { name: 'Resume test' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retake quiz' })).toBeNull();
  });
});

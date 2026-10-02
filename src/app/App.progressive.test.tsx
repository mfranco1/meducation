import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompletedAttempt } from '../domain/types';
import { LocalAttemptRepository } from '../persistence/localRepository';
import App from './App';
import { theme } from './theme';
import { runtimeQuestionBank } from '../content/runtimeQuestionBank';

function completed(quizId: string, subjectId: string, percentage: number): CompletedAttempt {
  const at = '2026-10-02T00:00:00.000Z';
  return {
    id: `${quizId}-completed`, quizId, subjectId, feedbackMode: 'exam', startedAt: at, completedAt: at,
    responses: {}, score: { correct: 1, incorrect: 0, unanswered: 0, total: 1, percentage, elapsedMs: 0 },
  };
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('progressive dashboard statistics', () => {
  it('calculates all subject scores after the summary request without opening a subject', async () => {
    const attempts = new LocalAttemptRepository();
    attempts.saveCompleted(completed('q1', 's1', 80));
    attempts.saveCompleted(completed('q2', 's2', 40));
    let resolveCatalog!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    const pendingCatalog = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(resolve => { resolveCatalog = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pendingCatalog);
    vi.stubGlobal('fetch', fetchMock);

    render(<ThemeProvider theme={theme}><App /></ThemeProvider>);
    expect(screen.getByText('Completed quizzes')).toBeVisible();
    expect(screen.getByRole('heading', { name: '2' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Loading subjects' })).toBeVisible();

    await act(async () => resolveCatalog({
      ok: true,
      json: async () => ({ revision: 'rev-dashboard', subjects: [
        { id: 's1', name: 'First', accent: '#111111', quizCount: 1, quizIds: ['q1'] },
        { id: 's2', name: 'Second', accent: '#222222', quizCount: 1, quizIds: ['q2'] },
      ] }),
    }));
    await waitFor(() => expect(screen.getByText('60%')).toBeVisible());
    expect(screen.getByRole('heading', { name: '40%' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Second' })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/subjects');
  });

  it('cancels a pending question launch on navigation without creating an attempt', async () => {
    const subject = { id: 's-cancel', name: 'Test Subject', accent: '#b9511b' };
    const quiz = { id: 'q-cancel', subjectId: subject.id, name: 'Test Quiz', questionCount: 1, questionIds: ['i-cancel'] };
    runtimeQuestionBank.configureApi({ revision: 'rev-cancel-app', subjects: [{ ...subject, quizCount: 1, quizIds: [quiz.id] }] }, [
      { revision: 'rev-cancel-app', quizzes: [quiz] },
    ]);
    let resolveQuestions!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    const pendingQuestions = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(resolve => { resolveQuestions = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pendingQuestions);
    vi.stubGlobal('fetch', fetchMock);

    render(<ThemeProvider theme={theme}><App /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Open Test Subject' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start quiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin Quiz' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/quizzes/q-cancel/questions');

    fireEvent.click(screen.getByRole('button', { name: 'All subjects' }));
    expect(screen.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
    expect(localStorage.getItem('meducation.active-attempts.v1')).toBeNull();

    await act(async () => resolveQuestions({
      ok: true,
      json: async () => ({
        revision: 'rev-cancel-app',
        questions: [{ id: 'i-cancel', quizId: quiz.id, stem: 'Question', choices: [{ id: 'A', text: 'Choice' }], answer: 'A' }],
      }),
    }));
    expect(screen.queryByRole('heading', { name: 'Test Quiz' })).toBeNull();
    expect(localStorage.getItem('meducation.active-attempts.v1')).toBeNull();
    expect(runtimeQuestionBank.listQuestions(quiz.id)).toEqual([]);
  });
});

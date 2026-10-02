import { ThemeProvider } from '@mui/material';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompletedAttempt } from '../domain/types';
import { LocalAttemptRepository } from '../persistence/localRepository';
import App from './App';
import { theme } from './theme';

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
});

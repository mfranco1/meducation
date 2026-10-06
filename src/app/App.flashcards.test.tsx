import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { runtimeQuestionBank } from '../content/runtimeQuestionBank';
import { runtimeFlashcardBank } from '../content/runtimeFlashcardBank';
import App from './App';
import { theme } from './theme';

afterEach(() => vi.unstubAllGlobals());

it('shows a visible persistence error when a deck cannot be launched', async () => {
  runtimeQuestionBank.configureApi({ revision: 'rev-quota', subjects: [] });
  runtimeFlashcardBank.configureLocal(
    [{ id: 's1', name: 'Flash subject', accent: '#123456', topicCount: 1, deckCount: 1, deckIds: ['d1'] }],
    [{ id: 't1', subjectId: 's1', name: 'Topic' }],
    [{ id: 'd1', topicId: 't1', name: 'Test deck', cardCount: 1, cardIds: ['f1'] }],
    [{ id: 'f1', deckId: 'd1', front: 'Front', back: 'Back' }],
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-quota', subjects: [] }) }),
  );
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open Flash subject' }));
  fireEvent.click(screen.getByRole('button', { name: 'Study deck' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Flashcard progress could not be saved');
  expect(screen.getByRole('button', { name: 'Study deck' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Reveal answer' })).toBeNull();
});

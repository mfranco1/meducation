import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { runtimeQuestionBank } from '../content/api/runtimeQuestionBank';
import { installFlashcardApiFixture } from '../test/runtimeContentFixtures';
import App from './App';
import { theme } from '../shared/theme';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('shows unreadable saved progress on the dashboard before a deck is opened', async () => {
  runtimeQuestionBank.configureApi({ revision: 'rev-corrupt', subjects: [] });
  await installFlashcardApiFixture([], [], []);
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'meducation.flashcards.progress.v2' ? '{broken' : null),
    setItem,
  });
  render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('original browser data has been kept');
  expect(setItem).not.toHaveBeenCalled();
});

it('disables progress backup during flashcard study with save-and-leave guidance', async () => {
  // This checks backup availability after admission; browser tests cover cold lazy loading.
  await import('../features/flashcards/screens/FlashcardStudyScreen');
  runtimeQuestionBank.configureApi({ revision: 'empty', subjects: [] });
  await installFlashcardApiFixture(
    [{ id: 's3', name: 'Backup cards', accent: '#123456', deckCount: 1, deckIds: ['d-backup'] }],
    [{ id: 'd-backup', subjectId: 's3', name: 'Backup deck', cardCount: 1, cardIds: ['f-backup'] }],
    [{ id: 'f-backup', deckId: 'd-backup', front: 'Front', back: 'Back' }],
  );
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  render(<ThemeProvider theme={theme}><App /></ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open Backup cards' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Study deck' }));
  expect(await screen.findByText('Card 1 of 1')).toBeVisible();

  const backupButton = screen.getByRole('button', { name: 'Progress backup' });
  expect(backupButton).toBeDisabled();
  expect(document.getElementById(backupButton.getAttribute('aria-describedby') ?? '')).toHaveTextContent('Save and leave your study session');
  expect(screen.queryByRole('dialog', { name: 'Progress backup' })).toBeNull();
  expect(screen.getByText('Card 1 of 1')).toBeVisible();
});

it('shows a visible persistence error when a deck cannot be launched', async () => {
  runtimeQuestionBank.configureApi({ revision: 'rev-quota', subjects: [] });
  await installFlashcardApiFixture(
    [{ id: 's1', name: 'Flash subject', accent: '#123456', deckCount: 1, deckIds: ['d1'] }],
    [{ id: 'd1', subjectId: 's1', name: 'Test deck', cardCount: 1, cardIds: ['f1'] }],
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

it('saves arrow-key navigation on the destination card when exiting', async () => {
  runtimeQuestionBank.configureApi({ revision: 'rev-arrow', subjects: [] });
  await installFlashcardApiFixture(
    [{ id: 's4', name: 'Arrow subject', accent: '#123456', deckCount: 1, deckIds: ['d-arrow'] }],
    [{ id: 'd-arrow', subjectId: 's4', name: 'Arrow deck', cardCount: 2, cardIds: ['f-arrow-1', 'f-arrow-2'] }],
    [
      { id: 'f-arrow-1', deckId: 'd-arrow', front: 'First front', back: 'First back' },
      { id: 'f-arrow-2', deckId: 'd-arrow', front: 'Second front', back: 'Second back' },
    ],
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-arrow', subjects: [] }) }));
  window.localStorage.clear();
  render(<ThemeProvider theme={theme}><App /></ThemeProvider>);

  fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open Arrow subject' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Study deck' }));
  // The study screen loads lazily; allow its module to settle under full-suite contention.
  expect(await screen.findByText('Card 1 of 2', {}, { timeout: 10_000 })).toBeInTheDocument();
  expect(document.querySelector('[aria-modal="true"]')).toHaveStyle({ visibility: 'hidden' });
  expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeEnabled();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(await screen.findByText('Card 2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save and exit deck' }));
  // The subject checkpoint reflects the destination selected with Arrow Right.
  expect(await screen.findByText('Card 2 of 2')).toBeInTheDocument();
});

it('keeps the current card open and reports an error when arrow navigation cannot save', async () => {
  runtimeQuestionBank.configureApi({ revision: 'rev-arrow-quota', subjects: [] });
  await installFlashcardApiFixture(
    [{ id: 's5', name: 'Arrow quota subject', accent: '#123456', deckCount: 1, deckIds: ['d-arrow-quota'] }],
    [{ id: 'd-arrow-quota', subjectId: 's5', name: 'Arrow quota deck', cardCount: 2, cardIds: ['f-arrow-q1', 'f-arrow-q2'] }],
    [
      { id: 'f-arrow-q1', deckId: 'd-arrow-quota', front: 'Saved first front', back: 'Saved first back' },
      { id: 'f-arrow-q2', deckId: 'd-arrow-quota', front: 'Saved second front', back: 'Saved second back' },
    ],
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-arrow-quota', subjects: [] }) }));
  let progress: string | null = null;
  let progressWrites = 0;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => key === 'meducation.flashcards.progress.v2' ? progress : null,
    setItem: (key: string, value: string) => {
      if (key !== 'meducation.flashcards.progress.v2') return;
      progressWrites += 1;
      if (progressWrites > 1) throw new Error('Quota');
      progress = value;
    },
  });
  render(<ThemeProvider theme={theme}><App /></ThemeProvider>);

  fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open Arrow quota subject' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Study deck' }));
  // The study screen loads lazily; allow its module to settle under full-suite contention.
  expect(await screen.findByText('Card 1 of 2', {}, { timeout: 10_000 })).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(await screen.findByRole('alert')).toHaveTextContent('Flashcard progress could not be saved');
  expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeInTheDocument();
});

import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashcardsDashboardScreen } from './FlashcardsDashboardScreen';
import { theme } from '../../../shared/theme';

const emptyProgress = { schemaVersion: 2 as const, revision: 'empty', checkpoints: {}, completionCounts: {} };

describe('FlashcardsDashboardScreen', () => {
  it('renders the shared dashboard frame without quiz analytics', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen
          subjects={[]}
          activeSubjects={[]}
          progress={emptyProgress}
          onRetry={vi.fn()}
          onSelectSubject={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByRole('heading', { name: 'Flashcards' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
    expect(screen.getByText('No subjects are available yet.')).toBeVisible();
    expect(screen.getByText('Completed')).toBeVisible();
    expect(screen.getByText('Average')).toBeVisible();
    expect(screen.getByText('Highest')).toBeVisible();
    expect(screen.queryByText('All recorded finishes')).not.toBeInTheDocument();
    expect(screen.queryByText(/decks\/day|since tracking began|one local day/)).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Average flashcard deck finishes per day' })).getByText('0'),
    ).toBeVisible();
    expect(screen.getByText('decks')).toBeVisible();
    expect(screen.getByText('decks / day')).toBeVisible();
    expect(screen.getByText('decks finished in a day')).toBeVisible();
  });

  it('opens the privacy notice from the footer', async () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen subjects={[]} activeSubjects={[]} progress={emptyProgress} onRetry={vi.fn()} onSelectSubject={vi.fn()} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    const dialog = screen.getByRole('dialog', { name: /Privacy Notice/ });
    expect(within(dialog).getByText(/saved only in this browser/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a continue carousel and all-subject grid with deck completion', () => {
    const subject = { id: 's1', name: 'Anatomy', accent: '#b9511b' };
    const onSelectSubject = vi.fn();
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const dayKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen
          subjects={[{ subject, deckCount: 4, completedDeckCount: 2, activeDeckCount: 1, latestActiveAt: '2026-10-01' }]}
          activeSubjects={[{ subject, deckCount: 4, completedDeckCount: 2, activeDeckCount: 1, latestActiveAt: '2026-10-01' }]}
          progress={{
            ...emptyProgress,
            completionCounts: { d1: 2, d2: 1 },
            dailyStats: {
              firstDay: dayKey(yesterday),
              currentDay: dayKey(today),
              currentDayCount: 2,
              trackedCompletions: 3,
              highestDailyCount: 2,
            },
          }}
          onRetry={vi.fn()}
          onSelectSubject={onSelectSubject}
        />
      </ThemeProvider>,
    );
    const continueRegion = screen.getByRole('region', { name: 'Continue Studying' });
    expect(screen.getByRole('heading', { name: 'Continue Studying' })).toHaveStyle({ position: 'absolute' });
    expect(
      within(continueRegion).getByRole('button', { name: 'Continue studying Anatomy' }),
    ).toHaveAccessibleDescription('1 deck in progress');
    expect(within(continueRegion).getByText('Continue')).toBeVisible();
    const grid = screen.getByTestId('all-subjects-grid');
    expect(within(grid).getByText('1 in progress')).toBeVisible();
    expect(within(continueRegion).getByText('1 deck in progress')).toBeVisible();
    expect(within(continueRegion).queryByTestId('subject-score-track')).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Completed' })).getByText('3')).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Average flashcard deck finishes per day' })).getByText('1.5'),
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Highest flashcard deck finishes in a day' })).getByText('2'),
    ).toBeVisible();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
    expect(within(grid).getByText('Completed 50%')).toBeVisible();
    expect(within(grid).getByTestId('subject-score-track').firstElementChild).toHaveStyle({ width: '50%' });
    fireEvent.click(within(continueRegion).getByRole('button', { name: 'Continue studying Anatomy' }));
    expect(onSelectSubject).toHaveBeenCalledExactlyOnceWith(subject);
    fireEvent.click(within(grid).getByRole('button', { name: 'Open Anatomy' }));
    expect(onSelectSubject).toHaveBeenCalledTimes(2);
  });

  it('does not present unreadable progress as zero statistics', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen
          subjects={[]}
          activeSubjects={[]}
          progress={emptyProgress}
          progressError="Saved flashcard progress could not be read safely."
          onRetry={vi.fn()}
          onSelectSubject={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Filter subjects' }).parentElement!).getByRole('button', {
        name: 'In progress',
      }),
    ).toBeDisabled();
  });

  it.each([
    [26, 25, '1'],
    [53, 50, '1.1'],
    [2, 1, '2'],
    [2001, 2, '1k'],
  ])('formats average %i/%i with at most one decimal or in thousands',(trackedCompletions, elapsedDays, expected) => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - elapsedDays + 1);
    const dayKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen
          subjects={[]}
          activeSubjects={[]}
          progress={{
            ...emptyProgress,
            dailyStats: {
              firstDay: dayKey(firstDay),
              currentDay: dayKey(today),
              currentDayCount: 1,
              trackedCompletions,
              highestDailyCount: 1,
            },
          }}
          onRetry={vi.fn()}
          onSelectSubject={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(
      within(screen.getByRole('group', { name: 'Average flashcard deck finishes per day' })).getByText(expected),
    ).toBeVisible();
  });

  it('shows completed and highest counts of 1000 or more in thousands', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen
          subjects={[]}
          activeSubjects={[]}
          progress={{
            ...emptyProgress,
            completionCounts: { d1: 1000 },
            dailyStats: {
              firstDay: '2026-01-01',
              currentDay: '2026-01-01',
              currentDayCount: 1,
              trackedCompletions: 1,
              highestDailyCount: 999_999,
            },
          }}
          onRetry={vi.fn()}
          onSelectSubject={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(within(screen.getByRole('group', { name: 'Completed' })).getByText('1k')).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Highest flashcard deck finishes in a day' })).getByText('999k'),
    ).toBeVisible();
  });

  it('filters the All Subjects grid to in-progress subjects', () => {
    const active = { id: 'a', name: 'Active', accent: '#b9511b' };
    const inactive = { id: 'i', name: 'Inactive', accent: '#b9511b' };
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen
          subjects={[
            { subject: active, deckCount: 2, completedDeckCount: 0, activeDeckCount: 1 },
            { subject: inactive, deckCount: 2, completedDeckCount: 0, activeDeckCount: 0 },
          ]}
          activeSubjects={[]}
          progress={emptyProgress}
          onRetry={vi.fn()}
          onSelectSubject={vi.fn()}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'In progress' }));
    const grid = screen.getByTestId('all-subjects-grid');
    expect(within(grid).getByRole('button', { name: 'Open Active' })).toBeVisible();
    expect(within(grid).queryByRole('button', { name: 'Open Inactive' })).not.toBeInTheDocument();
  });

  it('shows deck completion only once a deck is completed', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen
          subjects={[
            { subject: { id: 'a', name: 'Started', accent: '#b9511b' }, deckCount: 300, completedDeckCount: 1, activeDeckCount: 0 },
            { subject: { id: 'b', name: 'Untouched', accent: '#b9511b' }, deckCount: 2, completedDeckCount: 0, activeDeckCount: 0 },
          ]}
          activeSubjects={[]}
          progress={emptyProgress}
          onRetry={vi.fn()}
          onSelectSubject={vi.fn()}
        />
      </ThemeProvider>,
    );
    const grid = screen.getByTestId('all-subjects-grid');
    expect(within(grid).getByRole('button', { name: 'Open Started' })).toHaveTextContent('Completed 1%');
    expect(within(grid).getByRole('button', { name: 'Open Untouched' })).not.toHaveTextContent('Completed');
  });
});

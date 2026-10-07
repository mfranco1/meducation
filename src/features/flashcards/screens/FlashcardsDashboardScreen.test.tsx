import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashcardsDashboardScreen } from './FlashcardsDashboardScreen';
import { theme } from '../../../shared/theme';

const emptyProgress = { schemaVersion: 2 as const, revision: 'empty', checkpoints: {}, completionCounts: {} };

describe('FlashcardsDashboardScreen', () => {
  it('renders the shared dashboard frame without quiz analytics', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen subjects={[]} activeSubjects={[]} progress={emptyProgress} onRetry={vi.fn()} onSelectSubject={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.queryByRole('heading', { name: 'Flashcards' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
    expect(screen.getByText('No subjects are available yet.')).toBeVisible();
    expect(screen.getByText('Completed decks')).toBeVisible();
    expect(screen.getByText('Average')).toBeVisible();
    expect(screen.getByText('Highest')).toBeVisible();
    expect(screen.getAllByText('0.0')).toHaveLength(1);
  });

  it('shows a continue carousel and all-subject grid without score metadata', () => {
    const subject = { id: 's1', name: 'Anatomy', accent: '#b9511b' };
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen
          subjects={[{ subject, deckCount: 4, activeDeckCount: 1, latestActiveAt: '2026-10-01' }]}
          activeSubjects={[{ subject, deckCount: 4, activeDeckCount: 1, latestActiveAt: '2026-10-01' }]}
          progress={{ ...emptyProgress, completionCounts: { d1: 2, d2: 1 }, dailyStats: { firstDay: dayKey(yesterday), currentDay: dayKey(today), currentDayCount: 2, trackedCompletions: 3, highestDailyCount: 2 } }}
          onRetry={vi.fn()}
          onSelectSubject={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Continue Studying' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Open Anatomy' })).toHaveLength(2);
    expect(screen.getAllByText('1 in progress')).toHaveLength(2);
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('1.5')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });

  it('does not present unreadable progress as zero statistics', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen subjects={[]} activeSubjects={[]} progress={emptyProgress} progressError="Saved flashcard progress could not be read safely." onRetry={vi.fn()} onSelectSubject={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  });
});

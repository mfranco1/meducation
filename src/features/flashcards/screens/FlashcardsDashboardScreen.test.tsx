import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashcardsDashboardScreen } from './FlashcardsDashboardScreen';
import { theme } from '../../../shared/theme';

describe('FlashcardsDashboardScreen', () => {
  it('renders the shared dashboard frame without quiz analytics', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen subjects={[]} activeSubjects={[]} onRetry={vi.fn()} onSelectSubject={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.queryByRole('heading', { name: 'Flashcards' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
    expect(screen.getByText('No subjects are available yet.')).toBeVisible();
    expect(screen.queryByText(/score|average|completed quizzes/i)).not.toBeInTheDocument();
  });

  it('shows a continue carousel and all-subject grid without score metadata', () => {
    const subject = { id: 's1', name: 'Anatomy', accent: '#b9511b' };
    render(
      <ThemeProvider theme={theme}>
        <FlashcardsDashboardScreen
          subjects={[{ subject, deckCount: 4, activeDeckCount: 1, latestActiveAt: '2026-10-01' }]}
          activeSubjects={[{ subject, deckCount: 4, activeDeckCount: 1, latestActiveAt: '2026-10-01' }]}
          onRetry={vi.fn()}
          onSelectSubject={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Continue Studying' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Open Anatomy' })).toHaveLength(2);
    expect(screen.getAllByText('1 in progress')).toHaveLength(2);
    expect(screen.queryByText('4 decks')).not.toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });
});

import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FlashcardCatalogResponse } from '../../../content/api/flashcardApiDecoders';
import { theme } from '../../../shared/theme';
import { FlashcardSubjectScreen } from './FlashcardSubjectScreen';

const subject = { id: 's1', name: 'Anatomy', accent: '#b9511b' };
const catalog: FlashcardCatalogResponse = {
  revision: 'sha256-test',
  decks: [
    { id: 'd1', subjectId: 's1', name: 'Brachial plexus', cardCount: 2, cardIds: ['f1', 'f2'] },
    { id: 'd2', subjectId: 's1', name: 'Shoulder', cardCount: 0, cardIds: [] },
    { id: 'd3', subjectId: 's1', name: 'Heart', cardCount: 1, cardIds: ['f3'] },
  ],
};

describe('FlashcardSubjectScreen', () => {
  it('lists all subject decks directly and launches a selected non-empty deck', () => {
    const onSelectDeck = vi.fn();
    render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} catalog={catalog} checkpoints={{}} completionCounts={{}} onBack={vi.fn()} onRetry={vi.fn()} onSelectDeck={onSelectDeck} /></ThemeProvider>);
    expect(screen.getByRole('heading', { name: 'Anatomy' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Study deck' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Brachial plexus' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Heart' })).toBeVisible();
    expect(screen.queryByText(/topic/i)).toBeNull();
    const studyButtons = screen.getAllByRole('button', { name: 'Study deck' });
    expect(studyButtons[0]).toBeEnabled();
    fireEvent.click(studyButtons[0]);
    expect(onSelectDeck).toHaveBeenCalledWith(catalog.decks[0]);
  });

  it('shows an empty state and disables empty decks', () => {
    render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} catalog={{ ...catalog, decks: [catalog.decks[1]] }} checkpoints={{}} completionCounts={{}} onBack={vi.fn()} onRetry={vi.fn()} onSelectDeck={vi.fn()} /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'No cards yet' })).toBeDisabled();
  });

  it('uses shared shimmer rows during catalog loading and retains them after catalog failure', () => {
    const { rerender } = render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} checkpoints={{}} completionCounts={{}} loading onBack={vi.fn()} onRetry={vi.fn()} onSelectDeck={vi.fn()} /></ThemeProvider>);
    expect(screen.getByRole('status', { name: 'Loading flashcard decks' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelectorAll('.MuiSkeleton-wave')).toHaveLength(4);
    rerender(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} checkpoints={{}} completionCounts={{}} error={new Error('unavailable')} onBack={vi.fn()} onRetry={vi.fn()} onSelectDeck={vi.fn()} /></ThemeProvider>);
    expect(screen.getByRole('alert')).toHaveTextContent('We can’t load flashcard decks for Anatomy right now.');
    expect(document.querySelectorAll('.MuiSkeleton-wave')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('keeps the deck list available while a deck launch is loading', () => {
    render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} catalog={catalog} checkpoints={{}} completionCounts={{}} loadingDeckId="d1" onBack={vi.fn()} onRetry={vi.fn()} onSelectDeck={vi.fn()} /></ThemeProvider>);
    expect(screen.getByRole('heading', { name: 'Brachial plexus' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Loading deck…' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Study deck' })).toHaveLength(1);
  });

  it('shows singular and plural completion pills alongside a saved position', () => {
    const checkpoints = {
      d1: { deckId: 'd1', currentCardId: 'f2', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: [], flaggedCardIds: [] },
    };
    render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} catalog={catalog} checkpoints={checkpoints} completionCounts={{ d1: 1, d3: 3 }} onBack={vi.fn()} onRetry={vi.fn()} onSelectDeck={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText('Completed 1 time')).toBeVisible();
    expect(screen.getByText('Card 2 of 2')).toBeVisible();
    expect(screen.getByText('Completed 3 times')).toBeVisible();
    expect(screen.queryByText('Completed 0 times')).toBeNull();
  });
});

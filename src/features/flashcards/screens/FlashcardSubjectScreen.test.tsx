import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FlashcardCatalogResponse } from '../../../content/api/flashcardApiDecoders';
import { theme } from '../../../shared/theme';
import { FlashcardSubjectScreen } from './FlashcardSubjectScreen';

const subject = { id: 's1', name: 'Anatomy', accent: '#b9511b' };
const catalog: FlashcardCatalogResponse = {
  revision: 'sha256-test',
  topics: [{ id: 't1', subjectId: 's1', name: 'Upper limb' }, { id: 't2', subjectId: 's1', name: 'Thorax' }],
  decks: [
    { id: 'd1', subjectId: 's1', topicId: 't1', name: 'Brachial plexus', cardCount: 2, cardIds: ['f1', 'f2'] },
    { id: 'd2', subjectId: 's1', topicId: 't1', name: 'Shoulder', cardCount: 0, cardIds: [] },
    { id: 'd3', subjectId: 's1', topicId: 't2', name: 'Heart', cardCount: 1, cardIds: ['f3'] },
  ],
};

describe('FlashcardSubjectScreen', () => {
  it('shows the shared empty display after loading an empty catalog and keeps back navigation available', () => {
    const onBack = vi.fn();
    const props = { subject, checkpoints: {}, completionCounts: {}, onBack, onRetry: vi.fn(), onSelectDeck: vi.fn() };
    const { rerender } = render(<ThemeProvider theme={theme}><FlashcardSubjectScreen {...props} loading /></ThemeProvider>);

    expect(screen.queryByRole('heading', { name: 'No flashcard decks available yet' })).toBeNull();
    rerender(<ThemeProvider theme={theme}><FlashcardSubjectScreen {...props} catalog={{ ...catalog, decks: [] }} /></ThemeProvider>);

    expect(screen.getByRole('heading', { name: 'No flashcard decks available yet' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('groups decks by topic, launches a selected deck and switches topics', () => {
    const onSelectDeck = vi.fn();
    render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} catalog={catalog} checkpoints={{}} completionCounts={{ d3: 1 }} onBack={vi.fn()} onRetry={vi.fn()} onSelectDeck={onSelectDeck} /></ThemeProvider>);
    expect(screen.getByRole('heading', { name: 'Anatomy' })).toBeVisible();
    expect(screen.getByText('1 / 3 decks completed')).toBeVisible();
    expect(screen.getByRole('button', { name: /Upper limb/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { name: 'Brachial plexus' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Heart' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Study deck: Brachial plexus' }));
    expect(onSelectDeck).toHaveBeenCalledWith(catalog.decks[0]);

    fireEvent.click(screen.getByRole('button', { name: /Thorax/ }));
    expect(screen.getByRole('heading', { name: 'Heart' })).toBeVisible();
    expect(screen.getByText('Completed 1 time')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Brachial plexus' })).toBeNull();
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
    expect(screen.queryByRole('heading', { name: 'No flashcard decks available yet' })).toBeNull();
    expect(document.querySelectorAll('.MuiSkeleton-wave')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('keeps the deck list available while a deck launch is loading', () => {
    render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} catalog={catalog} checkpoints={{}} completionCounts={{}} loadingDeckId="d1" onBack={vi.fn()} onRetry={vi.fn()} onSelectDeck={vi.fn()} /></ThemeProvider>);
    expect(screen.getByRole('heading', { name: 'Brachial plexus' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Loading deck…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Study deck/ })).toBeNull();
  });

  it('shows singular and plural completion pills alongside a saved position', () => {
    const checkpoints = {
      d1: { deckId: 'd1', currentCardId: 'f2', contentSignature: 'sig', updatedAt: '2026-10-06T00:00:00.000Z', openedCardIds: ['f1'], flaggedCardIds: [] },
    };
    render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} catalog={catalog} checkpoints={checkpoints} completionCounts={{ d1: 1, d3: 3 }} onBack={vi.fn()} onRetry={vi.fn()} onSelectDeck={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText('Completed 1 time')).toBeVisible();
    expect(screen.getByText('1/2 reviewed')).toBeVisible();
    expect(screen.queryByText('Completed 0 times')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Thorax/ }));
    expect(screen.getByText('Completed 3 times')).toBeVisible();
  });
});

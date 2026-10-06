import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FlashcardCatalogResponse } from '../../content/flashcardApiDecoders';
import { theme } from '../theme';
import { FlashcardSubjectScreen } from './FlashcardSubjectScreen';

const subject = { id: 's1', name: 'Anatomy', accent: '#b9511b' };
const catalog: FlashcardCatalogResponse = {
  revision: 'sha256-test',
  topics: [
    { id: 't1', subjectId: 's1', name: 'Upper limb', deckCount: 2 },
    { id: 't2', subjectId: 's1', name: 'Thorax', deckCount: 1 },
  ],
  decks: [
    { id: 'd1', topicId: 't1', name: 'Brachial plexus', cardCount: 2, cardIds: ['f1', 'f2'] },
    { id: 'd2', topicId: 't1', name: 'Shoulder', cardCount: 0, cardIds: [] },
    { id: 'd3', topicId: 't2', name: 'Heart', cardCount: 1, cardIds: ['f3'] },
  ],
};

describe('FlashcardSubjectScreen', () => {
  it('filters by topic and launches a selected non-empty deck', () => {
    const onSelectDeck = vi.fn();
    const onSelectTopic = vi.fn();
    render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} catalog={catalog} checkpoints={{}} onBack={vi.fn()} onRetry={vi.fn()} onSelectTopic={onSelectTopic} onSelectDeck={onSelectDeck} /></ThemeProvider>);
    expect(screen.getByRole('heading', { name: 'Anatomy' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Study deck' })).toHaveLength(2);
    expect(screen.getByText('Thorax · 1 card')).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Topic' }));
    fireEvent.click(screen.getByRole('option', { name: 'Upper limb (2)' }));
    expect(onSelectTopic).toHaveBeenCalledWith('t1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Study deck' })[0]);
    expect(onSelectDeck).toHaveBeenCalledWith(catalog.decks[0]);
  });

  it('shows a clear empty state and disables empty decks', () => {
    render(<ThemeProvider theme={theme}><FlashcardSubjectScreen subject={subject} catalog={{ ...catalog, topics: [catalog.topics[0]], decks: [catalog.decks[1]] }} checkpoints={{}} onBack={vi.fn()} onRetry={vi.fn()} onSelectTopic={vi.fn()} onSelectDeck={vi.fn()} /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'No cards yet' })).toBeDisabled();
  });
});

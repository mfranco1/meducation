import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlashcardsDashboardScreen } from './FlashcardsDashboardScreen';
import { theme } from '../theme';

describe('FlashcardsDashboardScreen', () => {
  it('announces the dashboard and work in progress status', () => {
    render(<ThemeProvider theme={theme}><FlashcardsDashboardScreen /></ThemeProvider>);
    expect(screen.getByRole('heading', { name: 'Flashcards' })).toBeVisible();
    expect(screen.getByText('Work in progress. Your flashcards dashboard is coming soon.')).toBeVisible();
  });
});

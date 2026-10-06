import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppNavigationDrawer } from './AppNavigationDrawer';
import { theme } from '../../shared/theme';

describe('AppNavigationDrawer', () => {
  it('shows the logo and the two labelled destinations in the expanded drawer', () => {
    window.matchMedia = vi
      .fn()
      .mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(
      <ThemeProvider theme={theme}>
        <AppNavigationDrawer active="quizzes" currentPage="quizzes" onNavigate={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Meducation, go to Quizzes' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Meducation, go to Quizzes' }).querySelector('.MuiTouchRipple-root'),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Quizzes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Flashcards' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^(Quizzes|Flashcards)$/ })).toHaveLength(2);
  });

  it('uses an icon rail and opens the labelled mobile drawer', () => {
    window.matchMedia = vi
      .fn()
      .mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const navigate = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AppNavigationDrawer active="quizzes" onNavigate={navigate} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Quizzes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Flashcards' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }));
    const dialogs = screen.getAllByRole('presentation');
    expect(dialogs.length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Flashcards' }).at(-1)!);
    expect(navigate).toHaveBeenCalledWith('flashcards');
  });

  it('does not open the drawer or change routes when the edge control is disabled', () => {
    window.matchMedia = vi
      .fn()
      .mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const navigate = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AppNavigationDrawer active="quizzes" disabled onNavigate={navigate} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }));
    expect(screen.queryByRole('presentation')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});

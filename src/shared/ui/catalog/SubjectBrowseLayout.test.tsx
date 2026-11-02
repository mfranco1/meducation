import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { theme } from '../../theme';
import { SubjectBrowseLayout } from './SubjectBrowseLayout';

it.each([false, true])('omits the completion loading placeholder below sm (sm or wider: %s)', wide => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: wide, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const { container } = render(<ThemeProvider theme={theme}>
    <SubjectBrowseLayout subjectId="s1" subjectName="Subject" progress={null} contentType="quizzes" onContentTypeChange={vi.fn()} onBack={vi.fn()}>
      <p>Content</p>
    </SubjectBrowseLayout>
  </ThemeProvider>);
  expect(container.querySelectorAll('.MuiSkeleton-circular')).toHaveLength(wide ? 1 : 0);
  expect(screen.getByRole('tab', { name: 'Quizzes', selected: true })).toBeVisible();
  expect(screen.getByRole('tabpanel', { name: 'Quizzes' })).toHaveTextContent('Content');
});

it('updates subject progress and keeps Dashboard available across loading and empty panels', () => {
  const onBack = vi.fn();
  const props = { subjectId: 's1', subjectName: 'Subject', onContentTypeChange: vi.fn(), onBack };
  const { rerender } = render(<ThemeProvider theme={theme}>
    <SubjectBrowseLayout {...props} contentType="quizzes" progress={{ completed: 1, total: 3, nouns: 'quizzes' }}>Quizzes</SubjectBrowseLayout>
  </ThemeProvider>);
  expect(screen.getByText('33%')).toBeVisible();
  expect(screen.getByText('1 / 3 quizzes completed')).toBeVisible();
  rerender(<ThemeProvider theme={theme}>
    <SubjectBrowseLayout {...props} contentType="flashcards" progress={null}>Loading decks</SubjectBrowseLayout>
  </ThemeProvider>);
  expect(screen.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  rerender(<ThemeProvider theme={theme}>
    <SubjectBrowseLayout {...props} contentType="flashcards" progress={{ completed: 0, total: 0, nouns: 'decks' }}>No decks</SubjectBrowseLayout>
  </ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
  expect(onBack).toHaveBeenCalledOnce();
});

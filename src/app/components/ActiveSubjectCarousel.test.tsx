import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubjectStat } from '../dashboard';
import { theme } from '../theme';
import { ActiveSubjectCarousel } from './ActiveSubjectCarousel';

const stats: SubjectStat[] = [
  { subject: { id: 'biochem', name: 'Biochemistry', accent: '#b9511b' }, quizCount: 8, activeQuizCount: 1 },
  { subject: { id: 'physio', name: 'Physiology', accent: '#b9511b' }, quizCount: 6, activeQuizCount: 2 },
];

function renderCarousel(subjects = stats) {
  const onSelectSubject = vi.fn();
  render(<ThemeProvider theme={theme}><ActiveSubjectCarousel subjects={subjects} onSelectSubject={onSelectSubject} /></ThemeProvider>);
  return { onSelectSubject };
}

describe('ActiveSubjectCarousel', () => {
  it('does not render without active subjects', () => {
    renderCarousel([]);

    expect(screen.queryByRole('region', { name: 'Continue studying' })).toBeNull();
  });

  it('loops forward and backward through active subjects', () => {
    renderCarousel();

    expect(screen.getByRole('button', { name: 'Open Biochemistry' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next active subject' }));
    expect(screen.getAllByRole('button', { name: /Open (Biochemistry|Physiology)/ }).map(button => button.getAttribute('aria-label'))).toEqual(['Open Physiology']);
    fireEvent.click(screen.getByRole('button', { name: 'Next active subject' }));
    expect(screen.getAllByRole('button', { name: /Open (Biochemistry|Physiology)/ }).map(button => button.getAttribute('aria-label'))).toEqual(['Open Biochemistry']);
    fireEvent.click(screen.getByRole('button', { name: 'Previous active subject' }));
    expect(screen.getAllByRole('button', { name: /Open (Biochemistry|Physiology)/ }).map(button => button.getAttribute('aria-label'))).toEqual(['Open Physiology']);
  });

  it('shows only side arrows, without a position count', () => {
    renderCarousel();

    expect(screen.getByRole('button', { name: 'Previous active subject' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next active subject' })).toBeVisible();
    expect(screen.queryByText('1 of 2')).toBeNull();
  });

  it('selects the visible subject', () => {
    const { onSelectSubject } = renderCarousel();

    fireEvent.click(screen.getByRole('button', { name: 'Open Biochemistry' }));

    expect(onSelectSubject).toHaveBeenCalledWith(stats[0].subject);
  });

  it('omits navigation controls for one active subject', () => {
    renderCarousel([stats[0]]);

    expect(screen.queryByRole('button', { name: /active subject/ })).toBeNull();
  });
});

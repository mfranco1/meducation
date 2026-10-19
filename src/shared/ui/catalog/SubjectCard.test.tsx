import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../theme';
import { SubjectCard } from './SubjectCard';

describe('SubjectCard dashboard appearance', () => {
  it('keeps the icon and full subject title in the accessible subject action', () => {
    const subject = { id: 's1', name: 'Microbiology & Parasitology', accent: '#b9511b' };
    const onSelect = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <SubjectCard subject={subject} onSelect={onSelect} appearance="dashboardGrid">
          <span>score details</span>
        </SubjectCard>
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: 'Open Microbiology & Parasitology' });
    expect(button).toBeVisible();
    expect(screen.getByText(subject.name)).toBeVisible();
    expect(button.querySelector('[data-subject-icon="s1"]')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('score details')).toBeVisible();
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(subject);
  });

  it('shows the subject description when present', () => {
    const subject = { id: 's1', name: 'Anatomy', accent: '#b9511b', description: 'Structure of the human body' };
    render(
      <ThemeProvider theme={theme}>
        <SubjectCard subject={subject} onSelect={() => undefined} appearance="dashboardGrid" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Structure of the human body')).toBeVisible();
  });

  it('keeps the standard carousel title presentation by default', () => {
    const subject = { id: 's1', name: 'Anatomy', accent: '#b9511b' };
    render(
      <ThemeProvider theme={theme}>
        <SubjectCard subject={subject} onSelect={() => undefined} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Open Anatomy' })).toBeVisible();
  });
});

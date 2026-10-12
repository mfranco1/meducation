import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../theme';
import { ContinueStudyCard } from './ContinueStudyCard';

describe('ContinueStudyCard', () => {
  it('renders one accessible card action and invokes its callback', () => {
    const onContinue = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <ContinueStudyCard
          title="Obstetrics & Gynecology"
          activityLabel="1 quiz in progress"
          accessibleLabel="Continue studying Obstetrics & Gynecology"
          onContinue={onContinue}
          illustration={<svg aria-hidden="true" data-testid="artwork" />}
        />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: 'Continue studying Obstetrics & Gynecology' });
    expect(button).toHaveAccessibleDescription('1 quiz in progress');
    expect(button).toHaveTextContent('Continue Studying');
    expect(button).toHaveTextContent('Continue');
    expect(button.querySelectorAll('button')).toHaveLength(0);
    expect(screen.getByTestId('artwork')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledExactlyOnceWith();
  });

  it('supports custom copy, action text, illustration, and sx overrides', () => {
    render(
      <ThemeProvider theme={theme}>
        <ContinueStudyCard
          title="Anatomy"
          activityLabel="2 decks in progress"
          eyebrow="Pick up where you left off"
          actionLabel="Resume"
          accessibleLabel="Resume Anatomy"
          onContinue={() => undefined}
          illustration={<span data-testid="custom-art" />}
          sx={{ maxWidth: 720 }}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Resume Anatomy' })).toHaveTextContent('Pick up where you left off');
    expect(screen.getByRole('button', { name: 'Resume Anatomy' })).toHaveTextContent('Resume');
    expect(screen.getByTestId('custom-art')).toBeInTheDocument();
  });
});

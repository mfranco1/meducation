import { ThemeProvider } from '@mui/material';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../theme';
import { StatCard } from './StatCard';

const renderCard = (props: Partial<Parameters<typeof StatCard>[0]> = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <StatCard
        label="Completed"
        value={4}
        accessibleLabel="Completed quizzes"
        icon={<MenuBookOutlinedIcon aria-hidden="true" focusable="false" />}
        supportingText="quizzes"
        {...props}
      />
    </ThemeProvider>,
  );

describe('StatCard', () => {
  it('exposes a labelled group with its value and supporting line, keeping its icon decorative', () => {
    renderCard();
    const card = screen.getByRole('group', { name: 'Completed quizzes' });
    expect(within(card).getByText('Completed')).toBeVisible();
    expect(within(card).getByText('4')).toBeVisible();
    expect(within(card).getByText('quizzes')).toBeVisible();
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps zero and unavailable values distinct and renders the null loading sentinel', () => {
    const { rerender } = renderCard({ value: 0 });
    expect(screen.getByRole('group', { name: 'Completed quizzes' })).toHaveTextContent('0');
    rerender(
      <ThemeProvider theme={theme}>
        <StatCard label="Average" value="—" />
      </ThemeProvider>,
    );
    expect(screen.getByRole('group', { name: 'Average' })).toHaveTextContent('—');
    rerender(
      <ThemeProvider theme={theme}>
        <StatCard label="Average" value={null} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('group', { name: 'Average' }).querySelector('.MuiSkeleton-root')).toBeInTheDocument();
  });

  it('keeps optional supporting text space and exposes retry actions in the group', () => {
    const retry = vi.fn();
    renderCard({ supportingText: '', footer: <button onClick={retry}>Retry</button> });
    const card = screen.getByRole('group', { name: 'Completed quizzes' });
    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('keeps long subject labels and large counts visible without truncating the supporting line', () => {
    const subject = 'A very long subject name that should wrap instead of being clipped';
    renderCard({ value: 123456789, supportingText: subject });
    const card = screen.getByRole('group', { name: 'Completed quizzes' });
    expect(within(card).getByText('123456789')).toBeVisible();
    expect(within(card).getByText(subject)).toBeVisible();
  });

  it('retains results variant, badge, and footer', () => {
    renderCard({
      variant: 'results',
      badge: 'Best',
      supportingText: 'ignored in results',
      footer: <span>Details</span>,
    });
    const card = screen.getByRole('group', { name: 'Completed quizzes' });
    expect(within(card).getByText('Best')).toBeVisible();
    expect(within(card).getByText('Details')).toBeVisible();
    expect(within(card).queryByText('ignored in results')).not.toBeInTheDocument();
  });
});

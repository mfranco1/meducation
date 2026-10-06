import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../../shared/theme';
import { activeSubjectStats, type SubjectStat } from '../selectors/dashboard';
import { DashboardScreen } from './DashboardScreen';

const subject = { id: 'subject', name: 'Biochemistry', description: '', accent: '#b9511b' };
const renderDashboard = (trend: SubjectStat['trend'], activeQuizCount = 0) => render(<ThemeProvider theme={theme}><DashboardScreen
  attempts={[]}
  subjectStats={[{ subject, quizCount: 8, activeQuizCount, latest: 75, trend }]}
  onSelectSubject={() => {}}
/></ThemeProvider>);

describe('dashboard headings', () => {
  it('does not render the redundant Subjects title', () => {
    renderDashboard(undefined);

    expect(screen.queryByRole('heading', { name: 'Subjects' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  });
});

describe('dashboard catalog states', () => {
  it('shows local completion count and loading placeholders before the catalog arrives', () => {
    render(<ThemeProvider theme={theme}><DashboardScreen attempts={[]} subjectStats={[]} loading statsLoading onSelectSubject={() => {}} /></ThemeProvider>);
    expect(screen.getByText('Completed quizzes')).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.getByRole('status', { name: 'Loading subjects' })).toBeVisible();
    expect(screen.queryByText('No subjects are available yet.')).toBeNull();
  });

  it('keeps cards and subject placeholders under one shared failure banner', () => {
    const onRetry = vi.fn();
    render(<ThemeProvider theme={theme}><DashboardScreen attempts={[]} subjectStats={[]} error={new Error('The request took too long. Try again or come back later.')} onRetry={onRetry} onSelectSubject={() => {}} /></ThemeProvider>);
    expect(screen.getByRole('alert')).toHaveTextContent('We can’t load your stats and subjects right now.');
    expect(screen.getByTestId('dashboard-error-banner').parentElement?.querySelector('.MuiContainer-root')).toBeVisible();
    expect(screen.getByTestId('dashboard-error-banner').parentElement?.firstElementChild).toBe(screen.getByTestId('dashboard-error-banner'));
    expect(screen.getByText('Average')).toBeVisible();
    expect(screen.getByText('Lowest')).toBeVisible();
    expect(screen.queryByText('Couldn’t load subjects')).toBeNull();
    expect(document.querySelectorAll('.MuiSkeleton-wave').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the shared banner mounted and disables Retry while a manual request loads', () => {
    const onRetry = vi.fn();
    const view = render(<ThemeProvider theme={theme}><DashboardScreen attempts={[]} subjectStats={[]} error={new Error('offline')} onRetry={onRetry} onSelectSubject={() => {}} /></ThemeProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
    expect(onRetry).toHaveBeenCalledOnce();

    view.rerender(<ThemeProvider theme={theme}><DashboardScreen attempts={[]} subjectStats={[]} loading onSelectSubject={() => {}} /></ThemeProvider>);
    expect(screen.getByTestId('dashboard-error-banner')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
    expect(screen.getAllByText('Average')).toHaveLength(1);
    expect(screen.getAllByText('Lowest')).toHaveLength(1);

    view.rerender(<ThemeProvider theme={theme}><DashboardScreen attempts={[]} subjectStats={[]} onSelectSubject={() => {}} /></ThemeProvider>);
    expect(screen.queryByTestId('dashboard-error-banner')).toBeNull();
  });

  it('keeps the existing shimmer skeletons during automatic retries', () => {
    render(<ThemeProvider theme={theme}><DashboardScreen attempts={[]} subjectStats={[]} retrying onSelectSubject={() => {}} /></ThemeProvider>);
    expect(screen.getByText('Retrying…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
    expect(document.querySelectorAll('.MuiSkeleton-wave').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
  });
});

describe('dashboard score trend indicator', () => {
  it.each([
    ['increase', 'Score increased from previous attempt'],
    ['decrease', 'Score decreased from previous attempt'],
    ['unchanged', 'Score unchanged from previous attempt'],
  ] as const)('renders the %s indicator beside the latest score', (trend, label) => {
    renderDashboard(trend);
    expect(screen.getByText('Latest Score 75%')).toBeVisible();
    expect(screen.getByRole('img', { name: label })).toBeVisible();
  });

  it('omits the indicator when there is no previous score', () => {
    renderDashboard(undefined);
    expect(screen.getByText('Latest Score 75%')).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('dashboard lowest score', () => {
  it('shows the lowest-scoring subject in a pill beside the card label', () => {
    render(<ThemeProvider theme={theme}><DashboardScreen
      attempts={[]}
      personalLowest={42}
      personalLowestSubject="Physiology"
      subjectStats={[{ subject, quizCount: 8, activeQuizCount: 0, latest: 75 }]}
      onSelectSubject={() => {}}
    /></ThemeProvider>);

    expect(screen.getByText('Physiology')).toBeVisible();
  });
});

describe('dashboard in-progress indicator', () => {
  it.each([1, 2])('shows %i active quiz count beside the quiz count', activeQuizCount => {
    renderDashboard(undefined, activeQuizCount);

    expect(screen.getAllByText(`${activeQuizCount} in progress`)).toHaveLength(2);
  });

  it('omits the indicator when the subject has no active quizzes', () => {
    renderDashboard(undefined);

    expect(screen.queryByText(/in progress/)).toBeNull();
  });
});

describe('dashboard active-subject ordering', () => {
  it('includes only active subjects and orders them by active-quiz activity', () => {
    const newer = { subject: { ...subject, id: 'newer', name: 'Newer' }, quizCount: 2, activeQuizCount: 1, latestActiveAt: '2026-09-22T10:00:00.000Z' };
    const inactive = { subject: { ...subject, id: 'inactive', name: 'Inactive' }, quizCount: 2, activeQuizCount: 0, latestActiveAt: '2026-09-23T10:00:00.000Z' };
    const older = { subject: { ...subject, id: 'older', name: 'Older' }, quizCount: 2, activeQuizCount: 1, latestActiveAt: '2026-09-21T10:00:00.000Z' };

    expect(activeSubjectStats([older, inactive, newer]).map(stat => stat.subject.name)).toEqual(['Newer', 'Older']);
  });

  it('preserves catalog order when active-subject activity is tied', () => {
    const first = { subject: { ...subject, id: 'first', name: 'First' }, quizCount: 2, activeQuizCount: 1, latestActiveAt: '2026-09-22T10:00:00.000Z' };
    const second = { subject: { ...subject, id: 'second', name: 'Second' }, quizCount: 2, activeQuizCount: 1, latestActiveAt: '2026-09-22T10:00:00.000Z' };

    expect(activeSubjectStats([first, second]).map(stat => stat.subject.name)).toEqual(['First', 'Second']);
  });
});

import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../../shared/theme';
import { activeSubjectStats, type SubjectStat } from '../selectors/dashboard';
import { DashboardScreen } from './DashboardScreen';

const subject = { id: 'subject', name: 'Biochemistry', description: '', accent: '#b9511b' };
const renderDashboard = (trend: SubjectStat['trend'], activeQuizCount = 0) =>
  render(
    <ThemeProvider theme={theme}>
      <DashboardScreen
        attempts={[]}
        subjectStats={[{ subject, quizCount: 8, activeQuizCount, latest: 75, trend }]}
        onSelectSubject={() => {}}
      />
    </ThemeProvider>,
  );

describe('dashboard headings', () => {
  it('does not render the redundant Subjects title', () => {
    renderDashboard(undefined);

    expect(screen.queryByRole('heading', { name: 'Subjects' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  });
});

describe('dashboard catalog states', () => {
  it('shows local completion count and loading placeholders before the catalog arrives', () => {
    render(
      <ThemeProvider theme={theme}>
        <DashboardScreen attempts={[]} subjectStats={[]} loading statsLoading onSelectSubject={() => {}} />
      </ThemeProvider>,
    );
    expect(within(screen.getByRole('group', { name: 'Completed quizzes' })).getByText('Completed')).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.getByRole('status', { name: 'Loading subjects' })).toBeVisible();
    expect(screen.queryByText('No subjects are available yet.')).toBeNull();
  });

  it('keeps cards and subject placeholders under one shared failure banner', () => {
    const onRetry = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <DashboardScreen
          attempts={[]}
          subjectStats={[]}
          error={new Error('The request took too long. Try again or come back later.')}
          onRetry={onRetry}
          onSelectSubject={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('We can’t load your stats and subjects right now.');
    expect(
      screen.getByTestId('dashboard-error-banner').parentElement?.querySelector('.MuiContainer-root'),
    ).toBeVisible();
    expect(screen.getByTestId('dashboard-error-banner').parentElement?.firstElementChild).toBe(
      screen.getByTestId('dashboard-error-banner'),
    );
    expect(screen.getByText('Average')).toBeVisible();
    expect(screen.getByText('Lowest')).toBeVisible();
    expect(screen.queryByText('Couldn’t load subjects')).toBeNull();
    expect(document.querySelectorAll('.MuiSkeleton-wave').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the shared banner mounted and disables Retry while a manual request loads', () => {
    const onRetry = vi.fn();
    const view = render(
      <ThemeProvider theme={theme}>
        <DashboardScreen
          attempts={[]}
          subjectStats={[]}
          error={new Error('offline')}
          onRetry={onRetry}
          onSelectSubject={() => {}}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
    expect(onRetry).toHaveBeenCalledOnce();

    view.rerender(
      <ThemeProvider theme={theme}>
        <DashboardScreen attempts={[]} subjectStats={[]} loading onSelectSubject={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('dashboard-error-banner')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
    expect(screen.getAllByText('Average')).toHaveLength(1);
    expect(screen.getAllByText('Lowest')).toHaveLength(1);

    view.rerender(
      <ThemeProvider theme={theme}>
        <DashboardScreen attempts={[]} subjectStats={[]} onSelectSubject={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('dashboard-error-banner')).toBeNull();
  });

  it('keeps the existing shimmer skeletons during automatic retries', () => {
    render(
      <ThemeProvider theme={theme}>
        <DashboardScreen attempts={[]} subjectStats={[]} retrying onSelectSubject={() => {}} />
      </ThemeProvider>,
    );
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
  it('shows the lowest-scoring subject below the score', () => {
    render(
      <ThemeProvider theme={theme}>
        <DashboardScreen
          attempts={[]}
          personalLowest={42}
          personalLowestSubject="Physiology"
          subjectStats={[{ subject, quizCount: 8, activeQuizCount: 0, latest: 75 }]}
          onSelectSubject={() => {}}
        />
      </ThemeProvider>,
    );

    const card = screen.getByRole('group', { name: 'Lowest quiz score' });
    expect(within(card).getByText('42')).toBeVisible();
    expect(within(card).getByText('%')).toBeVisible();
    expect(within(card).getByText('Physiology')).toBeVisible();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('dashboard stat cards', () => {
  it('associates completed quiz units and percentage display with their accessible cards', () => {
    render(
      <ThemeProvider theme={theme}>
        <DashboardScreen
          attempts={[]}
          averageLatest={71}
          personalLowest={66}
          personalLowestSubject="Pharmacology"
          subjectStats={[]}
          onSelectSubject={() => {}}
        />
      </ThemeProvider>,
    );
    expect(within(screen.getByRole('group', { name: 'Completed quizzes' })).getByText('quizzes')).toBeVisible();
    expect(within(screen.getByRole('group', { name: 'Average quiz score' })).getByRole('heading')).toHaveTextContent(
      '71%',
    );
    expect(within(screen.getByRole('group', { name: 'Lowest quiz score' })).getByRole('heading')).toHaveTextContent(
      '66%',
    );
  });
});

describe('dashboard in-progress indicator', () => {
  it.each([1, 2])('shows %i active quiz count beside the score above the track in All Subjects', (activeQuizCount) => {
    renderDashboard(undefined, activeQuizCount);

    const grid = screen.getByTestId('all-subjects-grid');
    const label = within(grid).getByText(`${activeQuizCount} in progress`);
    const track = within(grid).getByTestId('subject-score-track');
    expect(label).toBeVisible();
    expect(label.compareDocumentPosition(track) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const continueRegion = screen.getByRole('region', { name: 'Continue Studying' });
    expect(within(grid).getAllByText(`${activeQuizCount} in progress`)).toHaveLength(1);
    expect(within(continueRegion).getByText(`${activeQuizCount} ${activeQuizCount === 1 ? 'quiz' : 'quizzes'} in progress`)).toBeVisible();
  });

  it('omits the indicator when the subject has no active quizzes', () => {
    renderDashboard(undefined);

    expect(screen.queryByText(/in progress/)).toBeNull();
  });
});

describe('dashboard subject filter and pagination', () => {
  it('shows at most 12 subjects per page and filters active subjects', () => {
    const stats = Array.from({ length: 13 }, (_, index) => ({
      subject: { ...subject, id: `s${index}`, name: `Subject ${index + 1}` },
      quizCount: 1,
      activeQuizCount: index === 12 ? 1 : 0,
    }));
    render(
      <ThemeProvider theme={theme}>
        <DashboardScreen attempts={[]} subjectStats={stats} onSelectSubject={() => {}} />
      </ThemeProvider>,
    );

    expect(
      within(screen.getByTestId('all-subjects-grid')).getAllByRole('button', { name: /^Open Subject/ }),
    ).toHaveLength(12);
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      within(screen.getAllByTestId('all-subjects-grid').at(-1)!).getByRole('button', { name: 'Open Subject 13' }),
    ).toBeVisible();
    expect(screen.getByText('Page 2 of 2')).toBeVisible();
    expect(screen.getByText('Page 2 of 2')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'In progress' }));
    expect(
      within(screen.getByTestId('all-subjects-grid')).getByRole('button', { name: 'Open Subject 13' }),
    ).toBeVisible();
    expect(screen.getByText('Page 1 of 1')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});

describe('dashboard active-subject ordering', () => {
  it('includes only active subjects and orders them by active-quiz activity', () => {
    const newer = {
      subject: { ...subject, id: 'newer', name: 'Newer' },
      quizCount: 2,
      activeQuizCount: 1,
      latestActiveAt: '2026-09-22T10:00:00.000Z',
    };
    const inactive = {
      subject: { ...subject, id: 'inactive', name: 'Inactive' },
      quizCount: 2,
      activeQuizCount: 0,
      latestActiveAt: '2026-09-23T10:00:00.000Z',
    };
    const older = {
      subject: { ...subject, id: 'older', name: 'Older' },
      quizCount: 2,
      activeQuizCount: 1,
      latestActiveAt: '2026-09-21T10:00:00.000Z',
    };

    expect(activeSubjectStats([older, inactive, newer]).map((stat) => stat.subject.name)).toEqual(['Newer', 'Older']);
  });

  it('preserves catalog order when active-subject activity is tied', () => {
    const first = {
      subject: { ...subject, id: 'first', name: 'First' },
      quizCount: 2,
      activeQuizCount: 1,
      latestActiveAt: '2026-09-22T10:00:00.000Z',
    };
    const second = {
      subject: { ...subject, id: 'second', name: 'Second' },
      quizCount: 2,
      activeQuizCount: 1,
      latestActiveAt: '2026-09-22T10:00:00.000Z',
    };

    expect(activeSubjectStats([first, second]).map((stat) => stat.subject.name)).toEqual(['First', 'Second']);
  });
});

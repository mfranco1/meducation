import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../theme';
import { activeSubjectStats, type SubjectStat } from '../dashboard';
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

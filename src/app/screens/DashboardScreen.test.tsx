import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../theme';
import { DashboardScreen, type SubjectStat } from './DashboardScreen';

const subject = { id: 'subject', name: 'Biochemistry', description: '', accent: '#b9511b' };
const renderDashboard = (trend: SubjectStat['trend']) => render(<ThemeProvider theme={theme}><DashboardScreen
  attempts={[]}
  subjectStats={[{ subject, quizCount: 8, latest: 75, trend }]}
  onSelectSubject={() => {}}
/></ThemeProvider>);

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
      subjectStats={[{ subject, quizCount: 8, latest: 75 }]}
      onSelectSubject={() => {}}
    /></ThemeProvider>);

    expect(screen.getByText('Physiology')).toBeVisible();
  });
});

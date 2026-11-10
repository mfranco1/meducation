import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../../../shared/theme';
import { SubjectScoreSummary } from './SubjectScoreSummary';

describe('SubjectScoreSummary', () => {
  it.each([0, 67, 100])('shows score %i', (score) => {
    render(
      <ThemeProvider theme={theme}>
        <SubjectScoreSummary score={score} />
      </ThemeProvider>,
    );
    expect(screen.getByText(`Latest score ${score}%`)).toBeVisible();
  });

  it.each([undefined, NaN, Infinity, -1, 101])('omits unavailable score %s and trend', (score) => {
    render(
      <ThemeProvider theme={theme}>
        <SubjectScoreSummary score={score} trend="increase" />
      </ThemeProvider>,
    );
    expect(screen.queryByText(/Latest score/)).toBeNull();
    expect(screen.queryByRole('img', { name: /Score increased/ })).toBeNull();
  });

  it.each([
    ['increase', 'Score increased from previous attempt'],
    ['decrease', 'Score decreased from previous attempt'],
    ['unchanged', 'Score unchanged from previous attempt'],
  ] as const)('preserves the %s trend', (trend, label) => {
    render(
      <ThemeProvider theme={theme}>
        <SubjectScoreSummary score={75} trend={trend} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('img', { name: label })).toBeVisible();
  });
});

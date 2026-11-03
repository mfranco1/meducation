import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { theme } from '../../theme';
import { ScreenLoading } from './ScreenLoading';

it('announces the loading label as a status', () => {
  render(
    <ThemeProvider theme={theme}>
      <ScreenLoading label="Loading dashboard…" />
    </ThemeProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard…');
});

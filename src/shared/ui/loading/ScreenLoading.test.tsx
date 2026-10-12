import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../../theme';
import { ScreenLoading } from './ScreenLoading';

describe('ScreenLoading', () => {
  it('shows the Meducation icon, loading bar, and status in order', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ScreenLoading label="Loading dashboard…" />
      </ThemeProvider>,
    );
    const status = screen.getByRole('status');
    const icon = status.querySelector('[data-brand-variant="icon"]');
    const bar = status.querySelector('[role="progressbar"]');
    const label = status.querySelector('p');
    expect(icon).toBeInTheDocument();
    expect(bar).toBeInTheDocument();
    expect(label).toBeInTheDocument();
    expect(status.textContent).toContain('Loading dashboard…');
    expect(icon!.compareDocumentPosition(bar!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar!.compareDocumentPosition(label!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.MuiLinearProgress-root')).toHaveAttribute('aria-hidden', 'true');
  });
});

import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentLoadError } from '../../../content/api/contentTransport';
import { theme } from '../../theme';
import { ContentLoadFailure } from './ContentLoadFailure';

describe('content load failure', () => {
  it('shows clean learner copy and a text action without rendering diagnostics', () => {
    const onRetry = vi.fn();
    render(<ThemeProvider theme={theme}><ContentLoadFailure
      title="Failed to load subjects"
      error={new ContentLoadError('http', 'HTTP 503. Restart the backend at localhost:8000', 503)}
      onRetry={onRetry}
    /></ThemeProvider>);
    expect(screen.getByText('Unable to load subjects')).toBeVisible();
    expect(screen.getByText('Please try again or come back later.')).toBeVisible();
    expect(screen.queryByText(/503|localhost|backend/i)).toBeNull();
    expect(screen.getByRole('alert').querySelector('.MuiCard-root')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses connection copy for network failures and reload action for revision conflicts', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ThemeProvider theme={theme}><ContentLoadFailure
      title="Failed to load questions" error={new ContentLoadError('network', 'raw') } onRetry={onRetry}
    /></ThemeProvider>);
    expect(screen.getByText('Check your connection and try again.')).toBeVisible();
    rerender(<ThemeProvider theme={theme}><ContentLoadFailure
      title="Failed to load questions" error={new ContentLoadError('revision', '409 conflict') } onRetry={onRetry}
    /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Reload content' })).toBeVisible();
    expect(screen.queryByText('409 conflict')).toBeNull();
  });
});

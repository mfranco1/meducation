import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../theme';
import { ContentRecoveryBanner } from './ContentRecoveryBanner';

afterEach(() => vi.useRealTimers());

describe('ContentRecoveryBanner', () => {
  it('derives its countdown from the retry deadline and cleans up its timer', () => {
    vi.useFakeTimers();
    const retryAt = Date.now() + 5_000;
    const { unmount } = render(<ThemeProvider theme={theme}><ContentRecoveryBanner retrying retryAt={retryAt} onRetry={() => {}} /></ThemeProvider>);

    expect(screen.getByText('Trying again in 5s…')).toBeVisible();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('Trying again in 4s…')).toBeVisible();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps retry disabled until Retry-After elapses, then enables a manual advance', () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    const now = Date.now();
    render(<ThemeProvider theme={theme}><ContentRecoveryBanner retrying retryAt={now + 5_000} retryAfterAt={now + 1_000} onRetry={onRetry} /></ThemeProvider>);
    const retry = screen.getByRole('button', { name: 'Retrying…' });
    expect(retry).toBeDisabled();
    act(() => vi.advanceTimersByTime(1_000));
    const retryNow = screen.getByRole('button', { name: 'Retry now' });
    expect(retryNow).toBeEnabled();
    fireEvent.click(retryNow);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('uses safe revision copy and disables the action while a request is active', () => {
    const error = Object.assign(new Error('raw server details'), { kind: 'revision' });
    render(<ThemeProvider theme={theme}><ContentRecoveryBanner error={error} busy onRetry={() => {}} /></ThemeProvider>);
    expect(screen.getByRole('alert')).toHaveTextContent('Content has changed.');
    expect(screen.queryByText('raw server details')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled();
  });
});

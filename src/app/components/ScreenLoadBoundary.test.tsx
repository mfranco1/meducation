import { lazy } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BootFailure } from './BootFailure';
import { ScreenLoadBoundary } from './ScreenLoadBoundary';

afterEach(() => vi.restoreAllMocks());

it('shows a reload action when a lazy screen cannot load', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const FailedScreen = lazy(() => Promise.reject(new Error('chunk unavailable')));
  render(<ScreenLoadBoundary><FailedScreen /></ScreenLoadBoundary>);
  expect(await screen.findByText('This screen could not load. Reload to try again.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
});

it('shows a reload action if the app cannot start', () => {
  render(<BootFailure />);
  expect(screen.getByText('The app could not start. Reload to try again.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
});

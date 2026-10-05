import { lazy } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
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

it('keeps shell content visible while a lazy screen is loading, then replaces its status', async () => {
  let resolveScreen!: (value: { default: () => ReactElement }) => void;
  const PendingScreen = lazy(() => new Promise<{ default: () => ReactElement }>(resolve => { resolveScreen = resolve; }));
  render(<><header>Meducation</header><ScreenLoadBoundary loadingLabel="Loading quiz…"><PendingScreen /></ScreenLoadBoundary></>);

  expect(screen.getByRole('banner')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Loading quiz…');
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');

  await act(async () => { resolveScreen({ default: () => <p>Quiz content</p> }); });
  expect(screen.getByText('Quiz content')).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});

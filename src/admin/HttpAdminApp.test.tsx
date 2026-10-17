import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { theme } from '../shared/theme';
import { createAdminStore } from '../test/adminGateway';
import { storedFlashcardBank, storedQuestionBank } from '../test/contentFixtures';

type Override = (path: string, init?: RequestInit) => Response | undefined;
let server: ReturnType<typeof createAdminStore>;
let override: Override | undefined;
const session = { authenticated: true, csrfToken: 'csrf', fresh: true };

async function mount() {
  vi.resetModules();
  const { default: HttpAdminApp } = await import('./HttpAdminApp');
  render(
    <ThemeProvider theme={theme}>
      <HttpAdminApp />
    </ThemeProvider>,
  );
  await screen.findByRole('tab', { name: 'Quizzes' });
}
beforeEach(() => {
  override = undefined;
  server = createAdminStore(structuredClone(storedQuestionBank), structuredClone(storedFlashcardBank));
  server.editElsewhere('questions', 'i1', { stem: 'Changed in the draft' });
  server.fetcher.mockClear();
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/api/admin', '');
    if (path === '/session') return new Response(JSON.stringify(session), { status: 200 });
    return override?.(path, init) ?? server.fetcher(input, init);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const menu = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
};
const sent = () => server.fetcher.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace('/api/admin', '')}`);

it('publishes the draft after one confirmation and reports it', async () => {
  await mount();
  expect(screen.getByRole('button', { name: /Workspace status: Draft changes/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Review & publish' }));
  const dialog = screen.getByRole('dialog', { name: 'Review & publish' });
  expect(within(dialog).getByLabelText('Draft totals')).toHaveTextContent('2 subjects · 2 topics · 3 quizzes · 4 questions');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm publication' }));
  expect(await screen.findByText(/Published quizzes and flashcards/)).toBeVisible();
  expect(sent().filter((request) => request.includes('publish'))).toEqual(['POST /draft/publish']);
  await waitFor(() => expect(screen.getByRole('button', { name: /Workspace status: Up to date/ })).toBeVisible());
  expect(screen.getByRole('button', { name: 'Review & publish' })).toBeDisabled();
});

it('discards unpublished changes after confirmation and shows the published content again', async () => {
  await mount();
  menu('Discard unpublished changes…');
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard unpublished changes' })).getByRole('button', { name: 'Discard unpublished changes' }));
  expect(await screen.findByText(/Unpublished changes discarded/)).toBeVisible();
  expect(sent()).toContain('POST /draft/discard');
  expect(server.serverSnapshot().changed).toBe(false);
  expect(server.serverSnapshot().questions[0]).toMatchObject({ stem: storedQuestionBank.questions[0].stem, version: 1 });
});

it('lists recent changes with Revert, which restores the record and refreshes the list', async () => {
  await mount();
  menu('Changes…');
  const dialog = await screen.findByRole('dialog', { name: 'Changes' });
  expect(await within(dialog).findByText(/update question i1/)).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Revert change 1' }));
  expect(await screen.findByText('Reverted change #1.')).toBeVisible();
  expect(server.serverSnapshot().questions[0]).toMatchObject({ stem: storedQuestionBank.questions[0].stem, version: 3 });
  expect(await within(dialog).findByText(/#2 /)).toBeVisible();
});

it('asks for a fresh sign-in instead of resending when publication needs a recent login', async () => {
  await mount();
  let attempts = 0;
  override = (path) =>
    path === '/draft/publish' && ++attempts
      ? new Response(JSON.stringify({ error: { code: 'fresh_auth_required', message: 'x', requestId: 'r' } }), { status: 403 })
      : undefined;
  fireEvent.click(screen.getByRole('button', { name: 'Review & publish' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }));
  expect((await screen.findAllByText(/Sign in again to refresh authentication/)).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Sign in to continue', hidden: true })).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm publication' })).toBeDisabled());
  expect(attempts).toBe(1);
});

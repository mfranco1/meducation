import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { theme } from '../shared/theme';
import { createAdminStore } from '../test/adminGateway';
import { storedFlashcardBank, storedQuestionBank } from '../test/contentFixtures';

let server: ReturnType<typeof createAdminStore>;
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
  server = createAdminStore(structuredClone(storedQuestionBank), structuredClone(storedFlashcardBank));
  server.editElsewhere('questions', 'i1', { stem: 'Changed in the draft' });
  server.fetcher.mockClear();
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/api/admin', '');
    if (path === '/session') return new Response(JSON.stringify(session), { status: 200 });
    return server.fetcher(input, init);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('reviews draft totals and word changes before publication', async () => {
  await mount();
  expect(screen.getByRole('button', { name: /Workspace status: Draft changes/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Review & publish' }));
  const dialog = screen.getByRole('dialog', { name: 'Review & publish' });
  expect(within(dialog).getByLabelText('Draft totals')).toHaveTextContent(
    '2 subjects · 2 topics · 3 quizzes · 4 questions',
  );
  const changed = await within(dialog).findByText(/^Changed question i1/);
  const details = changed.closest('details')!;
  expect(details.querySelector('ins')).toHaveTextContent('Changed in the draft');
  expect(details.querySelector('del')).toHaveTextContent(storedQuestionBank.questions[0].stem.split(/\s+/)[0]);
});

import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AdminWorkspace } from './AdminWorkspace';
import { theme } from '../shared/theme';
import { createAdminStore } from '../test/adminGateway';
import { storedFlashcardBank, storedQuestionBank } from '../test/contentFixtures';

function mount() {
  const store = createAdminStore(structuredClone(storedQuestionBank), structuredClone(storedFlashcardBank));
  const onDirtyChange = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <AdminWorkspace store={store} onDirtyChange={onDirtyChange} />
    </ThemeProvider>,
  );
  return { store, onDirtyChange };
}
const requests = (store: ReturnType<typeof mount>['store']) =>
  store.fetcher.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace('/api/admin', '')}`);
const quizNav = () => within(screen.getByRole('region', { name: 'Quiz navigator' }));
async function chooseSubject() {
  fireEvent.click(quizNav().getAllByTitle('Open')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Subject One · s1' }));
  await quizNav().findByRole('combobox', { name: 'Quiz' });
}

it('deletes a subject with its quizzes, items, decks and cards through one cascading request', async () => {
  const { store } = mount();
  await chooseSubject();
  fireEvent.click(quizNav().getByRole('button', { name: 'Subject actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject…' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete subject?' });
  expect(within(dialog).getByText('Affected: 1 subjects · 2 quizzes · 3 items · 2 decks · 2 cards.')).toBeVisible();
  expect(store.fetcher).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete subject' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(requests(store)).toEqual(['DELETE /draft/subjects/s1', 'GET /draft']);
  expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({ expectedVersion: 1, cascade: true });
  expect(store.snapshot.subjects.map((row) => row.id)).toEqual(['s2']);
  expect(store.snapshot.decks).toEqual([]);
});

it('deletes selected questions one request each, and shows a version conflict without losing the dialog', async () => {
  const { store } = mount();
  await chooseSubject();
  fireEvent.click(quizNav().getAllByTitle('Open')[1]);
  fireEvent.click(screen.getByRole('option', { name: 'First quiz · q1' }));
  fireEvent.click(await quizNav().findByRole('button', { name: 'Select' }));
  fireEvent.click(quizNav().getByRole('button', { name: 'Select this page' }));
  store.editElsewhere('questions', 'i3', { stem: 'Changed elsewhere' });
  fireEvent.click(quizNav().getByRole('button', { name: 'Delete selected…' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete selected items?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete selected items' }));
  expect(await within(dialog).findByText(/changed on the server/)).toBeVisible();
  // The first deletion committed; the stale one was refused and the local copy was refreshed.
  expect(store.snapshot.questions.map((row) => row.id)).toEqual(['i3', 'i2', 'i4']);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete selected items' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(store.snapshot.questions.map((row) => row.id)).toEqual(['i2', 'i4']);
});

it('keeps unsaved text in both tabs and reports it for the publish gate', async () => {
  const { onDirtyChange } = mount();
  fireEvent.click(screen.getByRole('tab', { name: 'Flashcards' }));
  const flashNav = within(screen.getByRole('region', { name: 'Flashcard navigator' }));
  fireEvent.click(flashNav.getAllByTitle('Open')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Subject One' }));
  await flashNav.findByRole('combobox', { name: 'Deck' });
  fireEvent.click(flashNav.getByRole('button', { name: 'Add decks' }));
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'JSON' }), { target: { value: '{ "decks": [] }' } });
  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith({ quizzes: false, flashcards: true }));
  expect(screen.getByRole('tab', { name: 'Flashcards', hidden: true })).toHaveAccessibleDescription(/Unsaved/);
});

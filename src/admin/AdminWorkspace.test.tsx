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
const quizNav = () => within(screen.getByRole('region', { name: 'Quiz navigator' }));
async function chooseSubject() {
  fireEvent.click(quizNav().getAllByTitle('Open')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Subject One · s1' }));
  await quizNav().findByRole('combobox', { name: 'Topic' });
}
async function chooseTopic() {
  await chooseSubject();
  fireEvent.click(quizNav().getAllByTitle('Open')[1]);
  fireEvent.click(screen.getByRole('option', { name: 'Topic 1 · t1' }));
  await quizNav().findByRole('combobox', { name: 'Quiz' });
}

it('deletes selected questions and shows a version conflict without losing the dialog', async () => {
  const { store } = mount();
  await chooseTopic();
  fireEvent.click(quizNav().getAllByTitle('Open')[2]);
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

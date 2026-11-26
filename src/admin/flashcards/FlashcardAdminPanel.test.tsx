import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { theme } from '../../shared/theme';
import { createAdminStore } from '../../test/adminGateway';
import { storedFlashcardBank, storedQuestionBank } from '../../test/contentFixtures';

function mount(blocked = false) {
  const store = createAdminStore(structuredClone(storedQuestionBank), structuredClone(storedFlashcardBank));
  const props = {
    onDelete: vi.fn(),
    onAddSubject: vi.fn(),
    onEditSubject: vi.fn(),
    onManageSubjects: vi.fn(),
    onDeleteSubject: vi.fn(),
    onDirtyChange: vi.fn(),
  };
  const element = (isBlocked: boolean) => (
    <ThemeProvider theme={theme}>
      <FlashcardAdminPanel store={store} blocked={isBlocked} {...props} />
    </ThemeProvider>
  );
  const view = render(element(blocked));
  return { store, props, ...view, setBlocked: (value: boolean) => view.rerender(element(value)) };
}
async function chooseTopic() {
  fireEvent.click(screen.getAllByTitle('Open')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Subject One' }));
  await screen.findByRole('combobox', { name: 'Topic' });
  fireEvent.click(screen.getAllByTitle('Open')[1]);
  fireEvent.click(screen.getByRole('option', { name: 'Topic 1' }));
  await screen.findByRole('combobox', { name: 'Deck' });
}
async function chooseDeck() {
  await chooseTopic();
  fireEvent.click(screen.getAllByTitle('Open')[2]);
  fireEvent.click(screen.getByRole('option', { name: 'Cranial nerves · 2 cards' }));
  await screen.findByRole('button', { name: /^1\. CN/ });
}
function action(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Record actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
}
const editor = () => {
  const tab = screen.queryByRole('tab', { name: 'JSON' });
  if (tab) fireEvent.click(tab);
  return screen.getByRole('textbox', { name: 'JSON' });
};
const openFirstCard = () => fireEvent.click(screen.getByRole('button', { name: /^1\. CN/ }));
const card = storedFlashcardBank.cards[0];
const openBulk = (button: string) => {
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Flashcard navigator' })).getByRole('button', { name: button }),
  );
  return screen.getByRole('dialog', { name: button === 'Add decks' ? 'Add Decks' : 'Add Cards' });
};

describe('flashcard editor over the record API', () => {
  it('creates a deck, adopts the server ID and shows it in the deck list', async () => {
    mount();
    await chooseTopic();
    action('New deck');
    expect(screen.getByRole('textbox', { name: 'ID' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'New saved deck' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'ID' })).toHaveValue('d-new91'));
    expect(screen.getByRole('combobox', { name: 'Deck' })).toHaveValue('New saved deck · 0 cards');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('rejects an ID change', async () => {
    const { store } = mount();
    await chooseDeck();
    openFirstCard();
    fireEvent.change(editor(), { target: { value: JSON.stringify({ ...card, id: 'f-9' }) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/IDs are stable and cannot be changed/)).toBeVisible();
    expect(store.find('card', 'f-1')).toMatchObject({ version: 1 });
  });

  it('does not send an invalid batch and keeps the batch JSON when the server stops part-way', async () => {
    const { store } = mount();
    await chooseTopic();
    const dialog = openBulk('Add decks');
    const json = within(dialog).getByRole('textbox', { name: 'JSON' });
    fireEvent.change(json, {
      target: { value: JSON.stringify({ decks: [{ name: 'Invalid', cards: [{ front: 'Front' }] }] }) },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('$.decks[0].cards[0].back'));
    expect(store.snapshot.decks).toHaveLength(2);
    const text = JSON.stringify({ decks: [{ name: 'Half saved', cards: [{ front: 'F', back: 'B' }] }] });
    fireEvent.change(json, { target: { value: text } });
    store.rejectNext([{ path: '$.records[0].front', code: 'blank', message: 'Front is required.' }], /\/bulk$/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/Already saved to the draft: parents d-new91/)).toBeVisible();
    expect(within(dialog).getByText(/\$\.records\[0\]\.front: Front is required\./)).toBeVisible();
    expect(json).toHaveValue(text);
  });

  it('keeps dirty record text until an explicit discard', async () => {
    mount();
    await chooseDeck();
    openFirstCard();
    const text = JSON.stringify({ ...card, back: 'Exact newer text\n$x^2$' });
    fireEvent.change(editor(), { target: { value: text } });
    action('New deck');
    const discard = screen.getByRole('dialog', { name: 'Discard unsaved edits?' });
    fireEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(editor()).toHaveValue(text));
    action('New deck');
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Discard unsaved edits?' })).getByRole('button', {
        name: 'Discard edits',
      }),
    );
    await waitFor(() =>
      expect(JSON.parse((editor() as HTMLInputElement).value)).toMatchObject({ id: '', name: 'New deck' }),
    );
  });

  it('blocks saves during another command while allowing newer text to be kept', async () => {
    const { setBlocked } = mount();
    await chooseDeck();
    openFirstCard();
    setBlocked(true);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record actions' })).toBeDisabled();
    const text = JSON.stringify({ ...card, front: 'Newer text while another command is running' });
    fireEvent.change(editor(), { target: { value: text } });
    expect(editor()).toHaveValue(text);
  });
});

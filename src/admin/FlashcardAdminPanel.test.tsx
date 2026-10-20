import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { theme } from '../shared/theme';
import { createAdminStore } from '../test/adminGateway';
import { storedFlashcardBank, storedQuestionBank } from '../test/contentFixtures';

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
const requests = (store: ReturnType<typeof mount>['store']) =>
  store.fetcher.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace('/api/admin', '')}`);
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
  fireEvent.click(within(screen.getByRole('region', { name: 'Flashcard navigator' })).getByRole('button', { name: button }));
  return screen.getByRole('dialog', { name: button === 'Add decks' ? 'Add Decks' : 'Add Cards' });
};

describe('flashcard editor over the record API', () => {
  it('creates a deck with one POST, adopts the server ID and shows it in the deck list', async () => {
    const { store } = mount();
    await chooseTopic();
    action('New deck');
    expect(screen.getByRole('textbox', { name: 'ID' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'New saved deck' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'ID' })).toHaveValue('d-new91'));
    expect(requests(store)).toEqual(['POST /draft/decks', 'GET /draft']);
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({ parentId: 't1', fields: { name: 'New saved deck' } });
    expect(screen.getByRole('combobox', { name: 'Deck' })).toHaveValue('New saved deck · 0 cards');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('saves a card edit as one patch of the changed field and shows the returned record', async () => {
    const { store } = mount();
    await chooseDeck();
    openFirstCard();
    fireEvent.change(editor(), { target: { value: JSON.stringify({ ...card, back: 'Exact newer text\n$x^2$' }) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.find('card', 'f-1')).toMatchObject({ back: 'Exact newer text\n$x^2$', version: 2 }));
    expect(requests(store)).toEqual(['PUT /draft/cards/f-1']);
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({
      expectedVersion: 1,
      fields: { back: 'Exact newer text\n$x^2$' },
    });
    expect(await screen.findByText(/Saved to the draft/)).toBeVisible();
  });

  it('keeps unsaved text and shows the server issues when the server rejects a write', async () => {
    const { store } = mount();
    await chooseDeck();
    openFirstCard();
    store.rejectNext([{ path: '$.record.front', code: 'unsafe', message: 'Unsupported HTML.' }]);
    const text = JSON.stringify({ ...card, front: '<script>x</script>' });
    fireEvent.change(editor(), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('$.record.front: Unsupported HTML.')).toBeVisible();
    expect(editor()).toHaveValue(text);
    expect(screen.getByRole('button', { name: /^1\. CN/ })).toHaveTextContent('CN');
    expect(store.find('card', 'f-1')).toMatchObject({ version: 1 });
  });

  it('shows the server version on a conflict and keeps the author text until they choose', async () => {
    const { store } = mount();
    await chooseDeck();
    openFirstCard();
    store.editElsewhere('cards', 'f-1', { back: 'Changed by someone else' });
    const text = JSON.stringify({ ...card, front: 'My front' });
    fireEvent.change(editor(), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/changed on the server after you opened it/)).toBeVisible();
    expect(editor()).toHaveValue(text);
    fireEvent.click(screen.getByText('Server version'));
    expect(screen.getByLabelText('Server version')).toHaveTextContent('Changed by someone else');
    fireEvent.click(screen.getByRole('button', { name: 'Keep my text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.find('card', 'f-1')).toMatchObject({ front: 'My front', back: 'Changed by someone else', version: 3 }));
  });

  it('rejects an ID change before making any request', async () => {
    const { store } = mount();
    await chooseDeck();
    openFirstCard();
    fireEvent.change(editor(), { target: { value: JSON.stringify({ ...card, id: 'f-9' }) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/IDs are stable and cannot be changed/)).toBeVisible();
    expect(store.fetcher).not.toHaveBeenCalled();
  });

  it('adds nested decks and cards in bulk: one create per deck and one bulk request per populated deck', async () => {
    const { store } = mount();
    await chooseTopic();
    const dialog = openBulk('Add decks');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'JSON' }), {
      target: {
        value: JSON.stringify({
          decks: [{ name: 'Nested deck', cards: [{ front: 'Exact $x^2$ front', back: 'Back\n' }] }, { name: 'Empty deck' }],
        }),
      },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests(store)).toEqual([
      'POST /draft/decks',
      'POST /draft/decks/d-new91/cards/bulk',
      'POST /draft/decks',
      'GET /draft',
    ]);
    expect(JSON.parse(store.fetcher.mock.calls[1][1]!.body as string)).toEqual({
      records: [{ front: 'Exact $x^2$ front', back: 'Back\n' }],
    });
    expect(store.snapshot.decks.map((deck) => deck.name)).toEqual(['Cranial nerves', 'No cards yet', 'Nested deck', 'Empty deck']);
    expect(screen.getByRole('combobox', { name: 'Deck' })).toHaveValue('Nested deck · 1 cards');
  });

  it('does not send an invalid batch and keeps the batch JSON when the server stops part-way', async () => {
    const { store } = mount();
    await chooseTopic();
    const dialog = openBulk('Add decks');
    const json = within(dialog).getByRole('textbox', { name: 'JSON' });
    fireEvent.change(json, { target: { value: JSON.stringify({ decks: [{ name: 'Invalid', cards: [{ front: 'Front' }] }] }) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('$.decks[0].cards[0].back'));
    expect(store.fetcher).not.toHaveBeenCalled();
    const text = JSON.stringify({ decks: [{ name: 'Half saved', cards: [{ front: 'F', back: 'B' }] }] });
    fireEvent.change(json, { target: { value: text } });
    store.rejectNext([{ path: '$.records[0].front', code: 'blank', message: 'Front is required.' }], /\/bulk$/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/Already saved to the draft: parents d-new91/)).toBeVisible();
    expect(within(dialog).getByText(/\$\.records\[0\]\.front: Front is required\./)).toBeVisible();
    expect(json).toHaveValue(text);
  });

  it('moves a card up or down with the move route and follows it in the list', async () => {
    const { store } = mount();
    await chooseDeck();
    openFirstCard();
    fireEvent.click(screen.getByRole('button', { name: 'Record actions' }));
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => expect(store.snapshot.cards.map((row) => row.id)).toEqual(['f-2', 'f-1']));
    expect(requests(store)).toEqual(['POST /draft/cards/f-1/move', 'GET /draft']);
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({ expectedVersion: 1, afterId: 'f-2' });
    await waitFor(() => expect(screen.getByRole('button', { name: /^2\. CN/ })).toHaveClass('Mui-selected'));
  });

  it('asks for delete confirmation through the shared dialog instead of deleting', async () => {
    const { props, store } = mount();
    await chooseDeck();
    openFirstCard();
    action('Delete…');
    expect(props.onDelete).toHaveBeenCalledWith({ selection: { kind: 'card', id: 'f-1' }, label: 'f-1' });
    expect(store.fetcher).not.toHaveBeenCalled();
  });

  it('deletes ticked decks from the deck list together', async () => {
    const { props } = mount();
    await chooseTopic();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select deck d-cranial' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select deck d-empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected…' }));
    expect(props.onDelete).toHaveBeenCalledWith({
      selection: { kind: 'deck', parentId: 't1' },
      ids: ['d-cranial', 'd-empty'],
      label: '2 selected decks',
    });
  });

  it('keeps dirty record text until an explicit discard', async () => {
    const { store } = mount();
    await chooseDeck();
    openFirstCard();
    const text = JSON.stringify({ ...card, back: 'Exact newer text\n$x^2$' });
    fireEvent.change(editor(), { target: { value: text } });
    action('New deck');
    const discard = screen.getByRole('dialog', { name: 'Discard unsaved edits?' });
    fireEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(editor()).toHaveValue(text));
    expect(store.fetcher).not.toHaveBeenCalled();
    action('New deck');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard unsaved edits?' })).getByRole('button', { name: 'Discard edits' }));
    await waitFor(() => expect(JSON.parse((editor() as HTMLInputElement).value)).toMatchObject({ id: '', name: 'New deck' }));
  });

  it('blocks saves during another command while allowing newer text to be kept', async () => {
    const { setBlocked, store } = mount();
    await chooseDeck();
    openFirstCard();
    setBlocked(true);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record actions' })).toBeDisabled();
    const text = JSON.stringify({ ...card, front: 'Newer text while another command is running' });
    fireEvent.change(editor(), { target: { value: text } });
    expect(editor()).toHaveValue(text);
    expect(store.fetcher).not.toHaveBeenCalled();
  });

  it('removes a record from view when it disappears from the server', async () => {
    const { store } = mount();
    await chooseDeck();
    openFirstCard();
    await store.remove('card', [{ id: 'f-1', version: 1 }]);
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'JSON' })).toBeNull());
    expect(screen.queryByText(/olfactorius/)).toBeNull();
  });
});

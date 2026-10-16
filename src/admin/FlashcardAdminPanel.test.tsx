import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminRecoveryBanner } from './components/AdminRecoveryBanner';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { theme } from '../shared/theme';
import type { StoredFlashcardBank } from '../content/schema/schema';

const subjects = [{ id: 's1', name: 'Subject', accent: '#123456' }];
const bank = (): StoredFlashcardBank => ({
  schemaVersion: 2,
  decks: [{ id: 'd1', subjectId: 's1', name: 'Deck' }],
  cards: [{ id: 'f1', deckId: 'd1', front: 'Front', back: 'Back' }],
});
function mount(save = vi.fn(async (next: StoredFlashcardBank) => next)) {
  const props = { subjects, serverBank: bank(), quizRevision: 'quiz-revision', onSaveBank: save };
  const view = render(
    <ThemeProvider theme={theme}>
      <FlashcardAdminPanel {...props} />
    </ThemeProvider>,
  );
  return { ...view, save, props };
}
function chooseSubject() {
  fireEvent.click(screen.getAllByTitle('Open')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Subject' }));
}
function chooseDeck() {
  chooseSubject();
  fireEvent.click(screen.getAllByTitle('Open')[1]);
  fireEvent.click(screen.getByRole('option', { name: 'Deck · 1 cards' }));
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
function edit(value: unknown) {
  fireEvent.change(editor(), { target: { value: JSON.stringify(value) } });
}
afterEach(() => vi.restoreAllMocks());

describe('PostgreSQL flashcard editor', () => {
  it('installs only the successful receipt and adopts reserved IDs for new records', async () => {
    const saved = { ...bank(), decks: [...bank().decks, { id: 'd42', subjectId: 's1', name: 'New saved deck' }] };
    const { save } = mount(vi.fn().mockResolvedValue(saved));
    chooseSubject();
    action('New deck');
    const template = JSON.parse((editor() as HTMLInputElement).value);
    edit({ ...template, name: 'New saved deck' });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(editor()).toHaveValue(JSON.stringify(saved.decks[1], null, 2)));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].decks.at(-1)!.id).toBe(template.id);
    expect(screen.getByRole('combobox', { name: 'Deck' })).toHaveValue('New saved deck · 0 cards');
    expect(screen.queryByRole('button', { name: 'Workspace' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('keeps unsaved text and the saved bank when HTTP rejects a write', async () => {
    const { save } = mount(vi.fn().mockRejectedValue(new Error('Draft context changed')));
    chooseDeck();
    fireEvent.click(screen.getByRole('button', { name: /1\. Front/ }));
    const text = JSON.stringify({ ...bank().cards[0], front: 'Unsaved front' });
    fireEvent.change(editor(), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/Draft context changed/)).toBeVisible();
    expect(editor()).toHaveValue(text);
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /1\. Front/ })).toHaveTextContent('Front');
  });

  it('protects unsaved text across a server refresh and clears it only on explicit discard', async () => {
    const { props, rerender } = mount();
    chooseDeck();
    fireEvent.click(screen.getByRole('button', { name: /1\. Front/ }));
    edit({ ...bank().cards[0], front: 'Unsaved text' });
    const text = (editor() as HTMLInputElement).value;
    rerender(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel
          {...props}
          serverBank={{ ...bank(), cards: [{ ...bank().cards[0], back: 'Server update' }] }}
        />
      </ThemeProvider>,
    );
    expect(editor()).toHaveValue(text);
    rerender(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} discardRequest={1} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'JSON' })).not.toBeInTheDocument());
  });

  it('rejects malformed edits before making a durable request', async () => {
    const { save } = mount();
    chooseDeck();
    fireEvent.click(screen.getByRole('button', { name: /1\. Front/ }));
    edit({ ...bank().cards[0], id: 'f2', front: 'Changed ID' });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/IDs are stable and cannot be changed/)).toBeVisible();
    expect(save).not.toHaveBeenCalled();
  });

  it('requires a valid bulk preview and saves nested decks and cards in one request', async () => {
    const { save } = mount();
    chooseSubject();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Flashcard navigator' })).getByRole('button', { name: 'Add decks' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Add Decks' });
    const json = within(dialog).getByRole('textbox', { name: 'JSON' });
    fireEvent.change(json, {
      target: {
        value: JSON.stringify({
          decks: [
            { name: 'Nested deck', cards: [{ front: 'Exact $x^2$ front', back: 'Back\n' }] },
            { name: 'Empty deck' },
          ],
        }),
      },
    });
    expect(within(dialog).queryByRole('button', { name: 'Save draft' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Preview' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const candidate = save.mock.calls[0][0];
    expect(candidate.decks.map((row) => row.name)).toEqual(['Deck', 'Nested deck', 'Empty deck']);
    expect(candidate.cards[1]).toMatchObject({
      deckId: candidate.decks[1].id,
      front: 'Exact $x^2$ front',
      back: 'Back\n',
    });
    expect(candidate.cards[0]).toEqual(bank().cards[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does not save an invalid nested card or reuse a preview after its text changes', async () => {
    const { save } = mount();
    chooseSubject();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Flashcard navigator' })).getByRole('button', { name: 'Add decks' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Add Decks' });
    const json = within(dialog).getByRole('textbox', { name: 'JSON' });
    fireEvent.change(json, {
      target: { value: JSON.stringify({ decks: [{ name: 'Invalid', cards: [{ front: 'Front' }] }] }) },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeVisible());
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(json, { target: { value: JSON.stringify({ decks: [{ name: 'Valid', cards: [] }] }) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Preview' }));
    await within(dialog).findByRole('button', { name: 'Save draft' });
    fireEvent.change(json, { target: { value: JSON.stringify({ decks: [{ name: 'Changed', cards: [] }] }) } });
    expect(within(dialog).queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});

it('blocks flashcard saves during another command while allowing newer text to be kept', () => {
  const { props, rerender, save } = mount();
  chooseDeck();
  fireEvent.click(screen.getByRole('button', { name: /1\. Front/ }));
  const onEdit = vi.fn();
  rerender(
    <ThemeProvider theme={theme}>
      <FlashcardAdminPanel {...props} externalBusy onEdit={onEdit} />
    </ThemeProvider>,
  );
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Record actions' })).toBeDisabled();
  const text = JSON.stringify({ ...bank().cards[0], front: 'Newer text while another command is running' });
  fireEvent.change(editor(), { target: { value: text } });
  expect(editor()).toHaveValue(text);
  expect(onEdit).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});

it('keeps save-status recovery reachable inside a blocked bulk dialog without discarding its JSON', () => {
  const { props, rerender, save } = mount();
  chooseSubject();
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Flashcard navigator' })).getByRole('button', { name: 'Add decks' }),
  );
  const dialog = screen.getByRole('dialog', { name: 'Add Decks' });
  const json = within(dialog).getByRole('textbox', { name: 'JSON' });
  const text = '{"decks":[{"name":"Retained batch","cards":[{"front":"Exact front","back":"Exact back"}]}]}';
  fireEvent.change(json, { target: { value: text } });
  const check = vi.fn();
  rerender(
    <ThemeProvider theme={theme}>
      <FlashcardAdminPanel {...props} externalBusy recovery={<AdminRecoveryBanner busy={false} onCheck={check} />} />
    </ThemeProvider>,
  );
  expect(json).toHaveValue(text);
  expect(within(dialog).getByRole('button', { name: 'Preview' })).toBeDisabled();
  const recovery = within(dialog).getByRole('button', { name: 'Check save status' });
  expect(recovery).toBeEnabled();
  fireEvent.click(recovery);
  expect(check).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  const signIn = vi.fn();
  rerender(
    <ThemeProvider theme={theme}>
      <FlashcardAdminPanel
        {...props}
        externalBusy
        recovery={<AdminRecoveryBanner busy={false} onCheck={check} onSignIn={signIn} />}
      />
    </ThemeProvider>,
  );
  expect(within(dialog).getByRole('button', { name: 'Check save status' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in to continue' }));
  expect(signIn).toHaveBeenCalledOnce();
  expect(json).toHaveValue(text);
});

it('keeps dirty record text until an explicit discard and saves the entered reason', async () => {
  const { save } = mount();
  chooseDeck();
  fireEvent.click(screen.getByRole('button', { name: /1\. Front/ }));
  const text = JSON.stringify({ ...bank().cards[0], back: 'Exact newer text\n$x^2$' });
  fireEvent.change(editor(), { target: { value: text } });
  action('New deck');
  const discard = screen.getByRole('dialog', { name: 'Discard unsaved edits?' });
  fireEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }));
  await waitFor(() => expect(editor()).toHaveValue(text));
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Change reason' }), {
    target: { value: 'Preserve source formatting' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.anything(), 'Preserve source formatting'));
  expect(save.mock.calls[0][0].cards[0].back).toBe('Exact newer text\n$x^2$');
  action('New deck');
  // After a successful save there is no unsaved record text to discard.
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('keeps a newer form draft editable during a held create and adopts only the reserved ID', async () => {
  let finish!: (value: StoredFlashcardBank) => void;
  const save = vi.fn(
    () =>
      new Promise<StoredFlashcardBank>((resolve) => {
        finish = resolve;
      }),
  );
  mount(save);
  chooseSubject();
  action('New deck');
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Captured name' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(screen.getByRole('textbox', { name: 'Name' })).not.toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Newer exact $x^2$ name' } });
  finish({ ...bank(), decks: [...bank().decks, { id: 'd-reserved', subjectId: 's1', name: 'Captured name' }] });
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'ID' })).toHaveValue('d-reserved'));
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Newer exact $x^2$ name');
  expect(screen.getByText('Unsaved edits')).toBeVisible();
  expect(save).toHaveBeenCalledOnce();
});

it('keeps newer batch JSON after a captured batch commits without replaying it', async () => {
  let finish!: (value: StoredFlashcardBank) => void;
  const save = vi.fn(
    () =>
      new Promise<StoredFlashcardBank>((resolve) => {
        finish = resolve;
      }),
  );
  mount(save);
  chooseSubject();
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Flashcard navigator' })).getByRole('button', { name: 'Add decks' }),
  );
  const dialog = screen.getByRole('dialog', { name: 'Add Decks' });
  const json = within(dialog).getByRole('textbox', { name: 'JSON' });
  fireEvent.change(json, { target: { value: JSON.stringify({ decks: [{ name: 'Captured batch' }] }) } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Preview' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const newer = JSON.stringify({ decks: [{ name: 'Newer exact batch\n' }] });
  fireEvent.change(json, { target: { value: newer } });
  finish({ ...bank(), decks: [...bank().decks, { id: 'd-reserved', subjectId: 's1', name: 'Captured batch' }] });
  await waitFor(() => expect(within(dialog).getByText(/captured batch was saved/)).toBeVisible());
  expect(json).toHaveValue(newer);
  expect(save).toHaveBeenCalledOnce();
});

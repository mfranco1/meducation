import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SubjectEditorDialog } from './SubjectEditorDialog';
import { createAdminStore } from '../test/adminGateway';
import { emptyFlashcardBank, storedQuestionBank } from '../test/contentFixtures';

const open = () => createAdminStore(structuredClone(storedQuestionBank), structuredClone(emptyFlashcardBank));

it('edits a shared subject with one patch, leaves other records alone and closes only after saving', async () => {
  const store = open();
  const close = vi.fn();
  render(<SubjectEditorDialog store={store} initialId="s1" blocked={false} onDirtyChange={() => {}} onClose={close} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
  const editor = screen.getByRole('textbox', { name: 'JSON' });
  const original = JSON.parse((editor as HTMLInputElement).value);
  fireEvent.change(editor, { target: { value: JSON.stringify({ ...original, name: 'Exact shared subject $x^2$' }) } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(store.fetcher.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual(['PUT /api/admin/draft/subjects/s1']);
  expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({
    expectedVersion: 1,
    fields: { name: 'Exact shared subject $x^2$' },
  });
  expect(store.snapshot.subjects[0]).toMatchObject({ ...original, name: 'Exact shared subject $x^2$', version: 2 });
  expect(store.snapshot.questions).toHaveLength(storedQuestionBank.questions.length);
});

it('creates a new subject and lets the server assign its ID', async () => {
  const store = open();
  const close = vi.fn();
  render(<SubjectEditorDialog store={store} blocked={false} onDirtyChange={() => {}} onClose={close} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: 'ID' })).toHaveValue('');
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Brand new' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(store.snapshot.subjects.at(-1)).toMatchObject({ id: 's91', name: 'Brand new' });
});

it('shows server validation issues and keeps the dialog and text', async () => {
  const store = open();
  const close = vi.fn();
  render(<SubjectEditorDialog store={store} initialId="s1" blocked={false} onDirtyChange={() => {}} onClose={close} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument());
  store.rejectNext([{ path: '$.record.name', code: 'blank', message: 'Name is required.' }]);
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: ' ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('$.record.name: Name is required.')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(' ');
  expect(close).not.toHaveBeenCalled();
});

it('keeps exact invalid subject JSON on a declined close without saving', async () => {
  const store = open();
  const close = vi.fn();
  render(<SubjectEditorDialog store={store} blocked={false} onDirtyChange={() => {}} onClose={close} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'JSON' }), { target: { value: '{ exact invalid source\n' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  const discard = await screen.findByRole('dialog', { name: 'Discard unsaved edits?' });
  fireEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'JSON' })).toHaveValue('{ exact invalid source\n'));
  expect(close).not.toHaveBeenCalled();
  expect(store.fetcher).not.toHaveBeenCalled();
});

it('waits for command admission before initializing a subject editor', async () => {
  const store = open();
  const props = { store, initialId: 's1', onDirtyChange: vi.fn(), onClose: vi.fn() };
  const view = render(<SubjectEditorDialog {...props} blocked />);
  const editor = screen.getByRole('textbox', { name: 'JSON' });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Saved subject' })).toBeDisabled());
  expect(editor).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  view.rerender(<SubjectEditorDialog {...props} blocked={false} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(storedQuestionBank.subjects[0].name));
  fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
  expect(JSON.parse((screen.getByRole('textbox', { name: 'JSON' }) as HTMLInputElement).value)).toEqual(storedQuestionBank.subjects[0]);
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SubjectEditorDialog } from './SubjectEditorDialog';
import { InMemoryQuestionBankGateway } from '../test/InMemoryQuestionBankGateway';
import { emptyFlashcardBank, storedQuestionBank } from '../test/contentFixtures';

it('edits a shared subject without changing other records and closes only after saving', async () => {
  const gateway = new InMemoryQuestionBankGateway(structuredClone(storedQuestionBank), emptyFlashcardBank);
  const close = vi.fn();
  render(
    <SubjectEditorDialog
      gateway={gateway}
      initialId={storedQuestionBank.subjects[0].id}
      blocked={false}
      onDirtyChange={() => {}}
      onClose={close}
    />,
  );
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
  const editor = screen.getByRole('textbox', { name: 'JSON' });
  const original = JSON.parse((editor as HTMLInputElement).value);
  fireEvent.change(editor, { target: { value: JSON.stringify({ ...original, name: 'Exact shared subject $x^2$' }) } });
  fireEvent.click(screen.getByRole('button', { name: 'Review save' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  const next = await gateway.load();
  expect(next.bank.subjects[0]).toEqual({ ...original, name: 'Exact shared subject $x^2$' });
  expect(next.bank.questions).toEqual(storedQuestionBank.questions);
});
it('keeps exact invalid subject JSON on a declined close without saving', async () => {
  const gateway = new InMemoryQuestionBankGateway(structuredClone(storedQuestionBank), emptyFlashcardBank);
  const close = vi.fn();
  render(<SubjectEditorDialog gateway={gateway} blocked={false} onDirtyChange={() => {}} onClose={close} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
  const editor = screen.getByRole('textbox', { name: 'JSON' });
  fireEvent.change(editor, { target: { value: '{ exact invalid source\n' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  const discard = await screen.findByRole('dialog', { name: 'Discard unsaved edits?' });
  fireEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'JSON' })).toHaveValue('{ exact invalid source\n'));
  expect(close).not.toHaveBeenCalled();
  expect((await gateway.load()).bank).toEqual(storedQuestionBank);
});

it('waits for command admission before initializing a subject editor', async () => {
  const gateway = new InMemoryQuestionBankGateway(structuredClone(storedQuestionBank), emptyFlashcardBank);
  const props = { gateway, initialId: storedQuestionBank.subjects[0].id, onDirtyChange: vi.fn(), onClose: vi.fn() };
  const view = render(<SubjectEditorDialog {...props} blocked />);
  const editor = screen.getByRole('textbox', { name: 'JSON' });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Saved subject' })).toBeDisabled());
  expect(editor).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Review save' })).toBeDisabled();
  view.rerender(<SubjectEditorDialog {...props} blocked={false} />);
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(storedQuestionBank.subjects[0].name),
  );
  fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
  expect(JSON.parse((screen.getByRole('textbox', { name: 'JSON' }) as HTMLInputElement).value)).toEqual(
    storedQuestionBank.subjects[0],
  );
});

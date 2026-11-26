import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuizAdminPanel } from './QuizAdminPanel';
import { theme } from '../../shared/theme';
import { createAdminStore } from '../../test/adminGateway';
import { emptyFlashcardBank, storedQuestionBank } from '../../test/contentFixtures';

function mount() {
  const store = createAdminStore(structuredClone(storedQuestionBank), structuredClone(emptyFlashcardBank));
  const props = { onDelete: vi.fn(), onManageSubjects: vi.fn(), onDirtyChange: vi.fn() };
  const view = render(
    <ThemeProvider theme={theme}>
      <QuizAdminPanel store={store} {...props} />
    </ThemeProvider>,
  );
  return { store, props, ...view };
}
const navigator = () => within(screen.getByRole('region', { name: 'Quiz navigator' }));
const frame = () => within(screen.getByRole('region', { name: 'Quiz editor' }));
async function chooseSubject() {
  fireEvent.click(navigator().getAllByTitle('Open')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Subject One · s1' }));
  await navigator().findByRole('combobox', { name: 'Topic' });
}
async function chooseQuiz() {
  await chooseSubject();
  fireEvent.click(navigator().getAllByTitle('Open')[1]);
  fireEvent.click(screen.getByRole('option', { name: 'Topic 1 · t1' }));
  await navigator().findByRole('combobox', { name: 'Quiz' });
  fireEvent.click(navigator().getAllByTitle('Open')[2]);
  fireEvent.click(screen.getByRole('option', { name: 'First quiz · q1' }));
  await navigator().findByRole('button', { name: /1\. i1/ });
}
async function openQuestion() {
  await chooseQuiz();
  fireEvent.click(navigator().getByRole('button', { name: /1\. i1/ }));
  return await frame().findByRole('textbox', { name: 'Question stem' });
}
const jsonEditor = () => {
  fireEvent.click(frame().getByRole('tab', { name: 'JSON' }));
  return frame().getByRole('textbox', { name: 'JSON' }) as HTMLTextAreaElement;
};

describe('quiz editor over the record API', () => {
  it('creates a new question under the selected quiz with a server-assigned ID', async () => {
    const { store } = mount();
    await openQuestion();
    fireEvent.click(frame().getByRole('button', { name: 'Record actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New item' }));
    await waitFor(() => expect(frame().getByRole('textbox', { name: 'ID' })).toHaveValue(''));
    fireEvent.change(frame().getByRole('textbox', { name: 'Question stem' }), { target: { value: 'A new stem' } });
    fireEvent.click(frame().getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(frame().getByRole('textbox', { name: 'ID' })).toHaveValue('i91'));
    expect(store.snapshot.questions.map((row) => row.id)).toEqual(['i1', 'i3', 'i91', 'i2', 'i4']);
  });

  it('does not send invalid batch JSON and keeps it, including after a server refusal', async () => {
    const { store } = mount();
    await chooseSubject();
    fireEvent.click(frame().getByRole('tab', { name: 'Add' }));
    const json = await frame().findByRole('textbox', { name: 'JSON' });
    fireEvent.change(json, { target: { value: '{ "topics": [{ "name": "X", "quizzes": [] }] }' } });
    fireEvent.click(frame().getByRole('button', { name: 'Save' }));
    expect(await frame().findByText('$.topics[0].quizzes must be a non-empty array.')).toBeVisible();
    expect(store.snapshot.topics).toHaveLength(2);
    const text = JSON.stringify({
      topics: [
        {
          name: 'X',
          quizzes: [{ name: 'Q', items: [{ stem: 'S', choices: ['A', 'B'], answer: 'A', rationale: 'R' }] }],
        },
      ],
    });
    fireEvent.change(json, { target: { value: text } });
    store.rejectNext([{ path: '$.records[0].stem', code: 'blank', message: 'Stem is required.' }], /\/bulk$/);
    fireEvent.click(frame().getByRole('button', { name: 'Save' }));
    expect(await frame().findByText(/Already saved to the draft: topics t91; parents q91/)).toBeVisible();
    expect(json).toHaveValue(text);
  });

  it('asks before leaving the Add tab with unsaved batch JSON', async () => {
    mount();
    fireEvent.click(frame().getByRole('tab', { name: 'Add' }));
    const json = await frame().findByRole('textbox', { name: 'JSON' });
    fireEvent.change(json, { target: { value: '{ "unsaved": true }' } });
    fireEvent.click(frame().getByRole('tab', { name: 'Record' }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard unsaved edits?' })).getByRole('button', {
        name: 'Keep editing',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(frame().getByRole('textbox', { name: 'JSON' })).toHaveValue('{ "unsaved": true }');
  });

  it('keeps a cleared record editor open and reports unsaved text', async () => {
    const { props } = mount();
    await openQuestion();
    const editor = jsonEditor();
    fireEvent.change(editor, { target: { value: '' } });
    expect(editor).toBeVisible();
    expect(editor).toBeEnabled();
    await waitFor(() => expect(props.onDirtyChange).toHaveBeenLastCalledWith(true));
  });
});

import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuizAdminPanel } from './QuizAdminPanel';
import { theme } from '../shared/theme';
import { createAdminStore } from '../test/adminGateway';
import { emptyFlashcardBank, storedQuestionBank } from '../test/contentFixtures';

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
const requests = (store: ReturnType<typeof mount>['store']) =>
  store.fetcher.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace('/api/admin', '')}`);
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
  it('edits a question with one patch and shows the saved record', async () => {
    const { store } = mount();
    const stem = await openQuestion();
    fireEvent.change(stem, { target: { value: 'Exact stem $x^2$\n' } });
    fireEvent.click(frame().getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.find('question', 'i1')).toMatchObject({ stem: 'Exact stem $x^2$\n', version: 2 }));
    expect(requests(store)).toEqual(['PUT /draft/questions/i1']);
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({ expectedVersion: 1, fields: { stem: 'Exact stem $x^2$\n' } });
    expect(await frame().findByText(/Saved to the draft/)).toBeVisible();
    expect(frame().getByRole('textbox', { name: 'Question stem' })).toHaveValue('Exact stem $x^2$\n');
  });

  it('shows the server issues and keeps the text when a save is rejected', async () => {
    const { store } = mount();
    await openQuestion();
    store.rejectNext([{ path: '$.record.choices[0].text', code: 'blank', message: 'Choice text is required.' }]);
    const editor = jsonEditor();
    const text = JSON.stringify({ ...JSON.parse(editor.value), rationale: 'x' });
    fireEvent.change(editor, { target: { value: text } });
    fireEvent.click(frame().getByRole('button', { name: 'Save' }));
    expect(await frame().findByText('$.record.choices[0].text: Choice text is required.')).toBeVisible();
    expect(editor).toHaveValue(text);
  });

  it('creates a new question under the selected quiz with a server-assigned ID', async () => {
    const { store } = mount();
    await openQuestion();
    fireEvent.click(frame().getByRole('button', { name: 'Record actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New item' }));
    await waitFor(() => expect(frame().getByRole('textbox', { name: 'ID' })).toHaveValue(''));
    fireEvent.change(frame().getByRole('textbox', { name: 'Question stem' }), { target: { value: 'A new stem' } });
    fireEvent.click(frame().getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(frame().getByRole('textbox', { name: 'ID' })).toHaveValue('i91'));
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toMatchObject({ parentId: 'q1', fields: { stem: 'A new stem' } });
    expect(store.snapshot.questions.map((row) => row.id)).toEqual(['i1', 'i3', 'i91', 'i2', 'i4']);
  });

  it('adds a topic, quizzes and questions from content-only JSON with one request per step', async () => {
    const { store } = mount();
    await chooseSubject();
    fireEvent.click(frame().getByRole('tab', { name: 'Add' }));
    const json = await frame().findByRole('textbox', { name: 'JSON' });
    fireEvent.change(json, {
      target: {
        value: JSON.stringify({
          topics: [{ name: 'Second topic', quizzes: [{ name: 'Second quiz', items: [{ stem: 'New stem', choices: ['A', 'B'], answer: 'A', rationale: 'New rationale' }] }] }],
        }),
      },
    });
    fireEvent.click(frame().getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.snapshot.topics).toHaveLength(3));
    expect(store.snapshot.topics.find((row) => row.id === 't91')).toMatchObject({ id: 't91', subjectId: 's1', name: 'Second topic' });
    expect(requests(store)).toEqual(['POST /draft/topics', 'POST /draft/quizzes', 'POST /draft/quizzes/q91/questions/bulk', 'GET /draft']);
    expect(store.snapshot.questions.at(-1)).toMatchObject({ quizId: 'q91', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }] });
    // The new quiz is selected afterwards.
    await navigator().findByRole('button', { name: /1\. i91/ });
  });

  it('does not send invalid batch JSON and keeps it, including after a server refusal', async () => {
    const { store } = mount();
    await chooseSubject();
    fireEvent.click(frame().getByRole('tab', { name: 'Add' }));
    const json = await frame().findByRole('textbox', { name: 'JSON' });
    fireEvent.change(json, { target: { value: '{ "topics": [{ "name": "X", "quizzes": [] }] }' } });
    fireEvent.click(frame().getByRole('button', { name: 'Save' }));
    expect(await frame().findByText('$.topics[0].quizzes must be a non-empty array.')).toBeVisible();
    expect(store.fetcher).not.toHaveBeenCalled();
    const text = JSON.stringify({
      topics: [{ name: 'X', quizzes: [{ name: 'Q', items: [{ stem: 'S', choices: ['A', 'B'], answer: 'A', rationale: 'R' }] }] }],
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
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Discard unsaved edits?' })).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(frame().getByRole('textbox', { name: 'JSON' })).toHaveValue('{ "unsaved": true }');
  });

  it('reorders a question with the move route and hands deletion to the shared dialog', async () => {
    const { store, props } = mount();
    await openQuestion();
    fireEvent.click(frame().getByRole('button', { name: 'Record actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => expect(store.snapshot.questions.map((row) => row.id)).toEqual(['i3', 'i1', 'i2', 'i4']));
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({ expectedVersion: 1, afterId: 'i3' });
    fireEvent.click(frame().getByRole('button', { name: 'Record actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    expect(props.onDelete).toHaveBeenCalledWith({ selection: { kind: 'question', id: 'i1', parentId: 'q1' }, label: 'i1' });
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

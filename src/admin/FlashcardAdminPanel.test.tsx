import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { theme } from '../app/theme';
import { storedQuestionBank } from '../content/questionBank';
import type { StoredFlashcardBank, StoredQuestionBank } from '../content/schema';
import { revisionForBank } from './core/serializeBank';
import { flashcardContentRevision, storedFlashcardBank } from '../content/flashcardBank';
import { sha256Text } from '../domain/contentDigest';
import {
  applyFlashcardOperations,
  type FlashcardAdminChangeSet,
  type FlashcardAdminOperation,
} from './core/flashcardChangeSet';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stageRecord(value: object) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Record JSON' }), { target: { value: JSON.stringify(value) } });
  fireEvent.click(screen.getByRole('button', { name: 'Stage record' }));
}

async function importFile() {
  const operations: FlashcardAdminOperation[] = [
    { op: 'deck.create', value: { id: 'd-import', subjectId: 's1', name: 'Imported deck' } },
  ];
  const result = applyFlashcardOperations(storedFlashcardBank, props.subjects, operations);
  const subjectRevision = await sha256Text(JSON.stringify(props.subjects));
  const changeSet: FlashcardAdminChangeSet = {
    changeSetVersion: 2,
    base: { schemaVersion: 2, revision: await flashcardContentRevision(storedFlashcardBank), subjectRevision },
    resultRevision: await flashcardContentRevision(result, props.subjects),
    resultSubjectRevision: subjectRevision,
    reason: 'Reviewed import',
    operations,
  };
  return { text: async () => JSON.stringify(changeSet) } as File;
}

const props = {
  subjects: storedQuestionBank.subjects,
  onBankChange: () => {},
  quizRevision: 'quiz-current',
  originalQuizRevision: 'quiz-base',
  quizChangesStaged: false,
};

describe('FlashcardAdminPanel', () => {
  it('confirms a paired reset, preserves drafts on failure, and clears them only on success', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onResetPaired = vi
      .fn()
      .mockRejectedValueOnce(new Error('Reset unavailable'))
      .mockResolvedValueOnce(undefined);
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel
          {...props}
          subjects={props.subjects.slice(0, 1)}
          quizChangesStaged
          onResetPaired={onResetPaired}
        />
      </ThemeProvider>,
    );
    const editor = screen.getByRole('textbox', { name: 'Record JSON' });
    fireEvent.change(editor, { target: { value: 'Unstaged draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset both banks' }));
    expect(onResetPaired).not.toHaveBeenCalled();
    expect(editor).toHaveValue('Unstaged draft');
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset both banks' }));
    expect(await screen.findByText('Reset unavailable')).toBeVisible();
    expect(editor).toHaveValue('Unstaged draft');
    fireEvent.click(screen.getByRole('button', { name: 'Reset both banks' }));
    await waitFor(() => expect(editor).toHaveValue(''));
    expect(onResetPaired).toHaveBeenLastCalledWith(storedFlashcardBank);
    expect(screen.queryByText('Reset unavailable')).toBeNull();
  });
  it('previews a coordinated bundle and stages both snapshots through the atomic callback', async () => {
    const quizBank: StoredQuestionBank = {
      schemaVersion: 4,
      subjects: props.subjects.slice(0, 2),
      quizzes: [],
      questions: [],
    };
    const resultSubjects = quizBank.subjects.slice(1);
    const operations: FlashcardAdminOperation[] = [
      { op: 'deck.create', value: { id: 'd-paired', subjectId: 's2', name: 'Paired deck' } },
    ];
    const result = applyFlashcardOperations(storedFlashcardBank, resultSubjects, operations);
    const quizChangeSet = {
      changeSetVersion: 1,
      base: { bankSchemaVersion: 4, revision: await revisionForBank(quizBank) },
      reason: 'Shared subject cleanup',
      operations: [{ op: 'subject.delete', id: 's1', cascade: true }],
    };
    const flashcardChangeSet = {
      changeSetVersion: 2,
      base: {
        schemaVersion: 2,
        revision: await flashcardContentRevision(storedFlashcardBank, quizBank.subjects),
        subjectRevision: await sha256Text(JSON.stringify(quizBank.subjects)),
      },
      resultRevision: await flashcardContentRevision(result, resultSubjects),
      resultSubjectRevision: await sha256Text(JSON.stringify(resultSubjects)),
      reason: 'Reviewed paired deck',
      operations,
    };
    const file = {
      text: async () => JSON.stringify({ bundleVersion: 1, quizzes: quizChangeSet, flashcards: flashcardChangeSet }),
    } as File;
    const stage = vi.fn().mockRejectedValueOnce(new Error('Workspace changed')).mockResolvedValueOnce(undefined);
    const onBankChange = vi.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel
          {...props}
          subjects={quizBank.subjects}
          quizBank={quizBank}
          onStagePairedImport={stage}
          onBankChange={onBankChange}
        />
      </ThemeProvider>,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(
      ((await screen.findByRole('textbox', { name: 'Paired quiz change set' })) as HTMLTextAreaElement).value,
    ).toContain('subject.delete');
    fireEvent.click(screen.getByRole('button', { name: 'Stage import' }));
    expect(await screen.findByText('Workspace changed')).toBeVisible();
    expect(onBankChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stage import' }));
    await waitFor(() => expect(onBankChange).toHaveBeenCalledWith(result));
    expect(stage).toHaveBeenLastCalledWith(quizChangeSet, result);
    expect(screen.getByRole('button', { name: 'Paired deck 0 cards' })).toBeVisible();
  });
  it('invalidates an imported preview after shared subjects change', async () => {
    const { container, rerender } = render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} />
      </ThemeProvider>,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [await importFile()] } });
    expect(await screen.findByText('Import preview')).toBeVisible();
    rerender(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel
          {...props}
          subjects={props.subjects.map((subject) => ({ ...subject, name: `${subject.name} renamed` }))}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Stage import' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Imported deck 0 cards' })).toBeNull();
  });

  it('restores the exact imported operation history on undo and can export it again', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} />
      </ThemeProvider>,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [await importFile()] } });
    await screen.findByText('Import preview');
    fireEvent.click(screen.getByRole('button', { name: 'Stage import' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Add deck' })[0]);
    stageRecord({ id: 'd-after-import', subjectId: 's1', name: 'Later deck' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('button', { name: 'Later deck 0 cards' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Imported deck 0 cards' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Export flashcard JSON and change set' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/does not reproduce/)).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Record JSON' })).toHaveValue('');
  });
  it('exports reproducible reorder operations for decks and retains reset after export', async () => {
    let bank!: StoredFlashcardBank;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel
          {...props}
          onBankChange={(value) => {
            bank = value;
          }}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Add deck' })[0]);
    stageRecord({ id: 'd1', subjectId: 's1', name: 'Deck One' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add deck' })[0]);
    stageRecord({ id: 'd-other', subjectId: 's2', name: 'Other Deck' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add deck' })[0]);
    stageRecord({ id: 'd2', subjectId: 's1', name: 'Deck Two' });
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));
    expect(bank.decks.map((deck) => deck.id)).toEqual(['d2', 'd1', 'd-other']);
    fireEvent.click(screen.getByRole('button', { name: 'Export flashcard JSON and change set' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/does not reproduce/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import change set' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(bank.decks).toEqual([]);
    expect(screen.getByRole('button', { name: 'Import change set' })).toBeEnabled();
    vi.unstubAllGlobals();
  }, 15_000);

  it('protects unstaged edits and rejects unsafe rich content before staging', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Add deck' })[0]);
    stageRecord({ id: 'd1', subjectId: 's1', name: 'Deck' });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Record JSON' }), {
      target: { value: JSON.stringify({ id: 'f1', deckId: 'd1', front: '<script>alert(1)</script>', back: 'Back' }) },
    });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Deck 0 cards' }));
    expect(confirm).toHaveBeenCalledWith('Discard the unstaged record edits?');
    expect(screen.getByRole('heading', { name: 'Create card' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Stage record' }));
    expect(screen.getByText(/unsupported HTML/).closest('[role="alert"]')).toBeVisible();
    expect(screen.queryByRole('button', { name: /alert.*Card/ })).toBeNull();
  });

  it('guards flashcard undo when restoring a deck would reference a removed subject', () => {
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Add deck' })[0]);
    stageRecord({ id: 'd1', subjectId: 's1', name: 'Deck' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    rerender(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} subjects={props.subjects.filter((subject) => subject.id !== 's1')} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText(/unknown subject/).closest('[role="alert"]')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Deck 0 cards' })).toBeNull();
  });
  it('creates and stages a deck under an authoritative shared subject', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Add deck' })[0]);
    const editor = screen.getByRole('textbox', { name: 'Record JSON' });
    const deck = JSON.parse((editor as HTMLTextAreaElement).value) as { id: string; subjectId: string; name: string };
    expect(deck.id).toMatch(/^d-/);
    expect(deck.subjectId).toBe('s1');
    fireEvent.change(editor, { target: { value: JSON.stringify({ ...deck, name: 'Test deck' }, null, 2) } });
    fireEvent.click(screen.getByRole('button', { name: 'Stage record' }));
    expect(screen.getByText('Test deck')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export flashcard JSON and change set' })).toBeEnabled();
  });

  it('rejects a deck that references an unknown shared subject', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Add deck' })[0]);
    const editor = screen.getByRole('textbox', { name: 'Record JSON' });
    fireEvent.change(editor, {
      target: { value: JSON.stringify({ id: 'd-invalid', subjectId: 'missing', name: 'Invalid' }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stage record' }));
    expect(screen.getByRole('alert')).toHaveTextContent('unknown subject');
    expect(screen.queryByText('Invalid')).toBeNull();
  });
});

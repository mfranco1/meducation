import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { theme } from '../shared/theme';
import { storedQuestionBank } from '../content/local/questionBank';
import type { StoredFlashcardBank, StoredQuestionBank } from '../content/schema/schema';
import { revisionForBank } from './core/serializeBank';
import { flashcardContentRevision, storedFlashcardBank } from '../content/local/flashcardBank';
import { sha256Text } from '../domain/contentDigest';
import {
  applyFlashcardOperations,
  type FlashcardAdminChangeSet,
  type FlashcardAdminOperation,
} from './core/flashcardChangeSet';

// Authoring workflows start from a fixed empty catalog, including import/export replay.
vi.mock('../content/flashcardBank.generated.json', async () => ({
  default: (await import('../../tests/fixtures/empty-flashcard-bank.json')).default,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function chooseSubject(subjectId = 's1') {
  const subject = props.subjects.find((item) => item.id === subjectId)!;
  fireEvent.click(screen.getAllByTitle('Open')[0]);

  fireEvent.click(screen.getByRole('option', { name: subject.name }));
}

function clickAddDeck(subjectId = 's1') {
  const subject = screen.getByRole('combobox', { name: 'Subject' }) as HTMLInputElement;
  const selected = props.subjects.find((item) => item.id === subjectId)?.name;
  if (subject.value !== selected) chooseSubject(subjectId);
  fireEvent.click(screen.getByRole('button', { name: 'Add deck' }));
}

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
      changeSetVersion: 2,
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
    chooseSubject('s2');
    const deckPicker = screen.getByRole('combobox', { name: 'Deck' });
    fireEvent.change(deckPicker, { target: { value: 'Paired deck' } });
    expect(screen.getByRole('option', { name: 'Paired deck · 0 cards' })).toBeVisible();
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
    expect(screen.queryByRole('option', { name: 'Imported deck · 0 cards' })).toBeNull();
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
    chooseSubject();
    clickAddDeck();
    stageRecord({ id: 'd-after-import', subjectId: 's1', name: 'Later deck' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('button', { name: 'Later deck 0 cards' })).toBeNull();
    const deckPicker = screen.getByRole('combobox', { name: 'Deck' });
    fireEvent.change(deckPicker, { target: { value: 'Imported deck' } });
    expect(screen.getByRole('option', { name: 'Imported deck · 0 cards' })).toBeVisible();
    fireEvent.click(screen.getByRole('option', { name: 'Imported deck · 0 cards' }));
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
    clickAddDeck();
    stageRecord({ id: 'd1', subjectId: 's1', name: 'Deck One' });
    clickAddDeck();
    stageRecord({ id: 'd-other', subjectId: 's2', name: 'Other Deck' });
    clickAddDeck();
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
    clickAddDeck();
    stageRecord({ id: 'd1', subjectId: 's1', name: 'Deck' });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Record JSON' }), {
      target: { value: JSON.stringify({ id: 'f1', deckId: 'd1', front: '<script>alert(1)</script>', back: 'Back' }) },
    });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Edit deck' }));
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
    clickAddDeck();
    stageRecord({ id: 'd1', subjectId: 's1', name: 'Deck' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    rerender(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} subjects={props.subjects.filter((subject) => subject.id !== 's1')} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText(/unknown subject/).closest('[role="alert"]')).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Deck · 0 cards' })).toBeNull();
  });
  it('creates and stages a deck under an authoritative shared subject', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} />
      </ThemeProvider>,
    );
    clickAddDeck();
    const editor = screen.getByRole('textbox', { name: 'Record JSON' });
    const deck = JSON.parse((editor as HTMLTextAreaElement).value) as { id: string; subjectId: string; name: string };
    expect(deck.id).toMatch(/^d-/);
    expect(deck.subjectId).toBe('s1');
    fireEvent.change(editor, { target: { value: JSON.stringify({ ...deck, name: 'Test deck' }, null, 2) } });
    fireEvent.click(screen.getByRole('button', { name: 'Stage record' }));
    const deckPicker = screen.getByRole('combobox', { name: 'Deck' });
    fireEvent.change(deckPicker, { target: { value: 'Test deck' } });
    expect(screen.getByRole('option', { name: 'Test deck · 0 cards' })).toBeVisible();
    fireEvent.click(screen.getByRole('option', { name: 'Test deck · 0 cards' }));
    expect(screen.getByRole('button', { name: 'Export flashcard JSON and change set' })).toBeEnabled();
  });

  it('rejects a deck that references an unknown shared subject', () => {
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} />
      </ThemeProvider>,
    );
    clickAddDeck();
    const editor = screen.getByRole('textbox', { name: 'Record JSON' });
    fireEvent.change(editor, {
      target: { value: JSON.stringify({ id: 'd-invalid', subjectId: 'missing', name: 'Invalid' }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stage record' }));
    expect(screen.getByRole('alert')).toHaveTextContent('unknown subject');
    expect(screen.queryByText('Invalid')).toBeNull();
  });

  it('previews and stages multiple cards as one undoable batch', async () => {
    let bank: StoredFlashcardBank = structuredClone(storedFlashcardBank);
    const onBankChange = vi.fn((value: StoredFlashcardBank) => {
      bank = value;
    });
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} onBankChange={onBankChange} />
      </ThemeProvider>,
    );
    clickAddDeck();
    stageRecord({ id: 'd-bulk-cards', subjectId: 's1', name: 'Bulk cards destination' });
    fireEvent.click(screen.getByRole('button', { name: 'Bulk add cards' }));
    const json = screen.getByRole('textbox', { name: 'Bulk JSON' });
    fireEvent.change(json, {
      target: {
        value: JSON.stringify({
          cards: [
            { front: '**First**', back: 'Answer one', sources: 'A source' },
            { front: 'Second', back: 'Answer two', reviewNote: 'Check this later' },
          ],
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('region', { name: 'Bulk add preview' })).toHaveTextContent('2 card(s)');
    expect(screen.getByRole('region', { name: 'Bulk add preview' })).toHaveTextContent('Check this later');
    fireEvent.click(screen.getByRole('button', { name: 'Stage batch' }));
    await waitFor(() => expect(bank.cards).toHaveLength(2));
    expect(onBankChange).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(bank.decks.map((deck) => deck.id)).toEqual(['d-bulk-cards']);
    expect(bank.cards).toEqual([]);
  });

  it('stages empty and recursively populated decks for a selected subject atomically', async () => {
    let bank: StoredFlashcardBank = structuredClone(storedFlashcardBank);
    const onBankChange = vi.fn((value: StoredFlashcardBank) => {
      bank = value;
    });
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} onBankChange={onBankChange} />
      </ThemeProvider>,
    );
    chooseSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Bulk add decks' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Bulk JSON' }), {
      target: {
        value: JSON.stringify({
          decks: [
            { name: 'Empty deck', description: 'No cards yet', cards: [] },
            {
              name: 'Nested deck',
              cards: [
                { front: 'Question one', back: 'Answer one' },
                { front: 'Question two', back: 'Answer two' },
              ],
            },
          ],
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await screen.findByRole('region', { name: 'Bulk add preview' });
    expect(preview).toHaveTextContent('2 deck(s)');
    expect(preview).toHaveTextContent('2 card(s)');
    expect(preview).toHaveTextContent('Empty deck');
    expect(preview).toHaveTextContent('Question two');
    fireEvent.click(screen.getByRole('button', { name: 'Stage batch' }));
    await waitFor(() => expect(bank.decks).toHaveLength(2));
    expect(bank.decks.map((deck) => deck.name)).toEqual(['Empty deck', 'Nested deck']);
    expect(bank.decks[0].description).toBe('No cards yet');
    expect(bank.cards.map((card) => card.front)).toEqual(['Question one', 'Question two']);
    expect(onBankChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(bank.decks).toEqual([]);
    expect(bank.cards).toEqual([]);
  });

  it('rejects an invalid nested card without partial staging and invalidates stale previews', async () => {
    let bank: StoredFlashcardBank = structuredClone(storedFlashcardBank);
    const onBankChange = vi.fn((value: StoredFlashcardBank) => {
      bank = value;
    });
    render(
      <ThemeProvider theme={theme}>
        <FlashcardAdminPanel {...props} onBankChange={onBankChange} />
      </ThemeProvider>,
    );
    chooseSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Bulk add decks' }));
    const json = screen.getByRole('textbox', { name: 'Bulk JSON' });
    fireEvent.change(json, {
      target: {
        value: JSON.stringify({
          decks: [{ name: 'Would be valid', cards: [{ front: '<script>bad</script>', back: 'Safe' }] }],
        }),
      },
    });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText(/\$\.decks\[0\]\.cards\[0\].*unsupported HTML/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Stage batch' })).toBeDisabled();
    expect(bank.decks).toEqual([]);
    expect(bank.cards).toEqual([]);
    expect(onBankChange).not.toHaveBeenCalled();

    fireEvent.change(json, { target: { value: JSON.stringify({ decks: [{ name: 'Valid deck' }] }) } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('region', { name: 'Bulk add preview' })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Change reason' }), { target: { value: 'Updated reason' } });
    expect(await screen.findByText(/changed\. Preview again before staging/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Stage batch' })).toBeDisabled();
  });
});

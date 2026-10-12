import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StoredFlashcardBank, StoredQuestionBank } from '../content/schema/schema';
import { serializeBank } from './core/serializeBank';
import type { AdminChangeSet } from './core/types';
import type { AdminQuestionBankGateway } from './data/AdminQuestionBankGateway';
import { InMemoryQuestionBankGateway } from './data/InMemoryQuestionBankGateway';
import { useAdminEditor } from './useAdminEditor';

const bank = (): StoredQuestionBank => ({
  schemaVersion: 4,
  subjects: [{ id: 's1', name: 'Subject', accent: '#111111' }],
  quizzes: [{ id: 'q1', subjectId: 's1', name: 'Quiz' }],
  questions: [{ id: 'i1', quizId: 'q1', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Rationale' }],
});
const emptyFlashcardBank: StoredFlashcardBank = { schemaVersion: 2, decks: [], cards: [] };

describe('admin editor workflows', () => {
  it('stages coordinated snapshots and preserves a declined quiz draft', async () => {
    const source = bank();
    source.subjects.push({ id: 's2', name: 'Second', accent: '#222222' });
    const originalCards: StoredFlashcardBank = { schemaVersion: 2, decks: [{ id: 'd1', subjectId: 's1', name: 'Deck' }], cards: [] };
    const movedCards: StoredFlashcardBank = { ...originalCards, decks: [{ ...originalCards.decks[0], subjectId: 's2' }] };
    const gateway = new InMemoryQuestionBankGateway(source, originalCards);
    const confirm = vi.fn().mockReturnValue(false);
    const { result } = renderHook(() => useAdminEditor(gateway, { confirm }));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    const changeSet: AdminChangeSet = { changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: result.current.snapshot!.revision }, reason: 'Move shared content', operations: [{ op: 'subject.delete', id: 's1', cascade: true }] };
    act(() => result.current.editRecord('Unstaged quiz draft'));
    await act(async () => { await expect(result.current.stageCoordinatedImport(changeSet, movedCards)).rejects.toThrow('draft was kept'); });
    expect(result.current.editor).toBe('Unstaged quiz draft');
    expect(result.current.snapshot?.bank).toEqual(source);
    confirm.mockReturnValue(true);
    await act(async () => { await result.current.stageCoordinatedImport(changeSet, movedCards); });
    expect(result.current.snapshot?.bank.subjects.map(subject => subject.id)).toEqual(['s2']);
    expect(result.current.hasAppliedChanges).toBe(true);
    expect(result.current.dirty).toBe(true);
    expect(result.current.editor).toBe('');
    act(() => result.current.markCoordinatedExport());
    expect(result.current.dirty).toBe(false);
    expect(result.current.exported).toBe(true);
    await act(async () => { await result.current.resetCoordinatedWorkspace(originalCards); });
    expect(result.current.snapshot?.bank).toEqual(source);
    expect(result.current.hasAppliedChanges).toBe(false);
    expect(result.current.dirty).toBe(false);
    expect(result.current.exported).toBe(false);
  });
  it('stages, exports, and undoes a record edit without changing the initial export bytes', async () => {
    const source = bank();
    const gateway = new InMemoryQuestionBankGateway(source, emptyFlashcardBank);
    const downloads = vi.fn();
    const { result } = renderHook(() => useAdminEditor(gateway, { download: downloads }));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    expect(serializeBank(result.current.snapshot!.bank)).toBe(serializeBank(source));

    act(() => result.current.loadEntity({ kind: 'subject', id: 's1' }, source.subjects[0]));
    act(() => result.current.editRecord(JSON.stringify({ ...source.subjects[0], name: 'Updated' })));
    await act(async () => { await result.current.stageSingle(); });
    expect(result.current.snapshot?.bank.subjects[0].name).toBe('Updated');
    expect(result.current.hasAppliedChanges).toBe(true);

    act(() => result.current.exportFiles());
    expect(downloads).toHaveBeenCalledWith('questionBank.generated.json', serializeBank(result.current.snapshot!.bank));
    expect(downloads).toHaveBeenCalledWith('question-bank-change-set.json', expect.stringContaining('"subject.update"'));

    await act(async () => { await result.current.undo(); });
    expect(result.current.snapshot?.bank).toEqual(source);
    expect(result.current.hasAppliedChanges).toBe(false);
  });

  it('invalidates a pending preview when the draft changes and serializes commands', async () => {
    const delegate = new InMemoryQuestionBankGateway(bank(), emptyFlashcardBank);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const gateway: AdminQuestionBankGateway = {
      load: () => delegate.load(),
      preview: async (changeSet: AdminChangeSet) => { await gate; return delegate.preview(changeSet); },
      apply: vi.fn(changeSet => delegate.apply(changeSet)),
      undo: () => delegate.undo(), reset: () => delegate.reset(),
      appliedOperations: () => delegate.appliedOperations(),
    };
    const { result } = renderHook(() => useAdminEditor(gateway));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    act(() => result.current.loadEntity({ kind: 'subject', id: 's1' }, bank().subjects[0]));
    act(() => result.current.editRecord(JSON.stringify({ ...bank().subjects[0], name: 'First' })));
    let staging!: Promise<void>;
    act(() => { staging = result.current.stageSingle(); });
    expect(result.current.busy).toBe('Stage');
    await act(async () => { await result.current.undo(); });
    act(() => result.current.editRecord(JSON.stringify({ ...bank().subjects[0], name: 'Second' })));
    await act(async () => { release(); await staging; });
    expect(gateway.apply).not.toHaveBeenCalled();
    expect(result.current.snapshot?.bank.subjects[0].name).toBe('Subject');
    expect(result.current.busy).toBeUndefined();
  });

  it('previews an imported change set before explicitly staging it', async () => {
    const gateway = new InMemoryQuestionBankGateway(bank(), emptyFlashcardBank);
    const { result } = renderHook(() => useAdminEditor(gateway));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    const changeSet: AdminChangeSet = {
      changeSetVersion: 2,
      base: { bankSchemaVersion: 4, revision: result.current.snapshot!.revision },
      reason: 'Import test',
      operations: [{ op: 'subject.update', id: 's1', value: { ...bank().subjects[0], name: 'Imported' } }],
    };
    const file = new File([JSON.stringify(changeSet)], 'change-set.json', { type: 'application/json' });
    await act(async () => { await result.current.importChangeSetFile(file); });
    expect(result.current.importedChangeSet?.changeSet).toEqual(changeSet);
    expect(result.current.snapshot?.bank.subjects[0].name).toBe('Subject');
    await act(async () => { await result.current.stageImportedChangeSet(); });
    expect(result.current.snapshot?.bank.subjects[0].name).toBe('Imported');
    expect(result.current.reason).toBe('Import test');
    await act(async () => { await result.current.undo(); });
    expect(result.current.reason).toBe('Local question-bank edit');
  });

  it('validates a bulk draft, exposes generated IDs, and stages only after confirmation', async () => {
    const gateway = new InMemoryQuestionBankGateway(bank(), emptyFlashcardBank);
    const { result } = renderHook(() => useAdminEditor(gateway));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    act(() => result.current.chooseBulkTarget('newSubject'));
    act(() => result.current.editRecord(JSON.stringify({
      subject: { name: 'Second subject' },
      quizzes: [{ name: 'Second quiz', items: [{ stem: 'New stem', choices: ['A', 'B'], answer: 'A', rationale: 'New rationale' }] }],
    })));
    await act(async () => { await result.current.validateBulkDraft(); });
    expect(result.current.pendingBulk?.generatedIds).toEqual(['s2', 'q2', 'i2']);
    expect(result.current.snapshot?.bank.subjects).toHaveLength(1);
    await act(async () => { await result.current.stageValidatedBulk(); });
    expect(result.current.snapshot?.bank.subjects).toHaveLength(2);
    expect(result.current.snapshot?.bank.questions[1].quizId).toBe('q2');
  });
  it('preserves a declined draft during browsing and protects it before unload', async () => {
    const confirm = vi.fn().mockReturnValue(false);
    const gateway = new InMemoryQuestionBankGateway(bank(), emptyFlashcardBank);
    const { result } = renderHook(() => useAdminEditor(gateway, { confirm }));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    act(() => result.current.loadEntity({ kind: 'question', id: 'i1', parentId: 'q1' }, bank().questions[0]));
    act(() => result.current.editRecord('Unstaged draft'));
    act(() => { expect(result.current.browseContext('s1')).toBe(false); result.current.chooseBulkTarget('newSubject'); });
    expect(result.current.editor).toBe('Unstaged draft');
    expect(result.current.mode).toBe('single');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true);
    act(() => { expect(result.current.browseContext('s1', 'q1')).toBe(true); });
    expect(result.current.editor).toBe('');
    expect(result.current.selectedQuiz?.id).toBe('q1');
  });

  it('deletes selected items atomically, rejects stale or wrong-parent selections, and undoes once', async () => {
    const source = bank();
    source.quizzes.push({ id: 'q2', subjectId: 's1', name: 'Other quiz' });
    source.questions.push({ ...source.questions[0], id: 'i2' }, { ...source.questions[0], id: 'i3', quizId: 'q2' }, { ...source.questions[0], id: 'i4' });
    const gateway = new InMemoryQuestionBankGateway(source, emptyFlashcardBank);
    const { result } = renderHook(() => useAdminEditor(gateway));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    const target = { kind: 'question' as const, parentId: 'q1' };
    await act(async () => { await result.current.stageDelete(target, 'Reviewed selection', ['i1', 'i3']); });
    expect(result.current.snapshot?.bank).toEqual(source);
    await act(async () => { await result.current.stageDelete(target, 'Reviewed selection', ['i1', 'i2'], 'stale'); });
    expect(result.current.snapshot?.bank).toEqual(source);
    await act(async () => { await result.current.stageDelete(target, 'Reviewed selection', ['i1', 'i2', 'i4'], result.current.snapshot!.revision); });
    expect(result.current.snapshot?.bank).toEqual(source);
    expect(result.current.issues[0].message).toContain('no questions');
    await act(async () => { await result.current.stageDelete(target, 'Reviewed selection', ['i1', 'i2'], result.current.snapshot!.revision); });
    expect(result.current.issues.filter(issue => issue.level === 'error')).toEqual([]);
    expect(result.current.snapshot?.bank.questions.map(row => row.id)).toEqual(['i3', 'i4']);
    expect(gateway.appliedOperations()).toHaveLength(2);
    await act(async () => { await result.current.undo(); });
    expect(result.current.snapshot?.bank).toEqual(source);
    expect(gateway.appliedOperations()).toEqual([]);
  });

  it('refuses to undo a paired transaction past later quiz edits and restores the exact pair after they are undone', async () => {
    const source = bank();
    source.subjects.push({ id: 's2', name: 'Second', accent: '#222222' });
    const cards: StoredFlashcardBank = { schemaVersion: 2, decks: [{ id: 'd1', subjectId: 's1', name: 'Deck' }], cards: [] };
    const gateway = new InMemoryQuestionBankGateway(source, cards);
    const { result } = renderHook(() => useAdminEditor(gateway));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    await act(async () => { await result.current.stageCoordinatedImport({ changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: result.current.snapshot!.revision }, reason: 'Reviewed deletion', operations: [{ op: 'subject.delete', id: 's1', cascade: true }] }, emptyFlashcardBank); });
    expect(gateway.coordinatedOperationCount()).toBe(1);
    act(() => result.current.loadEntity({ kind: 'subject', id: 's2' }, source.subjects[1]));
    act(() => result.current.editRecord(JSON.stringify({ ...source.subjects[1], name: 'Later edit' })));
    await act(async () => { await result.current.stageSingle(); });
    await act(async () => { await expect(result.current.undoCoordinated(1)).rejects.toThrow('Undo later quiz edits'); });
    expect(result.current.snapshot?.bank.subjects[0].name).toBe('Later edit');
    expect(gateway.getFlashcardBank()).toEqual(emptyFlashcardBank);
    await act(async () => { await result.current.undo(); await result.current.undoCoordinated(1); });
    expect(result.current.snapshot?.bank).toEqual(source);
    expect(gateway.getFlashcardBank()).toEqual(cards);
    expect(gateway.coordinatedOperationCount()).toBeUndefined();
  });

});

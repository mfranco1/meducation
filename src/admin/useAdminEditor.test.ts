import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StoredFlashcardBank, StoredQuestionBank } from '../content/schema';
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

describe('admin editor workflows', () => {
  it('stages coordinated snapshots and preserves a declined quiz draft', async () => {
    const source = bank();
    source.subjects.push({ id: 's2', name: 'Second', accent: '#222222' });
    const originalCards: StoredFlashcardBank = { schemaVersion: 1, topics: [{ id: 't1', subjectId: 's1', name: 'Topic' }], decks: [], cards: [] };
    const movedCards: StoredFlashcardBank = { ...originalCards, topics: [{ ...originalCards.topics[0], subjectId: 's2' }] };
    const gateway = new InMemoryQuestionBankGateway(source, originalCards);
    const confirm = vi.fn().mockReturnValue(false);
    const { result } = renderHook(() => useAdminEditor(gateway, { confirm }));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    const changeSet: AdminChangeSet = { changeSetVersion: 1, base: { bankSchemaVersion: 4, revision: result.current.snapshot!.revision }, reason: 'Move shared content', operations: [{ op: 'subject.delete', id: 's1', cascade: true }] };
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
    const gateway = new InMemoryQuestionBankGateway(source);
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
    const delegate = new InMemoryQuestionBankGateway(bank());
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
    const gateway = new InMemoryQuestionBankGateway(bank());
    const { result } = renderHook(() => useAdminEditor(gateway));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    const changeSet: AdminChangeSet = {
      changeSetVersion: 1,
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
  });

  it('validates a bulk draft, exposes generated IDs, and stages only after confirmation', async () => {
    const gateway = new InMemoryQuestionBankGateway(bank());
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
});

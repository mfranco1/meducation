import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StoredFlashcardBank, StoredQuestionBank } from '../content/schema/schema';
import type { AdminChangeSet } from './core/types';
import type { AdminQuestionBankGateway } from './data/AdminQuestionBankGateway';
import { InMemoryQuestionBankGateway } from '../test/InMemoryQuestionBankGateway';
import { useAdminEditor } from './useAdminEditor';

const bank = (): StoredQuestionBank => ({
  schemaVersion: 4,
  subjects: [{ id: 's1', name: 'Subject', accent: '#111111' }],
  quizzes: [{ id: 'q1', subjectId: 's1', name: 'Quiz' }],
  questions: [
    {
      id: 'i1',
      quizId: 'q1',
      stem: 'Stem',
      choices: [
        { id: 'A', text: 'A' },
        { id: 'B', text: 'B' },
      ],
      answer: 'A',
      rationale: 'Rationale',
    },
  ],
});
const emptyFlashcardBank: StoredFlashcardBank = { schemaVersion: 2, decks: [], cards: [] };

describe('admin editor workflows', () => {
  it('stages coordinated snapshots and preserves a declined quiz draft', async () => {
    const source = bank();
    source.subjects.push({ id: 's2', name: 'Second', accent: '#222222' });
    const originalCards: StoredFlashcardBank = {
      schemaVersion: 2,
      decks: [{ id: 'd1', subjectId: 's1', name: 'Deck' }],
      cards: [],
    };
    const movedCards: StoredFlashcardBank = {
      ...originalCards,
      decks: [{ ...originalCards.decks[0], subjectId: 's2' }],
    };
    const gateway = new InMemoryQuestionBankGateway(source, originalCards);
    const confirm = vi.fn().mockReturnValue(false);
    const { result } = renderHook(() => useAdminEditor(gateway, { confirm }));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    const changeSet: AdminChangeSet = {
      changeSetVersion: 2,
      base: { bankSchemaVersion: 4, revision: result.current.snapshot!.revision },
      reason: 'Move shared content',
      operations: [{ op: 'subject.delete', id: 's1', cascade: true }],
    };
    act(() => result.current.editRecord('Unstaged quiz draft'));
    await act(async () => {
      await expect(result.current.savePairedChange(changeSet, movedCards)).rejects.toThrow('draft was kept');
    });
    expect(result.current.editor).toBe('Unstaged quiz draft');
    expect(result.current.snapshot?.bank).toEqual(source);
    confirm.mockReturnValue(true);
    await act(async () => {
      await result.current.savePairedChange(changeSet, movedCards);
    });
    expect(result.current.snapshot?.bank.subjects.map((subject) => subject.id)).toEqual(['s2']);
    expect(result.current.editor).toBe('');
    expect(result.current.summary).toContain('Paired draft saved');
  });
  it('invalidates a pending preview when the draft changes and serializes commands', async () => {
    const delegate = new InMemoryQuestionBankGateway(bank(), emptyFlashcardBank);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gateway: AdminQuestionBankGateway = {
      load: () => delegate.load(),
      preview: vi.fn(async (changeSet: AdminChangeSet) => {
        await gate;
        return delegate.preview(changeSet);
      }),
      apply: vi.fn((changeSet) => delegate.apply(changeSet)),
      applyCoordinated: (changes, flashcards) => delegate.applyCoordinated(changes, flashcards),
    };
    const { result } = renderHook(() => useAdminEditor(gateway));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    act(() => result.current.loadEntity({ kind: 'subject', id: 's1' }, bank().subjects[0]));
    act(() => result.current.editRecord(JSON.stringify({ ...bank().subjects[0], name: 'First' })));
    let staging!: Promise<void>;
    act(() => {
      staging = result.current.stageSingle();
    });
    expect(result.current.busy).toBe('Save draft');
    await act(async () => {
      await result.current.stageSingle();
    });
    expect(gateway.preview).toHaveBeenCalledTimes(1);
    act(() => result.current.editRecord(JSON.stringify({ ...bank().subjects[0], name: 'Second' })));
    await act(async () => {
      release();
      await staging;
    });
    expect(gateway.apply).not.toHaveBeenCalled();
    expect(result.current.snapshot?.bank.subjects[0].name).toBe('Subject');
    expect(result.current.busy).toBeUndefined();
  });

  it('validates a bulk draft, exposes generated IDs, and stages only after confirmation', async () => {
    const gateway = new InMemoryQuestionBankGateway(bank(), emptyFlashcardBank);
    const { result } = renderHook(() => useAdminEditor(gateway));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    act(() => result.current.chooseBulkTarget('newSubject'));
    act(() =>
      result.current.editRecord(
        JSON.stringify({
          subject: { name: 'Second subject' },
          quizzes: [
            {
              name: 'Second quiz',
              items: [{ stem: 'New stem', choices: ['A', 'B'], answer: 'A', rationale: 'New rationale' }],
            },
          ],
        }),
      ),
    );
    await act(async () => {
      await result.current.validateBulkDraft();
    });
    expect(result.current.pendingBulk?.generatedIds).toEqual(['s2', 'q2', 'i2']);
    expect(result.current.snapshot?.bank.subjects).toHaveLength(1);
    await act(async () => {
      await result.current.stageValidatedBulk();
    });
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
    act(() => {
      expect(result.current.browseContext('s1')).toBe(false);
      result.current.chooseBulkTarget('newSubject');
    });
    expect(result.current.editor).toBe('Unstaged draft');
    expect(result.current.mode).toBe('single');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true);
    act(() => {
      expect(result.current.browseContext('s1', 'q1')).toBe(true);
    });
    expect(result.current.editor).toBe('');
    expect(result.current.selectedQuiz?.id).toBe('q1');
  });

  it('deletes selected items atomically and rejects stale or wrong-parent selections', async () => {
    const source = bank();
    source.quizzes.push({ id: 'q2', subjectId: 's1', name: 'Other quiz' });
    source.questions.push(
      { ...source.questions[0], id: 'i2' },
      { ...source.questions[0], id: 'i3', quizId: 'q2' },
      { ...source.questions[0], id: 'i4' },
    );
    const gateway = new InMemoryQuestionBankGateway(source, emptyFlashcardBank);
    const { result } = renderHook(() => useAdminEditor(gateway));
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    const target = { kind: 'question' as const, parentId: 'q1' };
    await act(async () => {
      await result.current.stageDelete(target, 'Reviewed selection', ['i1', 'i3']);
    });
    expect(result.current.snapshot?.bank).toEqual(source);
    await act(async () => {
      await result.current.stageDelete(target, 'Reviewed selection', ['i1', 'i2'], 'stale');
    });
    expect(result.current.snapshot?.bank).toEqual(source);
    await act(async () => {
      await result.current.stageDelete(
        target,
        'Reviewed selection',
        ['i1', 'i2', 'i4'],
        result.current.snapshot!.revision,
      );
    });
    expect(result.current.snapshot?.bank).toEqual(source);
    expect(result.current.issues[0].message).toContain('no questions');
    await act(async () => {
      await result.current.stageDelete(target, 'Reviewed selection', ['i1', 'i2'], result.current.snapshot!.revision);
    });
    expect(result.current.issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(result.current.snapshot?.bank.questions.map((row) => row.id)).toEqual(['i3', 'i4']);
    expect(gateway.appliedOperations()).toHaveLength(2);
  });
});

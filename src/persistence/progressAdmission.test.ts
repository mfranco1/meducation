import { describe, expect, it, vi } from 'vitest';
import { initializeProgressAdmission, learnerProgressAdmission, ProgressAdmission, ProgressAdmissionError, readRestoreJournalStatus } from './progressAdmission';
import { progressRestoreJournalKey } from './progressKeys';
import { LocalAttemptRepository } from './localRepository';
import { LocalFlashcardProgressRepository } from './localFlashcardProgressRepository';
import { ProgressCoordination, type ProgressLockPort } from './progressCoordination';
import { PROGRESS_RESTORE_JOURNAL_FORMAT } from './progressRestore';
import { progressKey } from './progressCodec';
import { flashcardProgressKey } from './flashcardProgressCodec';

class SingleOwnerLocks implements ProgressLockPort {
  private shared = 0;
  private exclusive = false;
  private readonly queued: Array<() => void> = [];
  request<T>(_name: string, options: { mode: 'shared' | 'exclusive'; ifAvailable?: boolean; signal?: AbortSignal }, callback: (lock: unknown | null) => T | Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (options.signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const canAcquire = options.mode === 'shared' ? !this.exclusive : !this.exclusive && this.shared === 0;
        if (!canAcquire) {
          if (options.ifAvailable) { Promise.resolve(callback(null)).then(resolve, reject); return; }
          options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
          this.queued.push(attempt);
          return;
        }
        if (options.mode === 'shared') this.shared++;
        else this.exclusive = true;
        Promise.resolve(callback({})).then(resolve, reject).finally(() => {
          if (options.mode === 'shared') this.shared--;
          else this.exclusive = false;
          this.queued.shift()?.();
        });
      };
      attempt();
    });
  }
}

class MemoryProgressStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function sharedLease() {
  let valid = true;
  return {
    lease: { mode: 'shared' as const, get valid() { return valid; }, release: () => { valid = false; } },
    invalidate: () => { valid = false; },
  };
}

describe('paired progress admission', () => {
  it('denies both repository reads and writes before admission without touching storage', () => {
    const admission = new ProgressAdmission();
    const getItem = vi.fn(() => null);
    const setItem = vi.fn();
    const storage = { getItem, setItem };
    const quiz = new LocalAttemptRepository(storage, admission);
    const flashcards = new LocalFlashcardProgressRepository(storage, admission);

    expect(() => quiz.getSnapshot()).toThrow(ProgressAdmissionError);
    expect(() => flashcards.getSnapshot()).toThrow(ProgressAdmissionError);
    expect(() => quiz.clearActive('quiz')).toThrow(ProgressAdmissionError);
    expect(() => flashcards.clearCheckpoint('deck')).toThrow(ProgressAdmissionError);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('requires a valid shared lease and clear journal, then gates access when either changes', () => {
    const admission = new ProgressAdmission();
    const acquired = sharedLease();
    let journal: 'clear' | 'pending' | 'unavailable' = 'clear';
    admission.admit(acquired.lease, () => journal);
    expect(admission.ready).toBe(true);

    journal = 'pending';
    expect(admission.ready).toBe(false);
    expect(() => admission.assertReady()).toThrow(ProgressAdmissionError);
    expect(acquired.lease.valid).toBe(false);
    journal = 'clear';
    acquired.invalidate();
    expect(admission.ready).toBe(false);
    admission.close();
  });

  it('supports read-only browsing without changing existing bytes or admitting progress writes', () => {
    const admission = new ProgressAdmission();
    const storage = new MemoryProgressStorage();
    storage.values.set(progressKey, '{preserve quiz bytes');
    storage.values.set(flashcardProgressKey, '{preserve flashcard bytes');
    admission.admitReadOnly(() => 'clear');
    const quiz = new LocalAttemptRepository(storage, admission);
    const flashcards = new LocalFlashcardProgressRepository(storage, admission);

    expect(admission.browsingOnly).toBe(true);
    expect(quiz.getSnapshot().completed).toEqual([]);
    expect(flashcards.getSnapshot().checkpoints).toEqual({});
    expect(() => quiz.clearActive('quiz')).toThrow(ProgressAdmissionError);
    expect(() => flashcards.clearCheckpoint('deck')).toThrow(ProgressAdmissionError);
    expect([...storage.values]).toEqual([
      [progressKey, '{preserve quiz bytes'],
      [flashcardProgressKey, '{preserve flashcard bytes'],
    ]);
    admission.close();
  });

  it('preserves pending and inaccessible journal states as distinct fail-closed results', () => {
    expect(readRestoreJournalStatus({ getItem: key => key === progressRestoreJournalKey ? null : null })).toBe('clear');
    expect(readRestoreJournalStatus({ getItem: () => 'journal-bytes' })).toBe('pending');
    expect(readRestoreJournalStatus({ getItem: () => { throw new Error('storage denied'); } })).toBe('unavailable');
  });

  it('admits shared reads only after a pending journal is recovered exclusively', async () => {
    learnerProgressAdmission.close();
    const storage = new MemoryProgressStorage();
    storage.values.set(progressKey, '{old quiz bytes');
    const targets = {
      quiz: JSON.stringify({ schemaVersion: 2, revision: '00000000-0000-4000-8000-000000000001', active: {}, completed: [], completionCounts: {}, lowestScores: {}, latestScores: {}, activity: {}, completedIds: {} }),
      flashcards: JSON.stringify({ schemaVersion: 2, revision: '00000000-0000-4000-8000-000000000002', checkpoints: {}, completionCounts: {} }),
    };
    storage.values.set(progressRestoreJournalKey, JSON.stringify({
      format: PROGRESS_RESTORE_JOURNAL_FORMAT,
      version: 1,
      operationId: '00000000-0000-4000-8000-000000000003',
      decision: 'original',
      original: { quiz: '{old quiz bytes', flashcards: null },
      imported: targets,
    }));

    const initialized = await initializeProgressAdmission(new ProgressCoordination(new SingleOwnerLocks()), storage);
    expect(initialized.kind).toBe('ready');
    expect(storage.getItem(progressKey)).toBe('{old quiz bytes');
    expect(storage.getItem(flashcardProgressKey)).toBeNull();
    expect(storage.getItem(progressRestoreJournalKey)).toBeNull();
    expect(learnerProgressAdmission.ready).toBe(true);
    learnerProgressAdmission.close();
  });

  it('admits read-only browsing when Web Locks are unsupported and the journal is clear', async () => {
    learnerProgressAdmission.close();
    const storage = new MemoryProgressStorage();
    storage.values.set(progressKey, '{saved bytes');
    const initialized = await initializeProgressAdmission(new ProgressCoordination(undefined), storage);
    expect(initialized.kind).toBe('read-only');
    expect(learnerProgressAdmission.browsingOnly).toBe(true);
    expect(storage.getItem(progressKey)).toBe('{saved bytes');
    learnerProgressAdmission.close();
  });
});

it('refreshes both snapshots under coordinated read-only admission without admitting writes', () => {
  const admission = new ProgressAdmission();
  const storage = new MemoryProgressStorage();
  const acquired = sharedLease();
  admission.admitReadOnly(() => 'clear', acquired.lease);
  const quiz = new LocalAttemptRepository(storage, admission);
  const cards = new LocalFlashcardProgressRepository(storage, admission);
  const oldQuiz = quiz.getSnapshot();
  const oldCards = cards.getSnapshot();
  quiz.refreshAfterPairedOperation();
  cards.refreshAfterPairedOperation();
  expect(quiz.getSnapshot()).not.toBe(oldQuiz);
  expect(cards.getSnapshot()).not.toBe(oldCards);
  expect(storage.values.size).toBe(0);
  expect(() => quiz.clearActive('quiz')).toThrow(ProgressAdmissionError);
  expect(() => cards.clearCheckpoint('deck')).toThrow(ProgressAdmissionError);
  acquired.invalidate();
  expect(admission.canRead).toBe(false);
  expect(() => admission.assertReadable()).toThrow(ProgressAdmissionError);
  admission.close();
});

it('retains the displayed pair through gated storage events and refreshes only after re-admission', () => {
  const storage = new MemoryProgressStorage();
  const admission = new ProgressAdmission();
  admission.admit(sharedLease().lease, () => 'clear');
  const quiz = new LocalAttemptRepository(storage, admission);
  const cards = new LocalFlashcardProgressRepository(storage, admission);
  const originals = [quiz.getSnapshot(), cards.getSnapshot()];
  const notify = vi.fn();
  const unsubscribeQuiz = quiz.subscribe(notify);
  const unsubscribeCards = cards.subscribe(notify);
  try {
    admission.close();
    window.dispatchEvent(new StorageEvent('storage', { key: progressKey }));
    window.dispatchEvent(new StorageEvent('storage', { key: flashcardProgressKey }));
    expect(quiz.getSnapshot()).toBe(originals[0]);
    expect(cards.getSnapshot()).toBe(originals[1]);
    expect(notify).not.toHaveBeenCalled();
    admission.admit(sharedLease().lease, () => 'clear');
    quiz.refreshAfterPairedOperation(); cards.refreshAfterPairedOperation();
    expect(notify).toHaveBeenCalledTimes(2);
    expect(quiz.getSnapshot()).not.toBe(originals[0]);
    expect(cards.getSnapshot()).not.toBe(originals[1]);
  } finally { unsubscribeQuiz(); unsubscribeCards(); admission.close(); }
});

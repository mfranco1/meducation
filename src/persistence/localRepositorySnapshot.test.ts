import { describe, expect, it, vi } from 'vitest';
import type { Attempt } from '../domain/types';
import { LocalAttemptRepository, PersistenceError } from './localRepository';
import { progressKey } from './progressCodec';

const active: Attempt = {
  id: 'attempt', quizId: 'quiz', subjectId: 'subject', feedbackMode: 'exam',
  startedAt: '2026-10-02T00:00:00.000Z', responses: {},
};

function storageFixture() {
  const values = new Map<string, string>();
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
  return { values, getItem, setItem };
}

describe('cached browser progress snapshots', () => {
  it('reads and decodes once for repeated selectors and never migrates in a getter', () => {
    const storage = storageFixture();
    storage.values.set('meducation.active-attempts.v1', JSON.stringify({ quiz: active }));
    const repository = new LocalAttemptRepository(storage);
    const first = repository.getSnapshot();
    const reads = storage.getItem.mock.calls.length;
    for (let index = 0; index < 100; index++) {
      expect(repository.getSnapshot()).toBe(first);
      expect(repository.getActive('quiz')).toBe(first.active.quiz);
      repository.completionCount('quiz');
      repository.latestActivityAt('quiz');
    }
    expect(storage.getItem).toHaveBeenCalledTimes(reads);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.active.quiz.responses)).toBe(true);
  });

  it('notifies on local writes and invalidates on a cross-tab storage event without accepting a stale save', () => {
    const storage = storageFixture();
    const first = new LocalAttemptRepository(storage);
    const notify = vi.fn();
    const unsubscribe = first.subscribe(notify);
    const initial = first.getSnapshot();
    first.saveActive(active);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(first.getSnapshot()).not.toBe(initial);

    const second = new LocalAttemptRepository(storage);
    second.saveActive({ ...active, id: 'other-tab' });
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(notify).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: progressKey }));
    expect(notify).toHaveBeenCalledTimes(2);
    expect(first.getSnapshot().active.quiz.id).toBe('other-tab');
    expect(() => first.saveActive(active)).toThrow(PersistenceError);
    expect(second.getActive('quiz')?.id).toBe('other-tab');
    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: progressKey }));
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

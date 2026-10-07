import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtures from '../../tests/fixtures/storage-boundary-cases.json';
import type { Attempt, CompletedAttempt } from '../domain/types';
import { LocalAttemptRepository, PersistenceError } from './localRepository';
import { emptyProgress, progressKey } from './progressCodec';

describe('browser storage boundary fixtures', () => {
  const values = new Map<string, string>();
  let failKey: string | undefined;

  beforeEach(() => {
    values.clear();
    failKey = undefined;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === failKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads current progress without consulting or rewriting retired keys', () => {
    const state = { ...emptyProgress(), active: { q1: fixtures.active } };
    values.set(progressKey, JSON.stringify(state));
    const reads = vi.spyOn(localStorage, 'getItem');
    const writes = vi.spyOn(localStorage, 'setItem');
    expect(new LocalAttemptRepository().getActive('q1')).toEqual(fixtures.active);
    expect(reads.mock.calls.map(([key]) => key)).toEqual([progressKey]);
    expect(writes).not.toHaveBeenCalled();
  });

  it('falls back for malformed progress JSON', () => {
    values.set(progressKey, fixtures.invalidStoredValues[0].value);
    expect(new LocalAttemptRepository().list()).toEqual([]);
  });

  it('rejects valid JSON with the wrong progress shape', () => {
    values.set(progressKey, fixtures.invalidStoredValues[1].value);
    expect(new LocalAttemptRepository().list()).toEqual([]);
  });

  it.each(['elapsedMs', 'celebrationProgress', 'contentSignature'])('rejects active records without current %s data', (field) => {
    const active: Record<string, unknown> = { ...fixtures.active };
    delete active[field];
    const raw = JSON.stringify({ ...emptyProgress(), active: { q1: active } });
    values.set(progressKey, raw);
    const repository = new LocalAttemptRepository();
    expect(repository.getActive('q1')).toBeUndefined();
    expect(repository.getStorageError()).toContain('kept');
    expect(() => repository.saveActive(fixtures.active as Attempt)).toThrow(PersistenceError);
    expect(values.get(progressKey)).toBe(raw);
  });

  it('rejects unlocked selected Fast Feedback responses instead of normalizing them', () => {
    const active = { ...fixtures.active, feedbackMode: 'immediate', responses: {
      i1: { questionId: 'i1', selectedChoiceId: 'A', flagged: false, locked: false, timeMs: 0 },
    } };
    const raw = JSON.stringify({ ...emptyProgress(), active: { q1: active } });
    values.set(progressKey, raw);
    const repository = new LocalAttemptRepository();
    expect(repository.getActive('q1')).toBeUndefined();
    expect(repository.getStorageError()).toContain('kept');
    expect(values.get(progressKey)).toBe(raw);
  });

  it('does not expose a partial completion when storage is full', () => {
    const active = fixtures.active as Attempt;
    const completed = fixtures.completed as CompletedAttempt;
    values.set(progressKey, JSON.stringify({ ...emptyProgress(), active: { q1: active } }));
    const before = new Map(values);
    failKey = progressKey;

    expect(() => new LocalAttemptRepository().saveCompleted(completed)).toThrow(PersistenceError);
    expect(values).toEqual(before);
  });

  it('does not count the same completed attempt twice', () => {
    const repository = new LocalAttemptRepository();
    const completed = fixtures.completed as CompletedAttempt;
    repository.saveCompleted(completed);
    repository.saveCompleted(completed);
    expect(repository.completionCount('q1')).toBe(1);
    expect(repository.list()).toHaveLength(1);
  });

  it('remains idempotent after the completed history is pruned', () => {
    const repository = new LocalAttemptRepository();
    for (let index = 0; index < 205; index++) repository.saveCompleted({ ...fixtures.completed, id: `finished-${index}` } as CompletedAttempt);
    repository.saveCompleted({ ...fixtures.completed, id: 'finished-0' } as CompletedAttempt);
    expect(repository.list()).toHaveLength(200);
    expect(repository.completionCount('q1')).toBe(205);
  });

  it('rejects a stale tab before replacing another tab’s progress', () => {
    const first = new LocalAttemptRepository();
    first.list();
    const second = new LocalAttemptRepository();
    second.saveActive({ ...fixtures.active, id: 'second-tab' } as Attempt);
    expect(() => first.saveActive({ ...fixtures.active, id: 'first-tab' } as Attempt))
      .toThrowError(PersistenceError);
    expect(second.getActive('q1')?.id).toBe('second-tab');
  });

  it('does not overwrite an unreadable versioned record', () => {
    values.set(progressKey, '{"schemaVersion":2,"revision":"broken"}');
    const repository = new LocalAttemptRepository();
    expect(repository.getActive('q1')).toBeUndefined();
    expect(repository.getStorageError()).toBeDefined();
    expect(() => repository.saveActive(fixtures.active as Attempt)).toThrow(PersistenceError);
    expect(values.get(progressKey)).toBe('{"schemaVersion":2,"revision":"broken"}');
  });
});

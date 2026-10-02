import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtures from '../../tests/fixtures/storage-boundary-cases.json';
import type { Attempt, CompletedAttempt } from '../domain/types';
import { LocalAttemptRepository, PersistenceError } from './localRepository';
import { progressKey } from './progressCodec';

const completedKey = 'meducation.completed-attempts.v1';
const countsKey = 'meducation.completion-counts.v1';
const activeKey = 'meducation.active-attempts.v1';

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

  it('reads a legacy active attempt without a content revision', () => {
    values.set(activeKey, JSON.stringify({ q1: fixtures.legacyActive }));
    expect(new LocalAttemptRepository().getActive('q1')).toEqual(fixtures.legacyActive);
  });

  it('falls back for malformed completed history JSON', () => {
    values.set(completedKey, fixtures.invalidStoredValues[0].value);
    expect(new LocalAttemptRepository().list()).toEqual([]);
  });

  it('rejects valid JSON with the wrong completed-history shape', () => {
    values.set(completedKey, fixtures.invalidStoredValues[1].value);
    expect(new LocalAttemptRepository().list()).toEqual([]);
  });

  it('does not expose a partial completion when storage is full', () => {
    const active = fixtures.legacyActive as Attempt;
    const completed = fixtures.completed as CompletedAttempt;
    values.set(activeKey, JSON.stringify({ q1: active }));
    values.set(completedKey, '[]');
    values.set(countsKey, '{}');
    values.set('meducation.lowest-scores.v1', '{}');
    values.set('meducation.latest-scores.v1', '{}');
    values.set('meducation.quiz-activity.v1', '{}');
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

  it('migrates valid legacy summaries without changing legacy keys', () => {
    values.set(completedKey, JSON.stringify([fixtures.completed]));
    values.set(countsKey, JSON.stringify({ q1: 300 }));
    values.set('meducation.lowest-scores.v1', JSON.stringify({ q1: 20 }));
    values.set('meducation.latest-scores.v1', JSON.stringify({ q1: { percentage: 75, completedAt: '2026-09-22T00:00:00.000Z' } }));
    const legacy = new Map(values);
    const repository = new LocalAttemptRepository();
    expect(repository.completionCount('q1')).toBe(300);
    repository.saveActive({ ...fixtures.legacyActive, id: 'new-active' } as Attempt);

    for (const [key, value] of legacy) expect(values.get(key)).toBe(value);
    expect(values.has(progressKey)).toBe(true);
    const reopened = new LocalAttemptRepository();
    expect(reopened.completionCount('q1')).toBe(300);
    expect(reopened.lowestScore('q1')).toBe(20);
    expect(reopened.latestScore('q1')?.percentage).toBe(75);
    expect(reopened.getActive('q1')?.id).toBe('new-active');
  });

  it('keeps legacy data usable after a failed migration', () => {
    values.set(activeKey, JSON.stringify({ q1: fixtures.legacyActive }));
    failKey = progressKey;
    const repository = new LocalAttemptRepository();
    expect(() => repository.saveActive({ ...fixtures.legacyActive, id: 'replacement' } as Attempt)).toThrow(PersistenceError);
    expect(values.has(progressKey)).toBe(false);
    expect(new LocalAttemptRepository().getActive('q1')?.id).toBe(fixtures.legacyActive.id);
    failKey = undefined;
    repository.saveActive({ ...fixtures.legacyActive, id: 'replacement' } as Attempt);
    expect(new LocalAttemptRepository().getActive('q1')?.id).toBe('replacement');
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
    second.saveActive({ ...fixtures.legacyActive, id: 'second-tab' } as Attempt);
    expect(() => first.saveActive({ ...fixtures.legacyActive, id: 'first-tab' } as Attempt))
      .toThrowError(PersistenceError);
    expect(second.getActive('q1')?.id).toBe('second-tab');
  });

  it('does not overwrite an unreadable versioned record', () => {
    values.set(progressKey, '{"schemaVersion":2,"revision":"broken"}');
    values.set(activeKey, JSON.stringify({ q1: fixtures.legacyActive }));
    const repository = new LocalAttemptRepository();
    expect(repository.getActive('q1')?.id).toBe(fixtures.legacyActive.id);
    expect(repository.getStorageError()).toBeDefined();
    expect(() => repository.saveActive(fixtures.legacyActive as Attempt)).toThrow(PersistenceError);
    expect(values.get(progressKey)).toBe('{"schemaVersion":2,"revision":"broken"}');
  });
});

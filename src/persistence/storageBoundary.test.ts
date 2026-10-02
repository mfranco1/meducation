import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtures from '../../tests/fixtures/storage-boundary-cases.json';
import type { Attempt, CompletedAttempt } from '../domain/types';
import { LocalAttemptRepository } from './localRepository';

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

  it.fails('rejects valid JSON with the wrong completed-history shape', () => {
    values.set(completedKey, fixtures.invalidStoredValues[1].value);
    expect(new LocalAttemptRepository().list()).toEqual([]);
  });

  it.fails('does not expose a partial completion when a later storage write fails', () => {
    const active = fixtures.legacyActive as Attempt;
    const completed = fixtures.completed as CompletedAttempt;
    values.set(activeKey, JSON.stringify({ q1: active }));
    values.set(completedKey, '[]');
    values.set(countsKey, '{}');
    values.set('meducation.lowest-scores.v1', '{}');
    values.set('meducation.latest-scores.v1', '{}');
    values.set('meducation.quiz-activity.v1', '{}');
    const before = new Map(values);
    failKey = countsKey;

    expect(() => new LocalAttemptRepository().saveCompleted(completed)).toThrow('Quota exceeded');
    expect(values).toEqual(before);
  });

  it.fails('does not count the same completed attempt twice', () => {
    const repository = new LocalAttemptRepository();
    const completed = fixtures.completed as CompletedAttempt;
    repository.saveCompleted(completed);
    repository.saveCompleted(completed);
    expect(repository.completionCount('q1')).toBe(1);
    expect(repository.list()).toHaveLength(1);
  });
});

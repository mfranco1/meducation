import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import emptyBackup from '../../tests/fixtures/progress-backups/empty-v1.json';
import { learnerProgressAdmission } from '../persistence/progressAdmission';
import { useProgressBackup } from './useProgressBackup';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

describe('progress backup interaction lifetime', () => {
  afterEach(() => { learnerProgressAdmission.close(); vi.unstubAllGlobals(); });

  it('allows cancel while File.text is pending and ignores its late result', async () => {
    learnerProgressAdmission.admit({ mode: 'shared', valid: true, release: () => undefined }, () => 'clear');
    const fileRead = deferred<string>();
    const { result } = renderHook(() => useProgressBackup(vi.fn()));
    let pending!: Promise<void>;
    act(() => result.current.show());
    act(() => { pending = result.current.chooseFile({ size: 10, text: () => fileRead.promise }); });
    expect(result.current.busy).toBe(true);
    expect(result.current.status).toBe('Reading backup…');
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    await act(async () => {
      fileRead.resolve(JSON.stringify(emptyBackup));
      await pending;
    });
    expect(result.current.open).toBe(false);
    expect(result.current.preview).toBeUndefined();
  });
});

it('unlocks the dialog after retrying a committed restore whose cleanup was interrupted', async () => {
  const values = new Map<string, string>();
  let denyCleanup = false;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => {
      if (denyCleanup && key === 'meducation.progress.restore.v1') throw new Error('unavailable');
      values.delete(key);
    },
  });
  vi.stubGlobal('navigator', { locks: { request: (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => callback({}) } });
  learnerProgressAdmission.admit({ mode: 'shared', valid: true, release: () => undefined }, () => 'clear');
  const refresh = vi.fn();
  const { result } = renderHook(() => useProgressBackup(refresh));
  act(() => result.current.show());
  await act(async () => result.current.chooseFile({ size: 100, text: async () => JSON.stringify(emptyBackup) }));
  expect(result.current.preview).toBeDefined();
  denyCleanup = true;
  await act(async () => result.current.restore());
  expect(result.current.committing).toBe(true);
  expect(result.current.recoveryRequired).toBe(true);
  denyCleanup = false;
  await act(async () => result.current.retryRecovery());
  expect(values.has('meducation.progress.restore.v1')).toBe(false);
  expect(result.current.committing).toBe(false);
  expect(result.current.recoveryRequired).toBe(false);
  expect(result.current.preview).toBeUndefined();
  act(() => result.current.close());
  expect(result.current.open).toBe(false);
  learnerProgressAdmission.close();
  vi.unstubAllGlobals();
});

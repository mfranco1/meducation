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

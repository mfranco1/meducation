import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import populated from '../../tests/fixtures/progress-backups/populated-v1.json';
import { progressKey } from '../persistence/progressCodec';
import { flashcardProgressKey } from '../persistence/flashcardProgressCodec';
import { consumeProgressChangeNotice } from '../persistence/progressBackupStorage';
import { useProgressBackup } from './useProgressBackup';

const fileOf = (body: string) => ({ size: new TextEncoder().encode(body).length, text: async () => body });

describe('progress backup dialog flow', () => {
  const values = new Map<string, string>();
  let failingKey: string | undefined;
  const reload = vi.fn();

  beforeEach(() => {
    values.clear();
    failingKey = undefined;
    reload.mockClear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === failingKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('location', { ...window.location, reload });
  });
  afterEach(() => vi.unstubAllGlobals());

  async function preview(body: string) {
    const hook = renderHook(() => useProgressBackup());
    act(() => hook.result.current.show());
    await act(async () => hook.result.current.chooseFile(fileOf(body)));
    return hook;
  }

  it('previews a valid file without writing, then replaces both stores and reloads on confirm', async () => {
    const { result } = await preview(JSON.stringify(populated));
    expect(result.current.preview?.summary.completions).toBeGreaterThan(0);
    expect(result.current.error).toBeUndefined();
    expect(values.size).toBe(0);
    act(() => result.current.restore());
    expect(values.has(progressKey)).toBe(true);
    expect(values.has(flashcardProgressKey)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(consumeProgressChangeNotice()).toBe('restored');
  });

  it('reports that nothing changed when a write fails, and does not reload', async () => {
    values.set(progressKey, 'existing-quiz');
    values.set(flashcardProgressKey, 'existing-cards');
    const { result } = await preview(JSON.stringify(populated));
    failingKey = flashcardProgressKey;
    act(() => result.current.restore());
    expect(result.current.error).toContain('Nothing was changed');
    expect(result.current.committing).toBe(false);
    expect(values.get(progressKey)).toBe('existing-quiz');
    expect(values.get(flashcardProgressKey)).toBe('existing-cards');
    expect(reload).not.toHaveBeenCalled();
  });

  it('reset clears both stores, reloads and leaves a reset notice', () => {
    values.set(progressKey, 'existing-quiz');
    values.set(flashcardProgressKey, 'existing-cards');
    const { result } = renderHook(() => useProgressBackup());
    act(() => result.current.show());
    act(() => result.current.requestReset());
    expect(result.current.resetStep).toBe(true);
    act(() => result.current.reset());
    expect(values.size).toBe(0);
    expect(reload).toHaveBeenCalledOnce();
    expect(consumeProgressChangeNotice()).toBe('reset');
  });

  it('failed reset reports an error, keeps both values and does not reload', () => {
    values.set(progressKey, 'existing-quiz');
    values.set(flashcardProgressKey, 'existing-cards');
    const { result } = renderHook(() => useProgressBackup());
    act(() => result.current.show());
    act(() => result.current.requestReset());
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { if (key === flashcardProgressKey) throw new DOMException('Denied', 'SecurityError'); values.delete(key); },
    });
    act(() => result.current.reset());
    expect(result.current.error).toContain('Nothing was changed');
    expect(result.current.committing).toBe(false);
    expect(values.get(progressKey)).toBe('existing-quiz');
    expect(values.get(flashcardProgressKey)).toBe('existing-cards');
    expect(reload).not.toHaveBeenCalled();
  });

  it('rejects an invalid file with an error, no preview and no changes', async () => {
    values.set(progressKey, 'existing-quiz');
    const { result } = await preview('{"format":"nope"}');
    expect(result.current.preview).toBeUndefined();
    expect(result.current.error).toContain('not a Meducation progress backup');
    expect(values.get(progressKey)).toBe('existing-quiz');
  });

  it('allows cancel while File.text is pending and ignores its late result', async () => {
    const { result } = renderHook(() => useProgressBackup());
    let finish!: (text: string) => void;
    const pending = new Promise<string>(resolve => { finish = resolve; });
    let reading!: Promise<void>;
    act(() => result.current.show());
    act(() => { reading = result.current.chooseFile({ size: 10, text: () => pending }); });
    expect(result.current.busy).toBe(true);
    act(() => result.current.close());
    await act(async () => { finish(JSON.stringify(populated)); await reading; });
    expect(result.current.open).toBe(false);
    expect(result.current.preview).toBeUndefined();
  });
});

import { Blob as NodeBlob } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import populated from '../../tests/fixtures/progress-backups/populated-v1.json';
import { progressKey } from '../persistence/progressCodec';
import { flashcardProgressKey } from '../persistence/flashcardProgressCodec';
import { consumeProgressChangeNotice } from '../persistence/progressBackupStorage';
import * as backupFiles from './progressBackupFiles';
import { useProgressBackup } from './useProgressBackup';

const fileOf = (body: string) => new NodeBlob([gzipSync(body)]) as unknown as Blob;

describe('progress backup dialog flow', () => {
  const values = new Map<string, string>();
  let failingKey: string | undefined;
  const reload = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('Blob', NodeBlob);
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
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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

  it('does not download after closing while compression is pending', async () => {
    let finish!: (blob: Blob) => void;
    vi.spyOn(backupFiles, 'compressProgressBackup').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:backup', revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { result } = renderHook(() => useProgressBackup());
    let pending!: Promise<void>;
    act(() => result.current.show());
    act(() => { pending = result.current.download(); });
    expect(result.current.busy).toBe(true);
    act(() => result.current.close());
    await act(async () => { finish(new Blob()); await pending; });
    expect(click).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
    expect(result.current.notice).toBeUndefined();
  });

  it('reports compression failure and clears the busy state without changing progress', async () => {
    vi.spyOn(backupFiles, 'compressProgressBackup').mockRejectedValue(new Error('compression failed'));
    const { result } = renderHook(() => useProgressBackup());
    act(() => result.current.show());
    await act(async () => result.current.download());
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toContain('could not be downloaded');
    expect(result.current.notice).toBeUndefined();
    expect(values.size).toBe(0);
  });

  it('clears the previous preview as soon as another file is selected, including invalid files', async () => {
    const { result } = await preview(JSON.stringify(populated));
    expect(result.current.preview).toBeDefined();
    let reading!: Promise<void>;
    act(() => { reading = result.current.chooseFile(fileOf('{"format":"nope"}')); });
    expect(result.current.preview).toBeUndefined();
    await act(async () => reading);
    expect(result.current.error).toContain('not a Meducation progress backup');
    expect(result.current.preview).toBeUndefined();
    act(() => result.current.restore());
    expect(values.size).toBe(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each(['close', 'unmount', 'replace'] as const)('stops reading the source file on %s', async (action) => {
    const { result, unmount } = renderHook(() => useProgressBackup());
    let cancelled!: () => void;
    const stopped = new Promise<void>(resolve => { cancelled = resolve; });
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(Uint8Array.from(gzipSync(JSON.stringify(populated)).subarray(0, 10))); },
      cancel() { cancelled(); },
    });
    let reading!: Promise<void>;
    act(() => result.current.show());
    act(() => { reading = result.current.chooseFile({ size: 10, stream: () => stream }); });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      if (action === 'close') result.current.close();
      else if (action === 'unmount') unmount();
      else await result.current.chooseFile(fileOf('{"format":"nope"}'));
      await stopped;
      await reading;
    });
    expect(values.size).toBe(0);
    if (action !== 'unmount') {
      expect(result.current.busy).toBe(false);
      expect(result.current.preview).toBeUndefined();
      if (action === 'close') {
        expect(result.current.open).toBe(false);
        expect(result.current.error).toBeUndefined();
      } else expect(result.current.error).toContain('not a Meducation progress backup');
    }
  });
});

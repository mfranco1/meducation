import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJsonWithRetry } from './contentTransport';

const noRetries = { maxRetries: 0, baseDelayMs: 100, maxDelayMs: 100 };

afterEach(() => vi.unstubAllGlobals());

describe('content transport', () => {
  it('keeps raw network exception details out of developer log fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('socket ECONNREFUSED private detail')));
    await expect(getJsonWithRetry('/api/v1/subjects', { policy: noRetries })).rejects.toMatchObject({
      kind: 'network',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private detail');
    warn.mockRestore();
  });

  it('honors Retry-After on 503 and does not retry a permanent HTTP failure', async () => {
    const retryingFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => '2' } })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true }) });
    vi.stubGlobal('fetch', retryingFetch);
    vi.useFakeTimers();
    try {
      const onRetry = vi.fn();
      const request = getJsonWithRetry('/api/v1/subjects', {
        policy: { maxRetries: 1, baseDelayMs: 500, maxDelayMs: 3000 },
        random: () => 0,
        onRetry,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(onRetry).toHaveBeenCalledWith(1, 2000, 2000);
      await vi.advanceTimersByTimeAsync(1999);
      expect(retryingFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(request).resolves.toEqual({ ready: true });
      expect(retryingFetch).toHaveBeenCalledTimes(2);

      const permanentFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: (name: string) => (name === 'X-Request-ID' ? 'req-1234' : null) },
      });
      vi.stubGlobal('fetch', permanentFetch);
      await expect(
        getJsonWithRetry('/api/v1/missing', { policy: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 3000 } }),
      ).rejects.toMatchObject({ kind: 'http', status: 404, requestId: 'req-1234' });
      expect(permanentFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops instead of exceeding the delay limit from Retry-After', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => '31' } });
    vi.stubGlobal('fetch', fetchMock);
    const onRetry = vi.fn();
    await expect(
      getJsonWithRetry('/api/v1/subjects', {
        policy: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 30_000 },
        onRetry,
      }),
    ).rejects.toMatchObject({ kind: 'http', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});

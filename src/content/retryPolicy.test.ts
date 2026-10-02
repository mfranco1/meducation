import { describe, expect, it, vi } from 'vitest';
import { isRetryableStatus, readRetryPolicy, retryAfterMs, retryDelayMs, type RetryPolicy } from './retryPolicy';

const policy: RetryPolicy = { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 2500 };

describe('content retry policy', () => {
  it('uses bounded defaults and accepts valid build-time overrides', () => {
    expect(readRetryPolicy({})).toEqual({ maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 8000 });
    expect(readRetryPolicy({ VITE_CONTENT_MAX_RETRIES: '0', VITE_CONTENT_RETRY_BASE_DELAY_MS: '200', VITE_CONTENT_RETRY_MAX_DELAY_MS: '900' }))
      .toEqual({ maxRetries: 0, baseDelayMs: 200, maxDelayMs: 900 });
  });

  it('falls back for invalid values and inconsistent delay limits', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(readRetryPolicy({ VITE_CONTENT_MAX_RETRIES: '9', VITE_CONTENT_RETRY_BASE_DELAY_MS: '5000', VITE_CONTENT_RETRY_MAX_DELAY_MS: '10' }))
      .toEqual({ maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 8000 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('doubles the delay ceiling, applies jitter, and caps it', () => {
    expect(retryDelayMs(1, policy, () => 0)).toBe(500);
    expect(retryDelayMs(2, policy, () => 1)).toBe(2000);
    expect(retryDelayMs(5, policy, () => 1)).toBe(2500);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    expect(retryAfterMs('2', 0)).toBe(2000);
    expect(retryAfterMs('Thu, 01 Jan 1970 00:00:03 GMT', 0)).toBe(3000);
    expect(retryAfterMs('n/a', 0)).toBeUndefined();
  });

  it('retries only the selected transient HTTP statuses', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) expect(isRetryableStatus(status)).toBe(true);
    for (const status of [400, 401, 404, 409, 501]) expect(isRetryableStatus(status)).toBe(false);
  });
});

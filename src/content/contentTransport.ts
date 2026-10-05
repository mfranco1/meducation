import { contentRetryPolicy, isRetryableStatus, retryAfterMs, retryDelayMs, type RetryPolicy } from './retryPolicy';
import { logContentDiagnostic } from './contentLogger';

export type ContentErrorKind = 'timeout' | 'network' | 'http' | 'invalid' | 'revision' | 'cancelled';

export class ContentLoadError extends Error {
  constructor(readonly kind: ContentErrorKind, message: string, readonly status?: number, readonly retryAfter?: string | null) { super(message); this.name = 'ContentLoadError'; }
}

export const revisionError = () => new ContentLoadError('revision', 'Quiz content changed. Reload content to get the latest version.');
const timeoutMs = 15_000;

export const genericFailure = (kind: ContentErrorKind, status?: number, retryAfter?: string | null) =>
  new ContentLoadError(kind, 'The content request could not be completed.', status, retryAfter);

function waitForRetry(delayMs: number, signal?: AbortSignal, retryNowSignal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(genericFailure('cancelled'));
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); retryNowSignal?.removeEventListener('abort', retryNow); resolve(); };
    const timer = setTimeout(finish, delayMs);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); retryNowSignal?.removeEventListener('abort', retryNow); reject(genericFailure('cancelled')); };
    const retryNow = () => finish();
    signal?.addEventListener('abort', abort, { once: true });
    retryNowSignal?.addEventListener('abort', retryNow, { once: true });
  });
}

export interface JsonTransport {
  get<T>(path: string, options?: {
    signal?: AbortSignal;
    policy?: RetryPolicy;
    random?: () => number;
    onRetry?: (retryNumber: number, delayMs: number, retryAfterMs?: number) => void;
    onAttempt?: () => void;
    getRetryNowSignal?: () => AbortSignal | undefined;
  }): Promise<T>;
}

export async function getJsonWithRetry<T>(
  path: string,
  options: {
    signal?: AbortSignal;
    policy?: RetryPolicy;
    random?: () => number;
    onRetry?: (retryNumber: number, delayMs: number, retryAfterMs?: number) => void;
    onAttempt?: () => void;
    getRetryNowSignal?: () => AbortSignal | undefined;
  } = {},
): Promise<T> {
  const policy = options.policy ?? contentRetryPolicy;
  for (let attempt = 0; ; attempt++) {
    if (options.signal?.aborted) throw genericFailure('cancelled');
    options.onAttempt?.();
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let parentAborted = false;
    let timedOut = false;
    const abortFromParent = () => { parentAborted = true; controller.abort(); };
    let rejectParentAbort: ((reason?: unknown) => void) | undefined;
    const abort = new Promise<never>((_, reject) => { rejectParentAbort = reject; });
    const notifyParentAbort = () => { abortFromParent(); rejectParentAbort?.(genericFailure('cancelled')); };
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
    options.signal?.addEventListener('abort', notifyParentAbort, { once: true });
    if (options.signal?.aborted) notifyParentAbort();
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(genericFailure('timeout'));
      }, timeoutMs);
    });
    let failure: ContentLoadError | undefined;
    try {
      const request = fetch(path, { headers: { Accept: 'application/json' }, signal: controller.signal }).then(async response => {
        if (response.status === 409) throw revisionError();
        if (!response.ok) throw genericFailure('http', response.status, response.headers.get('Retry-After'));
        try { return await response.json() as T; }
        catch { throw genericFailure('invalid'); }
      });
      const result = await Promise.race([request, timeout, abort]);
      if (options.signal?.aborted) throw genericFailure('cancelled');
      return result;
    } catch (error) {
      if (parentAborted || options.signal?.aborted) throw genericFailure('cancelled');
      failure = error instanceof ContentLoadError
        ? error
        : timedOut ? genericFailure('timeout') : genericFailure('network');
      const retryable = failure.kind === 'timeout' || failure.kind === 'network'
        || (failure.kind === 'http' && failure.status !== undefined && isRetryableStatus(failure.status));
      const retryNumber = attempt + 1;
      const serverDelay = failure.status === 429 || failure.status === 503
        ? retryAfterMs(failure.retryAfter ?? null)
        : undefined;
      const exhausted = attempt >= policy.maxRetries;
      const serverDelayTooLong = serverDelay !== undefined && serverDelay > policy.maxDelayMs;
      const delay = retryable && !exhausted && !serverDelayTooLong
        ? Math.max(retryDelayMs(retryNumber, policy, options.random), serverDelay ?? 0)
        : undefined;
      logContentDiagnostic('Request attempt failed.', {
        resource: path.split('?')[0],
        category: failure.kind,
        ...(failure.status === undefined ? {} : { status: failure.status }),
        attempt: retryNumber,
        retrying: delay !== undefined,
        retryBudgetExhausted: exhausted,
        retryAfterLimitExceeded: serverDelayTooLong,
        ...(delay === undefined ? {} : { nextDelayMs: delay }),
      });
      if (delay === undefined) throw failure;
      options.onRetry?.(retryNumber, delay, serverDelay);
      if (timeoutId !== undefined) { clearTimeout(timeoutId); timeoutId = undefined; }
      await waitForRetry(delay, options.signal, options.getRetryNowSignal?.());
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortFromParent);
      options.signal?.removeEventListener('abort', notifyParentAbort);
    }
  }
}

export const browserJsonTransport: JsonTransport = { get: getJsonWithRetry };

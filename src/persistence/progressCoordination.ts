export const PROGRESS_COORDINATION_LOCK = 'meducation.progress.coordination.v1';

export type ProgressLockMode = 'shared' | 'exclusive';
export interface ProgressLockPort {
  request<T>(
    name: string,
    options: { mode: ProgressLockMode; ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown | null) => T | Promise<T>,
  ): Promise<T>;
}

export interface ProgressLease {
  readonly mode: ProgressLockMode;
  readonly valid: boolean;
  release(): void;
}

export type ProgressCoordinationResult =
  | { kind: 'acquired'; lease: ProgressLease }
  | { kind: 'unsupported-browser' | 'timed-out' | 'unavailable' };

/**
 * Owns one Web Lock for the lifetime of each returned lease. A document must
 * release its shared lease before asking for exclusive paired progress work.
 */
export class ProgressCoordination {
  constructor(
    private readonly locks: ProgressLockPort | undefined,
    private readonly sharedWaitMs = 5_000,
  ) {}

  acquireShared(): Promise<ProgressCoordinationResult> {
    return this.acquire('shared', false, this.sharedWaitMs);
  }

  /** Returns unavailable immediately when any cooperating document holds the lock. */
  acquireExclusive(): Promise<ProgressCoordinationResult> {
    return this.acquire('exclusive', true);
  }

  /** Startup recovery may wait briefly for an in-flight restore to finish. */
  acquireExclusiveForRecovery(): Promise<ProgressCoordinationResult> {
    return this.acquire('exclusive', false, this.sharedWaitMs);
  }

  private acquire(mode: ProgressLockMode, ifAvailable: boolean, timeoutMs?: number): Promise<ProgressCoordinationResult> {
    if (!this.locks) return Promise.resolve({ kind: 'unsupported-browser' });

    return new Promise(resolve => {
      let settled = false;
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const controller = timeoutMs === undefined ? undefined : new AbortController();
      const settle = (result: ProgressCoordinationResult) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        resolve(result);
      };

      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          timedOut = true;
          controller?.abort();
          settle({ kind: 'timed-out' });
        }, timeoutMs);
      }

      let request: Promise<unknown>;
      try {
        request = this.locks!.request(PROGRESS_COORDINATION_LOCK, {
          mode,
          ifAvailable,
          ...(controller ? { signal: controller.signal } : {}),
        }, async lock => {
          if (lock === null) {
            settle({ kind: 'unavailable' });
            return;
          }
          // Acquisition can race the abort timer; returning releases the lock
          // immediately instead of stranding an unowned lease.
          if (settled) return;

          let releaseGate!: () => void;
          const held = new Promise<void>(resolveGate => { releaseGate = resolveGate; });
          let valid = true;
          const lease: ProgressLease = {
            mode,
            get valid() { return valid; },
            release() {
              if (!valid) return;
              valid = false;
              releaseGate();
            },
          };
          settle({ kind: 'acquired', lease });
          await held;
        });
      } catch {
        settle(timedOut ? { kind: 'timed-out' } : { kind: 'unavailable' });
        return;
      }

      void request.then(
        () => { if (!settled) settle(timedOut ? { kind: 'timed-out' } : { kind: 'unavailable' }); },
        () => { if (!settled) settle(timedOut ? { kind: 'timed-out' } : { kind: 'unavailable' }); },
      );
    });
  }
}

/** Keep the browser global lookup inside persistence and make unsupported environments explicit. */
export function createBrowserProgressCoordination(): ProgressCoordination {
  if (typeof navigator === 'undefined' || !navigator.locks) return new ProgressCoordination(undefined);
  const manager = navigator.locks;
  // The DOM lib still types LockGrantedCallback as synchronous although the
  // Web Locks API accepts a promise and holds the lock until it settles.
  const request = manager.request.bind(manager) as unknown as ProgressLockPort['request'];
  const port: ProgressLockPort = {
    request,
  };
  return new ProgressCoordination(port);
}

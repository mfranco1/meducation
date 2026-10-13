import { describe, expect, it } from 'vitest';
import { PROGRESS_COORDINATION_LOCK, ProgressCoordination, type ProgressLockPort } from './progressCoordination';

class FakeLocks implements ProgressLockPort {
  private shared = 0;
  private exclusive = false;
  readonly requests: Array<{ name: string; mode: string; ifAvailable?: boolean }> = [];

  request<T>(name: string, options: { mode: 'shared' | 'exclusive'; ifAvailable?: boolean; signal?: AbortSignal }, callback: (lock: unknown | null) => T | Promise<T>): Promise<T> {
    this.requests.push({ name, mode: options.mode, ifAvailable: options.ifAvailable });
    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (options.signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const available = options.mode === 'shared' ? !this.exclusive : !this.exclusive && this.shared === 0;
        if (!available) {
          if (options.ifAvailable) return Promise.resolve(callback(null)).then(resolve, reject);
          options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
          return;
        }
        if (options.mode === 'shared') this.shared++;
        else this.exclusive = true;
        Promise.resolve(callback({ name })).then(resolve, reject).finally(() => {
          if (options.mode === 'shared') this.shared--;
          else this.exclusive = false;
        });
      };
      attempt();
    });
  }
}

describe('progress coordination', () => {
  it('reports missing Web Locks support without pretending to admit progress', async () => {
    const result = await new ProgressCoordination(undefined).acquireShared();
    expect(result).toEqual({ kind: 'unsupported-browser' });
  });

  it('holds shared participation until release and refuses exclusive work while held', async () => {
    const locks = new FakeLocks();
    const coordination = new ProgressCoordination(locks);
    const sharedResult = await coordination.acquireShared();
    expect(sharedResult.kind).toBe('acquired');
    if (sharedResult.kind !== 'acquired') return;
    expect(sharedResult.lease.valid).toBe(true);
    expect(await coordination.acquireExclusive()).toEqual({ kind: 'unavailable' });
    expect(locks.requests[0]).toEqual({ name: PROGRESS_COORDINATION_LOCK, mode: 'shared', ifAvailable: false });

    sharedResult.lease.release();
    sharedResult.lease.release();
    expect(sharedResult.lease.valid).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    const exclusiveResult = await coordination.acquireExclusive();
    expect(exclusiveResult.kind).toBe('acquired');
    if (exclusiveResult.kind === 'acquired') exclusiveResult.lease.release();
  });

  it('bounds queued shared admission and distinguishes an immediate exclusive refusal', async () => {
    const locks = new FakeLocks();
    const coordination = new ProgressCoordination(locks, 10);
    const first = await coordination.acquireShared();
    expect(first.kind).toBe('acquired');
    expect(await coordination.acquireExclusive()).toEqual({ kind: 'unavailable' });
    if (first.kind === 'acquired') first.lease.release();
    await new Promise(resolve => setTimeout(resolve, 0));
    const exclusive = await coordination.acquireExclusive();
    expect(exclusive.kind).toBe('acquired');
    expect(await coordination.acquireShared()).toEqual({ kind: 'timed-out' });
    if (exclusive.kind === 'acquired') exclusive.lease.release();
  });

  it('releases a lock that races the admission timeout before ownership is returned', async () => {
    let grant!: (lock: unknown | null) => void | Promise<void>;
    const latePort: ProgressLockPort = {
      request: (_name, _options, callback) => new Promise(resolve => {
        grant = lock => { void Promise.resolve(callback(lock)).then(resolve); };
      }),
    };
    const result = await new ProgressCoordination(latePort, 5).acquireShared();
    expect(result).toEqual({ kind: 'timed-out' });
    await expect(Promise.resolve(grant({}))).resolves.toBeUndefined();
  });
});

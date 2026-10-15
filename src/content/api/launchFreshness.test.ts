import { describe, expect, it, vi } from 'vitest';
import { LaunchFreshness } from './launchFreshness';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('launch validation admission', () => {
  it('coalesces only pending checks and does no work while idle', async () => {
    const gate = new LaunchFreshness();
    const response = deferred();
    const validate = vi.fn(() => response.promise);
    const first = gate.check('quiz', validate);
    const second = gate.check('quiz', validate);
    expect(first).toBe(second);
    expect(validate).toHaveBeenCalledTimes(1);
    response.resolve();
    const admit = await first;
    admit();
    admit();
    expect(validate).toHaveBeenCalledTimes(1);
    await gate.check('quiz', validate);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it.each([29_999, 30_000, 30_001])('ages evidence from request start at %i ms', async age => {
    let now = 0;
    const gate = new LaunchFreshness(() => now);
    const admit = await gate.check('deck', async () => undefined);
    now = age;
    if (age < 30_000) expect(admit).not.toThrow();
    else expect(admit).toThrow(expect.objectContaining({ kind: 'timeout' }));
  });

  it('rejects slow responses/retries and permits a new explicit attempt', async () => {
    let now = 0;
    const gate = new LaunchFreshness(() => now);
    await expect(gate.check('deck', async () => { now = 30_000; })).rejects.toMatchObject({ kind: 'timeout' });
    const admit = await gate.check('deck', async () => undefined);
    expect(admit).not.toThrow();
  });

  it('does not retain failed evidence or admit late replies after cancellation', async () => {
    const gate = new LaunchFreshness();
    await expect(gate.check('quiz', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    const old = deferred();
    const stale = gate.check('quiz', () => old.promise);
    gate.cancelAll();
    const admit = await gate.check('quiz', async () => undefined);
    old.resolve();
    await expect(stale).rejects.toMatchObject({ kind: 'cancelled' });
    expect(admit).not.toThrow();
    gate.cancelAll();
    expect(admit).toThrow(expect.objectContaining({ kind: 'cancelled' }));
  });
});

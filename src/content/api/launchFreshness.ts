import { genericFailure } from './contentTransport';

/** Request-driven evidence only: never replaces the arrays backing active study. */
export class LaunchFreshness {
  private generation = 0;
  private readonly pending = new Map<string, { controller: AbortController; request: Promise<() => void> }>();

  constructor(private readonly now = () => performance.now()) {}

  check(key: string, validate: (signal: AbortSignal) => Promise<void>): Promise<() => void> {
    const existing = this.pending.get(key);
    if (existing) return existing.request;
    const generation = this.generation;
    const started = this.now();
    const controller = new AbortController();
    const admit = () => {
      if (controller.signal.aborted || generation !== this.generation) throw genericFailure('cancelled');
      if (this.now() - started >= 30_000) throw genericFailure('timeout');
    };
    const request = validate(controller.signal).then(() => { admit(); return admit; });
    this.pending.set(key, { controller, request });
    const clear = () => { if (this.pending.get(key)?.request === request) this.pending.delete(key); };
    void request.then(clear, clear);
    return request;
  }

  cancelAll() {
    this.generation++;
    this.pending.forEach(({ controller }) => controller.abort());
    this.pending.clear();
  }
}

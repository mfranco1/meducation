import type { StoragePort } from './progressCodec';

export class PersistenceError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'conflict' | 'corrupt' | 'quota',
    message: string,
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  );
}

export interface LocalJsonStoreConfig<T extends { revision: string }> {
  key: string;
  messages: { unavailable: string; conflict: string; corrupt: string };
  empty(): T;
  /** Missing data yields the empty state. Undecodable data yields an empty state flagged corrupt. */
  read(raw: string | null): { state: T; revision: string; corrupt?: boolean };
  freeze(state: T): T;
}

/**
 * One localStorage key holding a revisioned JSON state. Snapshots are cached and frozen for
 * useSyncExternalStore: reads never write, and writes or `storage` events invalidate the cache.
 */
export class LocalJsonStore<T extends { revision: string }> {
  private observedStorage?: StoragePort;
  /** Raw value this store last read or wrote. `undefined` means not yet observed. */
  private observedRaw: string | null | undefined;
  private cached?: T;
  private storageError?: string;
  private readonly listeners = new Set<() => void>();
  private listening = false;

  constructor(
    private readonly config: LocalJsonStoreConfig<T>,
    private readonly suppliedStorage?: StoragePort,
  ) {}

  private storage(): StoragePort {
    const storage = this.suppliedStorage ?? localStorage;
    if (storage !== this.observedStorage) {
      this.observedStorage = storage;
      this.observedRaw = undefined;
      this.cached = undefined;
      this.storageError = undefined;
    }
    return storage;
  }

  state(): T {
    const { config } = this;
    try {
      const storage = this.storage();
      if (this.cached && this.storageError !== config.messages.unavailable) return this.cached;
      const raw = storage.getItem(config.key);
      const { state, corrupt } = config.read(raw);
      if (this.observedRaw === undefined) this.observedRaw = raw;
      this.storageError = corrupt ? config.messages.corrupt : undefined;
      return (this.cached = config.freeze(state));
    } catch {
      this.storageError = config.messages.unavailable;
      return (this.cached ??= config.freeze(config.empty()));
    }
  }

  getStorageError = () => this.storageError;

  private readonly onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== this.config.key) return;
    this.cached = undefined;
    for (const listener of this.listeners) listener();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.listening && typeof window !== 'undefined') {
      window.addEventListener('storage', this.onStorage);
      this.listening = true;
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listening && this.listeners.size === 0) {
        window.removeEventListener('storage', this.onStorage);
        this.listening = false;
      }
    };
  };

  /** Applies `change` to the current state and writes the result under a new revision. Returning undefined skips the write. */
  commit(change: (state: T) => T | undefined): void {
    const { config } = this;
    const state = this.state();
    if (this.storageError)
      throw new PersistenceError(
        this.storageError === config.messages.corrupt ? 'corrupt' : 'unavailable',
        this.storageError,
      );
    try {
      const storage = this.storage();
      if (storage.getItem(config.key) !== this.observedRaw)
        throw new PersistenceError('conflict', config.messages.conflict);
      const next = change(state);
      if (!next) return;
      next.revision = crypto.randomUUID();
      const serialized = JSON.stringify(next);
      try {
        storage.setItem(config.key, serialized);
      } catch (error) {
        throw isQuotaError(error)
          ? new PersistenceError('quota', config.messages.unavailable)
          : new PersistenceError('unavailable', config.messages.unavailable);
      }
      this.observedRaw = serialized;
      this.cached = config.freeze(next);
      for (const listener of this.listeners) listener();
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError('unavailable', config.messages.unavailable);
    }
  }
}

import type { StoragePort } from './progressCodec';

export class PersistenceError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'conflict' | 'corrupt',
    message: string,
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export interface LocalJsonStoreConfig<T extends { revision: string }> {
  key: string;
  messages: { unavailable: string; conflict: string; corrupt: string };
  empty(): T;
  /** Missing data yields the empty state. Undecodable data yields an empty state flagged corrupt. */
  read(storage: StoragePort): { state: T; revision: string; corrupt?: boolean };
  freeze(state: T): T;
}

/**
 * One localStorage key holding a revisioned JSON state. Snapshots are cached and frozen for
 * useSyncExternalStore: reads never write, and writes or `storage` events invalidate the cache.
 */
export class LocalJsonStore<T extends { revision: string }> {
  private observedStorage?: StoragePort;
  private observedRevision: string | undefined;
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
      this.observedRevision = undefined;
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
      const { state, revision, corrupt } = config.read(storage);
      this.observedRevision ??= revision;
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
      const current = config.read(storage).revision;
      if (current !== this.observedRevision) throw new PersistenceError('conflict', config.messages.conflict);
      const next = change(state);
      if (!next) return;
      next.revision = crypto.randomUUID();
      const serialized = JSON.stringify(next);
      storage.setItem(config.key, serialized);
      if (storage.getItem(config.key) !== serialized)
        throw new PersistenceError('unavailable', config.messages.unavailable);
      this.observedRevision = next.revision;
      this.cached = config.freeze(next);
      for (const listener of this.listeners) listener();
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError('unavailable', config.messages.unavailable);
    }
  }
}

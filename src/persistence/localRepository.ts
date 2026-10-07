import type { Attempt, AttemptRepository, CompletedAttempt, RecentScore } from '../domain/types';
import { decodeProgress, emptyProgress, progressKey, type ProgressState, type StoragePort } from './progressCodec';

const completedAttemptLimit = 200;
const unavailableMessage = 'Progress could not be saved. Check browser storage and try again.';
const conflictMessage = 'Progress changed in another tab. Reload this page before continuing.';
const corruptMessage = 'Saved progress could not be read safely. The original browser data has been kept.';

export class PersistenceError extends Error {
  constructor(readonly kind: 'unavailable' | 'conflict' | 'corrupt', message: string) {
    super(message);
    this.name = 'PersistenceError';
  }
}

function freezeProgress<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeProgress(child);
    Object.freeze(value);
  }
  return value;
}

export class LocalAttemptRepository implements AttemptRepository {
  private observedStorage?: StoragePort;
  private observedRevision: string | null | undefined;
  private storageError?: string;
  private cachedState?: ProgressState;
  private readonly listeners = new Set<() => void>();
  private listening = false;

  constructor(private readonly suppliedStorage?: StoragePort) {}

  private storage(): StoragePort {
    const storage = this.suppliedStorage ?? localStorage;
    if (storage !== this.observedStorage) {
      this.observedStorage = storage;
      this.observedRevision = undefined;
      this.storageError = undefined;
      this.cachedState = undefined;
    }
    return storage;
  }

  private state(): ProgressState {
    try {
      const storage = this.storage();
      if (this.cachedState) return this.cachedState;
      const raw = storage.getItem(progressKey);
      if (raw !== null) {
        let parsed: unknown;
        try { parsed = JSON.parse(raw) as unknown; } catch { parsed = undefined; }
        const state = decodeProgress(parsed);
        if (!state) {
          this.storageError = corruptMessage;
          if (this.observedRevision === undefined) this.observedRevision = 'corrupt';
          return this.cachedState = freezeProgress(emptyProgress());
        }
        if (this.observedRevision === undefined) this.observedRevision = state.revision;
        this.storageError = undefined;
        return this.cachedState = freezeProgress(state);
      }
      if (this.observedRevision === undefined) this.observedRevision = null;
      this.storageError = undefined;
      return this.cachedState = freezeProgress(emptyProgress());
    } catch {
      this.storageError = unavailableMessage;
      return this.cachedState = freezeProgress(emptyProgress());
    }
  }

  getSnapshot = (): ProgressState => this.state();

  private readonly onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== progressKey) return;
    this.cachedState = undefined;
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

  getStorageError(): string | undefined {
    return this.storageError;
  }

  private commit(change: (state: ProgressState) => ProgressState | undefined): void {
    const state = this.state();
    if (this.storageError) throw new PersistenceError(this.storageError === corruptMessage ? 'corrupt' : 'unavailable', this.storageError);
    try {
      const storage = this.storage();
      const raw = storage.getItem(progressKey);
      const current = raw === null ? null : decodeProgress(JSON.parse(raw) as unknown)?.revision ?? 'corrupt';
      if (current !== this.observedRevision) throw new PersistenceError('conflict', conflictMessage);
      const next = change(state);
      if (!next) return;
      next.revision = crypto.randomUUID();
      const serialized = JSON.stringify(next);
      storage.setItem(progressKey, serialized);
      if (storage.getItem(progressKey) !== serialized) throw new PersistenceError('unavailable', unavailableMessage);
      this.observedRevision = next.revision;
      this.cachedState = freezeProgress(next);
      for (const listener of this.listeners) listener();
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError('unavailable', unavailableMessage);
    }
  }

  list(): CompletedAttempt[] { return this.state().completed; }
  completionCount(quizId: string): number { return this.state().completionCounts[quizId] ?? 0; }
  lowestScore(quizId: string): number | undefined { return this.state().lowestScores[quizId]; }
  latestScore(quizId: string): RecentScore | undefined { return this.state().latestScores[quizId]; }

  latestActivityAt(quizId: string): string | undefined {
    return this.state().activity[quizId];
  }

  getActive(quizId: string): Attempt | undefined { return this.state().active[quizId]; }
  hasActiveAttempts(): boolean { return Object.keys(this.state().active).length > 0; }

  saveActive(attempt: Attempt): void {
    this.commit(state => {
      if (state.completedIds[attempt.id]) throw new PersistenceError('conflict', conflictMessage);
      return {
        ...state,
        active: { ...state.active, [attempt.quizId]: attempt },
        activity: { ...state.activity, [attempt.quizId]: new Date().toISOString() },
      };
    });
  }

  clearActive(quizId: string): void {
    this.commit(state => {
      if (!state.active[quizId]) return undefined;
      const active = { ...state.active };
      delete active[quizId];
      return { ...state, active };
    });
  }

  saveCompleted(attempt: CompletedAttempt): void {
    this.commit(state => {
      const active = { ...state.active };
      const removedActive = active[attempt.quizId]?.id === attempt.id;
      if (removedActive) delete active[attempt.quizId];
      if (state.completedIds[attempt.id]) return removedActive ? { ...state, active } : undefined;
      const historical = { ...attempt };
      delete historical.contentSignature;
      const previousLatest = state.latestScores[attempt.quizId];
      const latest = !previousLatest || attempt.completedAt >= previousLatest.completedAt
        ? { percentage: attempt.score.percentage, completedAt: attempt.completedAt }
        : previousLatest;
      return {
        ...state,
        active,
        completed: [historical, ...state.completed].slice(0, completedAttemptLimit),
        completedIds: { ...state.completedIds, [attempt.id]: true },
        completionCounts: { ...state.completionCounts, [attempt.quizId]: (state.completionCounts[attempt.quizId] ?? 0) + 1 },
        lowestScores: { ...state.lowestScores, [attempt.quizId]: Math.min(state.lowestScores[attempt.quizId] ?? 100, attempt.score.percentage) },
        latestScores: { ...state.latestScores, [attempt.quizId]: latest },
        activity: { ...state.activity, [attempt.quizId]: attempt.completedAt },
      };
    });
  }
}

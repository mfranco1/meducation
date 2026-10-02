import type { Attempt, AttemptRepository, CompletedAttempt, RecentScore } from '../domain/types';
import { decodeLegacy, decodeProgress, progressKey, type ProgressState, type StoragePort } from './progressCodec';

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

function latestTimestamp(...timestamps: Array<string | undefined>): string | undefined {
  return timestamps.filter((value): value is string => value !== undefined).sort().at(-1);
}

export class LocalAttemptRepository implements AttemptRepository {
  private observedStorage?: StoragePort;
  private observedRevision: string | null | undefined;
  private storageError?: string;

  constructor(private readonly suppliedStorage?: StoragePort) {}

  private storage(): StoragePort {
    const storage = this.suppliedStorage ?? localStorage;
    if (storage !== this.observedStorage) {
      this.observedStorage = storage;
      this.observedRevision = undefined;
      this.storageError = undefined;
    }
    return storage;
  }

  private state(): ProgressState {
    try {
      const storage = this.storage();
      const raw = storage.getItem(progressKey);
      if (raw !== null) {
        let parsed: unknown;
        try { parsed = JSON.parse(raw) as unknown; } catch { parsed = undefined; }
        const state = decodeProgress(parsed);
        if (!state) {
          this.storageError = corruptMessage;
          if (this.observedRevision === undefined) this.observedRevision = 'corrupt';
          return decodeLegacy(storage);
        }
        if (this.observedRevision === undefined) this.observedRevision = state.revision;
        this.storageError = undefined;
        return state;
      }
      if (this.observedRevision === undefined) this.observedRevision = null;
      this.storageError = undefined;
      return decodeLegacy(storage);
    } catch {
      this.storageError = unavailableMessage;
      return decodeLegacy({ getItem: () => null, setItem: () => undefined });
    }
  }

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
    const state = this.state();
    return state.activity[quizId] ?? latestTimestamp(state.active[quizId]?.startedAt, state.latestScores[quizId]?.completedAt);
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

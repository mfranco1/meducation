import type { Attempt, AttemptRepository, CompletedAttempt, RecentScore } from '../domain/types';
import { LocalJsonStore, PersistenceError } from './localJsonStore';
import { MAX_COMPLETED_ATTEMPTS } from './progressBackupCodec';
import { decodeProgress, emptyProgress, progressKey, type ProgressState, type StoragePort } from './progressCodec';

/** Serialized progress above this many characters drops the oldest completed attempts (localStorage allows about 5M). */
const historyBudgetChars = 2_500_000;
const messages = {
  unavailable: 'Progress could not be saved. Check browser storage and try again.',
  conflict: 'Progress changed in another tab. Reload this page before continuing.',
  corrupt: 'Saved progress could not be read safely. The original browser data has been kept.',
};

function freezeProgress<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeProgress(child);
    Object.freeze(value);
  }
  return value;
}

function readProgress(raw: string | null) {
  if (raw === null) return { state: emptyProgress(), revision: 'initial' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    parsed = undefined;
  }
  const state = decodeProgress(parsed);
  return state ? { state, revision: state.revision } : { state: emptyProgress(), revision: 'corrupt', corrupt: true };
}

export class LocalAttemptRepository implements AttemptRepository {
  private readonly store: LocalJsonStore<ProgressState>;

  constructor(storage?: StoragePort) {
    this.store = new LocalJsonStore(
      { key: progressKey, messages, empty: emptyProgress, read: readProgress, freeze: freezeProgress },
      storage,
    );
  }

  getSnapshot = (): ProgressState => this.store.state();
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  getStorageError(): string | undefined {
    return this.store.getStorageError();
  }

  private state = () => this.store.state();
  /** When browser storage is full, drops the oldest half of the completed history and retries the same change. */
  private commit(change: (state: ProgressState) => ProgressState | undefined) {
    let keep: number | undefined;
    for (;;) {
      let length = 0;
      try {
        this.store.commit((state) => {
          const next = change(state);
          if (next && keep !== undefined) next.completed = next.completed.slice(0, keep);
          length = next?.completed.length ?? 0;
          return next;
        });
        return;
      } catch (error) {
        if (!(error instanceof PersistenceError && error.kind === 'quota') || length === 0) throw error;
        keep = Math.floor(length / 2);
      }
    }
  }

  list(): CompletedAttempt[] {
    return this.state().completed;
  }
  completionCount(quizId: string): number {
    return this.state().completionCounts[quizId] ?? 0;
  }
  lowestScore(quizId: string): number | undefined {
    return this.state().lowestScores[quizId];
  }
  latestScore(quizId: string): RecentScore | undefined {
    return this.state().latestScores[quizId];
  }

  latestActivityAt(quizId: string): string | undefined {
    return this.state().activity[quizId];
  }

  getActive(quizId: string): Attempt | undefined {
    return this.state().active[quizId];
  }

  saveActive(attempt: Attempt): void {
    this.commit((state) => {
      if (state.completedIds[attempt.id]) throw new PersistenceError('conflict', messages.conflict);
      return {
        ...state,
        active: { ...state.active, [attempt.quizId]: attempt },
        activity: { ...state.activity, [attempt.quizId]: new Date().toISOString() },
      };
    });
  }

  clearActive(quizId: string): void {
    this.commit((state) => {
      if (!state.active[quizId]) return undefined;
      const active = { ...state.active };
      delete active[quizId];
      return { ...state, active };
    });
  }

  saveCompleted(attempt: CompletedAttempt): void {
    this.commit((state) => {
      const active = { ...state.active };
      const removedActive = active[attempt.quizId]?.id === attempt.id;
      if (removedActive) delete active[attempt.quizId];
      if (state.completedIds[attempt.id]) return removedActive ? { ...state, active } : undefined;
      const historical = { ...attempt };
      delete historical.contentSignature;
      const previousLatest = state.latestScores[attempt.quizId];
      const latest =
        !previousLatest || attempt.completedAt >= previousLatest.completedAt
          ? { percentage: attempt.score.percentage, completedAt: attempt.completedAt }
          : previousLatest;
      const next: ProgressState = {
        ...state,
        active,
        completed: [historical, ...state.completed].slice(0, MAX_COMPLETED_ATTEMPTS),
        completedIds: { ...state.completedIds, [attempt.id]: true },
        completionCounts: {
          ...state.completionCounts,
          [attempt.quizId]: (state.completionCounts[attempt.quizId] ?? 0) + 1,
        },
        lowestScores: {
          ...state.lowestScores,
          [attempt.quizId]: Math.min(state.lowestScores[attempt.quizId] ?? 100, attempt.score.percentage),
        },
        latestScores: { ...state.latestScores, [attempt.quizId]: latest },
        activity: { ...state.activity, [attempt.quizId]: attempt.completedAt },
      };
      let size = JSON.stringify(next).length;
      while (size > historyBudgetChars && next.completed.length > 1)
        size -= JSON.stringify(next.completed.pop()).length + 1;
      return next;
    });
  }
}

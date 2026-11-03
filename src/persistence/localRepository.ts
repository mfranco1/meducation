import type { Attempt, AttemptRepository, CompletedAttempt, RecentScore } from '../domain/types';
import { LocalJsonStore, PersistenceError } from './localJsonStore';
import { decodeProgress, emptyProgress, progressKey, type ProgressState, type StoragePort } from './progressCodec';

const completedAttemptLimit = 200;
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

function readProgress(storage: StoragePort) {
  const raw = storage.getItem(progressKey);
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
  private commit = (change: (state: ProgressState) => ProgressState | undefined) => this.store.commit(change);

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
      return {
        ...state,
        active,
        completed: [historical, ...state.completed].slice(0, completedAttemptLimit),
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
    });
  }
}

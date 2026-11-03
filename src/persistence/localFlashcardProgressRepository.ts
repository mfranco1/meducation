import type { FlashcardCheckpoint, FlashcardProgressState } from '../domain/flashcardStudy';
import { localDayKey, recordFlashcardDailyCompletion } from '../domain/flashcardDailyStats';
import { decodeFlashcardProgress, flashcardProgressKey, loadFlashcardProgress } from './flashcardProgressCodec';
import { LocalJsonStore, PersistenceError } from './localJsonStore';
import type { StoragePort } from './progressCodec';

const messages = {
  unavailable: 'Flashcard progress could not be saved. Check browser storage and try again.',
  conflict: 'Flashcard progress changed in another tab. Reload this page before continuing.',
  corrupt: 'Saved flashcard progress could not be read safely. The original browser data has been kept.',
};

function freezeProgress(state: FlashcardProgressState): FlashcardProgressState {
  Object.values(state.checkpoints).forEach((checkpoint) => {
    Object.freeze(checkpoint.openedCardIds);
    Object.freeze(checkpoint.flaggedCardIds);
    Object.freeze(checkpoint);
  });
  Object.freeze(state.completionCounts);
  if (state.finishedAt) Object.freeze(state.finishedAt);
  Object.freeze(state.checkpoints);
  return Object.freeze(state);
}

const emptyProgress = (revision = 'initial'): FlashcardProgressState => ({
  schemaVersion: 2,
  revision,
  checkpoints: {},
  completionCounts: {},
});

function readProgress(storage: StoragePort) {
  const state = loadFlashcardProgress(storage);
  return state
    ? { state, revision: state.revision }
    : { state: emptyProgress('corrupt'), revision: 'corrupt', corrupt: true };
}

export class LocalFlashcardProgressRepository {
  private readonly store: LocalJsonStore<FlashcardProgressState>;

  constructor(storage?: StoragePort) {
    this.store = new LocalJsonStore(
      { key: flashcardProgressKey, messages, empty: emptyProgress, read: readProgress, freeze: freezeProgress },
      storage,
    );
  }

  getSnapshot = () => this.store.state();
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  getStorageError = () => this.store.getStorageError();
  getCheckpoint(deckId: string) {
    return this.store.state().checkpoints[deckId];
  }

  private commit(change: (state: FlashcardProgressState) => FlashcardProgressState | undefined) {
    this.store.commit((state) => {
      const next = change(state);
      if (next && !decodeFlashcardProgress(next))
        throw new PersistenceError('corrupt', 'Invalid flashcard progress was not saved.');
      return next;
    });
  }

  saveCheckpoint(checkpoint: FlashcardCheckpoint) {
    this.commit((state) => ({
      ...state,
      checkpoints: {
        ...state.checkpoints,
        [checkpoint.deckId]: {
          ...checkpoint,
          openedCardIds: [...checkpoint.openedCardIds],
          flaggedCardIds: [...checkpoint.flaggedCardIds],
        },
      },
    }));
  }

  clearCheckpoint(deckId: string) {
    this.commit((state) => {
      if (!state.checkpoints[deckId]) return undefined;
      const checkpoints = { ...state.checkpoints };
      delete checkpoints[deckId];
      return { ...state, checkpoints };
    });
  }

  completeDeck(deckId: string, completedAt = new Date()) {
    this.commit((state) => {
      if (!state.checkpoints[deckId]) return undefined;
      const count = state.completionCounts[deckId] ?? 0;
      if (!Number.isSafeInteger(count) || count >= Number.MAX_SAFE_INTEGER)
        throw new PersistenceError('corrupt', 'Deck completion count is invalid and was not saved.');
      const checkpoints = { ...state.checkpoints };
      delete checkpoints[deckId];
      let dailyStats;
      try {
        dailyStats = recordFlashcardDailyCompletion(state.dailyStats, localDayKey(completedAt));
      } catch {
        throw new PersistenceError('corrupt', 'Deck completion statistics could not be updated safely.');
      }
      return {
        ...state,
        checkpoints,
        completionCounts: { ...state.completionCounts, [deckId]: count + 1 },
        finishedAt: { ...state.finishedAt, [deckId]: completedAt.toISOString() },
        dailyStats,
      };
    });
  }
}

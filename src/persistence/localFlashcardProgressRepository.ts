import type { FlashcardCheckpoint, FlashcardProgressState } from '../domain/flashcardStudy';
import { localDayKey, recordFlashcardDailyCompletion } from '../domain/flashcardDailyStats';
import { decodeFlashcardProgress, flashcardProgressKey, loadFlashcardProgress } from './flashcardProgressCodec';
import type { StoragePort } from './progressCodec';

const unavailableMessage = 'Flashcard progress could not be saved. Check browser storage and try again.';
const conflictMessage = 'Flashcard progress changed in another tab. Reload this page before continuing.';
const corruptMessage = 'Saved flashcard progress could not be read safely. The original browser data has been kept.';

function freezeProgress(state: FlashcardProgressState): FlashcardProgressState {
  Object.values(state.checkpoints).forEach((checkpoint) => {
    Object.freeze(checkpoint.openedCardIds);
    Object.freeze(checkpoint.flaggedCardIds);
    Object.freeze(checkpoint);
  });
  Object.freeze(state.completionCounts);
  Object.freeze(state.checkpoints);
  return Object.freeze(state);
}

export class FlashcardPersistenceError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'conflict' | 'corrupt',
    message: string,
  ) {
    super(message);
    this.name = 'FlashcardPersistenceError';
  }
}

export class LocalFlashcardProgressRepository {
  private observedStorage?: StoragePort;
  private observedRevision: string | null | undefined;
  private cached?: FlashcardProgressState;
  private storageError?: string;
  private readonly listeners = new Set<() => void>();
  private listening = false;

  constructor(private readonly suppliedStorage?: StoragePort) {}
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

  private state(): FlashcardProgressState {
    try {
      const storage = this.storage();
      if (this.cached && this.storageError !== unavailableMessage) return this.cached;
      const state = loadFlashcardProgress(storage);
      if (state) {
        this.observedRevision ??= state.revision;
        this.storageError = undefined;
        return (this.cached = freezeProgress(state));
      }
      if (storage.getItem(flashcardProgressKey) !== null) {
          this.storageError = corruptMessage;
          if (this.observedRevision === undefined) this.observedRevision = 'corrupt';
          return (this.cached = freezeProgress({ schemaVersion: 2, revision: 'corrupt', checkpoints: {}, completionCounts: {} }));
      }
      this.observedRevision ??= 'initial';
      this.storageError = undefined;
      return (this.cached = freezeProgress({ schemaVersion: 2, revision: 'initial', checkpoints: {}, completionCounts: {} }));
    } catch {
      this.storageError = unavailableMessage;
      return (this.cached ??= freezeProgress({ schemaVersion: 2, revision: 'unavailable', checkpoints: {}, completionCounts: {} }));
    }
  }

  getSnapshot = () => this.state();
  getStorageError = () => this.storageError;
  getCheckpoint(deckId: string) {
    return this.state().checkpoints[deckId];
  }

  private readonly onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== flashcardProgressKey) return;
    this.cached = undefined;
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener: () => void) => {
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

  private commit(change: (state: FlashcardProgressState) => FlashcardProgressState | undefined) {
    const state = this.state();
    if (this.storageError)
      throw new FlashcardPersistenceError(
        this.storageError === corruptMessage ? 'corrupt' : 'unavailable',
        this.storageError,
      );
    try {
      const storage = this.storage();
      const current = loadFlashcardProgress(storage)?.revision ?? 'corrupt';
      if (current !== this.observedRevision) throw new FlashcardPersistenceError('conflict', conflictMessage);
      const next = change(state);
      if (!next) return;
      next.revision = crypto.randomUUID();
      if (!decodeFlashcardProgress(next))
        throw new FlashcardPersistenceError('corrupt', 'Invalid flashcard progress was not saved.');
      const serialized = JSON.stringify(next);
      storage.setItem(flashcardProgressKey, serialized);
      if (storage.getItem(flashcardProgressKey) !== serialized)
        throw new FlashcardPersistenceError('unavailable', unavailableMessage);
      this.observedRevision = next.revision;
      this.cached = freezeProgress(next);
      this.listeners.forEach((listener) => listener());
    } catch (error) {
      if (error instanceof FlashcardPersistenceError) throw error;
      throw new FlashcardPersistenceError('unavailable', unavailableMessage);
    }
  }

  saveCheckpoint(checkpoint: FlashcardCheckpoint) {
    this.commit((state) => ({
      ...state,
      checkpoints: { ...state.checkpoints, [checkpoint.deckId]: { ...checkpoint, openedCardIds: [...checkpoint.openedCardIds], flaggedCardIds: [...checkpoint.flaggedCardIds] } },
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
        throw new FlashcardPersistenceError('corrupt', 'Deck completion count is invalid and was not saved.');
      const checkpoints = { ...state.checkpoints };
      delete checkpoints[deckId];
      let dailyStats;
      try {
        dailyStats = recordFlashcardDailyCompletion(state.dailyStats, localDayKey(completedAt));
      } catch {
        throw new FlashcardPersistenceError('corrupt', 'Deck completion statistics could not be updated safely.');
      }
      return {
        ...state,
        checkpoints,
        completionCounts: { ...state.completionCounts, [deckId]: count + 1 },
        dailyStats,
      };
    });
  }
}

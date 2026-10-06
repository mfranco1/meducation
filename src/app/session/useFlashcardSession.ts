import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FlashcardDeckSummary } from '../../content/flashcardApiDecoders';
import { runtimeFlashcardBank } from '../../content/runtimeFlashcardBank';
import type { FlashcardCard, Subject } from '../../domain/types';
import {
  checkpointForCard,
  flashcardContentSignature,
  nextFlashcardIndex,
  previousFlashcardIndex,
  resolveFlashcardLaunch,
} from '../../domain/flashcardStudy';
import {
  FlashcardPersistenceError,
  LocalFlashcardProgressRepository,
} from '../../persistence/localFlashcardProgressRepository';
import type { FlashcardsView } from '../navigation';

export interface PendingDeckRestart {
  deck: FlashcardDeckSummary;
  subject: Subject;
  cards: FlashcardCard[];
  signature: string;
  reason: 'missing-card' | 'changed-content';
  topicId?: string;
}

export const flashcardProgressRepository = new LocalFlashcardProgressRepository();

type FlashcardLoader = Pick<typeof runtimeFlashcardBank, 'ensureCards' | 'listCards' | 'cancel'>;

export function useFlashcardSession(
  loader: FlashcardLoader = runtimeFlashcardBank,
  repository = flashcardProgressRepository,
) {
  const [view, setView] = useState<FlashcardsView>({ page: 'flashcards' });
  const [pendingRestart, setPendingRestart] = useState<PendingDeckRestart>();
  const [loadingDeckId, setLoadingDeckId] = useState<string>();
  const [launchErrorDeckId, setLaunchErrorDeckId] = useState<string>();
  const [launchError, setLaunchError] = useState<Error>();
  const [persistenceError, setPersistenceError] = useState<string>();
  const launching = useRef<{ deckId: string; token: symbol } | undefined>(undefined);
  const signature = useRef('');
  const progress = useSyncExternalStore(repository.subscribe, repository.getSnapshot);

  const cancelLaunch = useCallback(() => {
    const pending = launching.current;
    launching.current = undefined;
    if (pending) loader.cancel(`cards:${pending.deckId}`);
    setLoadingDeckId(undefined);
    setLaunchErrorDeckId(undefined);
    setLaunchError(undefined);
    setPendingRestart(undefined);
  }, [loader]);

  useEffect(
    () => () => {
      const pending = launching.current;
      launching.current = undefined;
      if (pending) loader.cancel(`cards:${pending.deckId}`);
    },
    [loader],
  );

  const runPersistence = useCallback((action: () => void) => {
    try {
      action();
      setPersistenceError(undefined);
      return true;
    } catch (error) {
      setPersistenceError(
        error instanceof FlashcardPersistenceError
          ? error.message
          : 'Flashcard progress could not be saved. Try again.',
      );
      return false;
    }
  }, []);

  const showDashboard = useCallback(() => {
    cancelLaunch();
    setPendingRestart(undefined);
    setPersistenceError(undefined);
    setView({ page: 'flashcards' });
  }, [cancelLaunch]);

  const showSubject = useCallback(
    (subject: Subject, topicId?: string) => {
      cancelLaunch();
      setPendingRestart(undefined);
      setLaunchErrorDeckId(undefined);
      setView({ page: 'flashcards-subject', subject, ...(topicId ? { topicId } : {}) });
    },
    [cancelLaunch],
  );

  const launchDeck = useCallback(
    async (deck: FlashcardDeckSummary, subject: Subject, topicId?: string) => {
      if (launching.current?.deckId === deck.id) return;
      cancelLaunch();
      const token = Symbol(deck.id);
      launching.current = { deckId: deck.id, token };
      setLoadingDeckId(deck.id);
      setLaunchErrorDeckId(undefined);
      try {
        const cards = await loader.ensureCards(deck.id);
        if (launching.current?.token !== token) return;
        const contentSignature = await flashcardContentSignature(cards);
        if (launching.current?.token !== token) return;
        const choice = resolveFlashcardLaunch(deck.id, cards, contentSignature, repository.getCheckpoint(deck.id));
        if (choice.kind === 'empty') return;
        if (choice.kind === 'restart-required') {
          setPendingRestart({ deck, subject, cards, signature: contentSignature, reason: choice.reason, topicId });
          return;
        }
        const cardId = choice.cardId;
        if (
          !runPersistence(() => repository.saveCheckpoint(checkpointForCard(deck.id, cards, cardId, contentSignature)))
        )
          return;
        signature.current = contentSignature;
        setView({
          page: 'flashcards-study',
          subject,
          ...(topicId ? { topicId } : {}),
          deck,
          index: choice.kind === 'resume' ? choice.index : 0,
          revealed: false,
        });
      } catch (error) {
        if (launching.current?.token === token) {
          setLaunchErrorDeckId(deck.id);
          setLaunchError(error instanceof Error ? error : new Error('Could not open this deck.'));
        }
      } finally {
        if (launching.current?.token === token) {
          launching.current = undefined;
          setLoadingDeckId(undefined);
        }
      }
    },
    [cancelLaunch, loader, repository, runPersistence],
  );

  const confirmRestart = useCallback(() => {
    if (!pendingRestart) return;
    const { deck, subject, cards, signature: contentSignature, topicId } = pendingRestart;
    const cardId = cards[0]?.id;
    if (!cardId) {
      setPendingRestart(undefined);
      return;
    }
    if (!runPersistence(() => repository.saveCheckpoint(checkpointForCard(deck.id, cards, cardId, contentSignature))))
      return;
    signature.current = contentSignature;
    setPendingRestart(undefined);
    setView({ page: 'flashcards-study', subject, ...(topicId ? { topicId } : {}), deck, index: 0, revealed: false });
  }, [pendingRestart, repository, runPersistence]);

  const cancelRestart = useCallback(() => setPendingRestart(undefined), []);

  const moveTo = useCallback(
    (index: number) => {
      if (view.page !== 'flashcards-study') return;
      const cards = loader.listCards(view.deck.id);
      const card = cards[index];
      if (!card) return;
      if (
        !runPersistence(() =>
          repository.saveCheckpoint(checkpointForCard(view.deck.id, cards, card.id, signature.current)),
        )
      )
        return;
      setView({ ...view, index, revealed: false });
    },
    [view, loader, repository, runPersistence],
  );

  const previous = useCallback(() => {
    if (view.page === 'flashcards-study') moveTo(previousFlashcardIndex(view.index, view.deck.cardCount));
  }, [moveTo, view]);
  const next = useCallback(() => {
    if (view.page === 'flashcards-study') moveTo(nextFlashcardIndex(view.index, view.deck.cardCount));
  }, [moveTo, view]);
  const toggleReveal = useCallback(
    () =>
      setView((current) =>
        current.page === 'flashcards-study' ? { ...current, revealed: !current.revealed } : current,
      ),
    [],
  );

  const saveAndExit = useCallback(() => {
    if (view.page !== 'flashcards-study') return true;
    const cards = loader.listCards(view.deck.id);
    const card = cards[view.index];
    if (!card) {
      setPersistenceError('This deck is no longer available. Reload content before continuing.');
      return false;
    }
    if (
      !runPersistence(() =>
        repository.saveCheckpoint(checkpointForCard(view.deck.id, cards, card.id, signature.current)),
      )
    )
      return false;
    showSubject(view.subject, view.topicId);
    return true;
  }, [loader, repository, runPersistence, showSubject, view]);

  const finish = useCallback(() => {
    if (view.page !== 'flashcards-study') return;
    if (!runPersistence(() => repository.clearCheckpoint(view.deck.id))) return;
    showSubject(view.subject, view.topicId);
  }, [repository, runPersistence, showSubject, view]);

  const clearLaunchError = useCallback(() => {
    setLaunchErrorDeckId(undefined);
    setLaunchError(undefined);
  }, []);

  return {
    view,
    progress,
    pendingRestart,
    loadingDeckId,
    launchErrorDeckId,
    launchError,
    persistenceError: persistenceError ?? repository.getStorageError(),
    showDashboard,
    showSubject,
    launchDeck,
    confirmRestart,
    cancelRestart,
    previous,
    next,
    toggleReveal,
    saveAndExit,
    finish,
    clearLaunchError,
    cancelLaunch,
  };
}

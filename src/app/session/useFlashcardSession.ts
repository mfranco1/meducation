import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type { FlashcardDeckSummary } from '../../content/flashcardApiDecoders';
import { runtimeFlashcardBank } from '../../content/runtimeFlashcardBank';
import type { FlashcardCard, Subject } from '../../domain/types';
import { checkpointForCard, nextFlashcardIndex, previousFlashcardIndex, resolveFlashcardLaunch } from '../../domain/flashcardStudy';
import { FlashcardPersistenceError, LocalFlashcardProgressRepository } from '../../persistence/localFlashcardProgressRepository';
import type { FlashcardsView } from '../navigation';

export interface PendingDeckRestart {
  deck: FlashcardDeckSummary;
  subject: Subject;
  cards: FlashcardCard[];
  reason: 'missing-card' | 'changed-content';
  topicId?: string;
}

export const flashcardProgressRepository = new LocalFlashcardProgressRepository();

export function useFlashcardSession() {
  const [view, setView] = useState<FlashcardsView>({ page: 'flashcards' });
  const [pendingRestart, setPendingRestart] = useState<PendingDeckRestart>();
  const [loadingDeckId, setLoadingDeckId] = useState<string>();
  const [launchErrorDeckId, setLaunchErrorDeckId] = useState<string>();
  const [persistenceError, setPersistenceError] = useState<string>();
  const launching = useRef(new Set<string>());
  const progress = useSyncExternalStore(flashcardProgressRepository.subscribe, flashcardProgressRepository.getSnapshot);

  const runPersistence = useCallback((action: () => void) => {
    try { action(); setPersistenceError(undefined); return true; }
    catch (error) {
      setPersistenceError(error instanceof FlashcardPersistenceError ? error.message : 'Flashcard progress could not be saved. Try again.');
      return false;
    }
  }, []);

  const showDashboard = useCallback(() => {
    setPendingRestart(undefined);
    setPersistenceError(undefined);
    setView({ page: 'flashcards' });
  }, []);

  const showSubject = useCallback((subject: Subject, topicId?: string) => {
    setPendingRestart(undefined);
    setLaunchErrorDeckId(undefined);
    setView({ page: 'flashcards-subject', subject, ...(topicId ? { topicId } : {}) });
  }, []);

  const launchDeck = useCallback(async (deck: FlashcardDeckSummary, subject: Subject, topicId?: string) => {
    if (launching.current.has(deck.id)) return;
    launching.current.add(deck.id);
    setLoadingDeckId(deck.id);
    setLaunchErrorDeckId(undefined);
    try {
      const cards = await runtimeFlashcardBank.ensureCards(deck.id);
      const choice = resolveFlashcardLaunch(deck.id, cards, progress.checkpoints[deck.id]);
      if (choice.kind === 'empty') return;
      if (choice.kind === 'restart-required') {
        setPendingRestart({ deck, subject, cards, reason: choice.reason, topicId });
        return;
      }
      const cardId = choice.cardId;
      if (!runPersistence(() => flashcardProgressRepository.saveCheckpoint(checkpointForCard(deck.id, cards, cardId)))) return;
      setView({ page: 'flashcards-study', subject, ...(topicId ? { topicId } : {}), deck, index: choice.kind === 'resume' ? choice.index : 0, revealed: false });
    } catch {
      setLaunchErrorDeckId(deck.id);
    } finally {
      launching.current.delete(deck.id);
      setLoadingDeckId(undefined);
    }
  }, [progress.checkpoints, runPersistence]);

  const confirmRestart = useCallback(() => {
    if (!pendingRestart) return;
    const { deck, subject, cards, topicId } = pendingRestart;
    const cardId = cards[0]?.id;
    if (!cardId) { setPendingRestart(undefined); return; }
    if (!runPersistence(() => flashcardProgressRepository.saveCheckpoint(checkpointForCard(deck.id, cards, cardId)))) return;
    setPendingRestart(undefined);
    setView({ page: 'flashcards-study', subject, ...(topicId ? { topicId } : {}), deck, index: 0, revealed: false });
  }, [pendingRestart, runPersistence]);

  const cancelRestart = useCallback(() => setPendingRestart(undefined), []);

  const moveTo = useCallback((index: number) => {
    if (view.page !== 'flashcards-study') return;
    const cards = runtimeFlashcardBank.listCards(view.deck.id);
    const card = cards[index];
    if (!card) return;
    if (!runPersistence(() => flashcardProgressRepository.saveCheckpoint(checkpointForCard(view.deck.id, cards, card.id)))) return;
    setView({ ...view, index, revealed: false });
  }, [view, runPersistence]);

  const previous = useCallback(() => {
    if (view.page === 'flashcards-study') moveTo(previousFlashcardIndex(view.index, view.deck.cardCount));
  }, [moveTo, view]);
  const next = useCallback(() => {
    if (view.page === 'flashcards-study') moveTo(nextFlashcardIndex(view.index, view.deck.cardCount));
  }, [moveTo, view]);
  const toggleReveal = useCallback(() => setView(current => current.page === 'flashcards-study' ? { ...current, revealed: !current.revealed } : current), []);

  const saveAndExit = useCallback(() => {
    if (view.page !== 'flashcards-study') return true;
    const card = runtimeFlashcardBank.listCards(view.deck.id)[view.index];
    if (card && !runPersistence(() => flashcardProgressRepository.saveCheckpoint(checkpointForCard(view.deck.id, runtimeFlashcardBank.listCards(view.deck.id), card.id)))) return false;
    showSubject(view.subject, view.topicId);
    return true;
  }, [runPersistence, showSubject, view]);

  const finish = useCallback(() => {
    if (view.page !== 'flashcards-study') return;
    if (!runPersistence(() => flashcardProgressRepository.clearCheckpoint(view.deck.id))) return;
    showSubject(view.subject, view.topicId);
  }, [runPersistence, showSubject, view]);

  const clearLaunchError = useCallback(() => setLaunchErrorDeckId(undefined), []);

  return {
    view,
    progress,
    pendingRestart,
    loadingDeckId,
    launchErrorDeckId,
    persistenceError,
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
  };
}

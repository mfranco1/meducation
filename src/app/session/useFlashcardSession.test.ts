import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FlashcardDeckSummary } from '../../content/flashcardApiDecoders';
import { checkpointForCard, flashcardContentSignature } from '../../domain/flashcardStudy';
import { LocalFlashcardProgressRepository } from '../../persistence/localFlashcardProgressRepository';
import { useFlashcardSession } from './useFlashcardSession';

const subject = { id: 's1', name: 'Subject', accent: '#123456' };
const cards = [
  { id: 'f1', deckId: 'd1', front: 'Front', back: 'Back' },
  { id: 'f2', deckId: 'd1', front: 'Second', back: 'Answer' },
];
const deck: FlashcardDeckSummary = { id: 'd1', subjectId: 's1', name: 'Deck', cardCount: 2, cardIds: ['f1', 'f2'] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function setup() {
  const values = new Map<string, string>();
  let failWrites = false;
  const repository = new LocalFlashcardProgressRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('Quota');
      values.set(key, value);
    },
  });
  const loader = { ensureCards: vi.fn(async () => cards), listCards: vi.fn(() => cards), cancel: vi.fn() };
  const hook = renderHook(() => useFlashcardSession(loader, repository));
  act(() => hook.result.current.showSubject(subject));
  return {
    ...hook,
    loader,
    repository,
    setFailWrites: (value: boolean) => {
      failWrites = value;
    },
  };
}

describe('flashcard session controller', () => {
  it('cancels a pending launch on navigation without writing progress or reopening study', async () => {
    const { result, loader, repository } = setup();
    const pending = deferred<typeof cards>();
    loader.ensureCards.mockReturnValueOnce(pending.promise);
    let launch!: Promise<void>;
    act(() => {
      launch = result.current.launchDeck(deck, subject);
    });
    act(() => result.current.showDashboard());
    await act(async () => {
      pending.resolve(cards);
      await launch;
    });
    expect(loader.cancel).toHaveBeenCalledWith('cards:d1');
    expect(result.current.view.page).toBe('flashcards');
    expect(repository.getCheckpoint('d1')).toBeUndefined();
    expect(result.current.loadingDeckId).toBeUndefined();
  });

  it('reports a current deck failure once and leaves progress unchanged for an action retry', async () => {
    const onFailure = vi.fn();
    const values = new Map<string, string>();
    const repository = new LocalFlashcardProgressRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });
    const loader = {
      ensureCards: vi.fn().mockRejectedValue(new Error('fetch failed')),
      listCards: vi.fn(() => cards),
      cancel: vi.fn(),
    };
    const { result } = renderHook(() => useFlashcardSession(loader, repository, onFailure));
    act(() => result.current.showSubject(subject));
    await act(async () => {
      await result.current.launchDeck(deck, subject);
    });
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith({
      deck,
      subject,
      error: expect.objectContaining({ message: 'fetch failed' }),
    });
    expect(result.current.view.page).toBe('flashcards-subject');
    expect(result.current.loadingDeckId).toBeUndefined();
    expect(repository.getCheckpoint('d1')).toBeUndefined();
    loader.ensureCards.mockResolvedValueOnce(cards);
    await act(async () => {
      await result.current.launchDeck(deck, subject);
    });
    expect(result.current.view.page).toBe('flashcards-study');
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('does not report a failure from an abandoned launch', async () => {
    const onFailure = vi.fn();
    const pending = deferred<typeof cards>();
    const loader = { ensureCards: vi.fn(() => pending.promise), listCards: vi.fn(() => cards), cancel: vi.fn() };
    const repository = new LocalFlashcardProgressRepository({ getItem: () => null, setItem: vi.fn() });
    const { result } = renderHook(() => useFlashcardSession(loader, repository, onFailure));
    act(() => result.current.showSubject(subject));
    let launch!: Promise<void>;
    act(() => {
      launch = result.current.launchDeck(deck, subject);
    });
    act(() => result.current.showDashboard());
    await act(async () => {
      pending.reject(new Error('stale failure'));
      await launch.catch(() => undefined);
    });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('deduplicates the current launch and makes the latest deck selection win', async () => {
    const { result, loader, repository } = setup();
    const first = deferred<typeof cards>();
    const secondCards = [{ ...cards[0], id: 'f3', deckId: 'd2' }];
    loader.ensureCards.mockReturnValueOnce(first.promise).mockResolvedValueOnce(secondCards);
    let abandoned!: Promise<void>;
    act(() => {
      abandoned = result.current.launchDeck(deck, subject);
    });
    await act(async () => {
      await result.current.launchDeck(deck, subject);
    });
    expect(loader.ensureCards).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.launchDeck({ ...deck, id: 'd2', cardCount: 1, cardIds: ['f3'] }, subject);
    });
    await act(async () => {
      first.resolve(cards);
      await abandoned;
    });
    expect(result.current.view).toMatchObject({ page: 'flashcards-study', deck: { id: 'd2' } });
    expect(repository.getCheckpoint('d1')).toBeUndefined();
    expect(repository.getCheckpoint('d2')?.currentCardId).toBe('f3');
  });

  it('cancels work on unmount and preserves the current checkpoint', async () => {
    const { result, loader, repository, unmount } = setup();
    const pending = deferred<typeof cards>();
    loader.ensureCards.mockReturnValueOnce(pending.promise);
    let launch!: Promise<void>;
    act(() => {
      launch = result.current.launchDeck(deck, subject);
    });
    unmount();
    pending.resolve(cards);
    await launch;
    expect(loader.cancel).toHaveBeenCalledWith('cards:d1');
    expect(repository.getCheckpoint('d1')).toBeUndefined();
  });

  it('blocks launch on failed persistence and permits a successful retry', async () => {
    const { result, repository, setFailWrites } = setup();
    setFailWrites(true);
    await act(async () => {
      await result.current.launchDeck(deck, subject);
    });
    expect(result.current.view.page).toBe('flashcards-subject');
    expect(result.current.persistenceError).toContain('could not be saved');
    expect(repository.getCheckpoint('d1')).toBeUndefined();
    setFailWrites(false);
    await act(async () => {
      await result.current.launchDeck(deck, subject);
    });
    expect(result.current.view.page).toBe('flashcards-study');
    expect(result.current.persistenceError).toBeUndefined();
    expect(repository.getCheckpoint('d1')?.contentSignature).toMatch(/^sha256-/);
  });

  it('blocks next, exit, and finish on failed writes, retaining the study position for retry', async () => {
    const { result, repository, setFailWrites } = setup();
    await act(async () => {
      await result.current.launchDeck(deck, subject);
    });
    act(() => result.current.toggleReveal());
    setFailWrites(true);
    act(() => result.current.next());
    expect(result.current.view).toMatchObject({ index: 0, revealed: true });
    act(() => {
      expect(result.current.saveAndExit()).toBe(false);
    });
    act(() => result.current.finish());
    expect(result.current.view.page).toBe('flashcards-study');
    expect(repository.getCheckpoint('d1')).toBeDefined();
    setFailWrites(false);
    act(() => result.current.next());
    expect(result.current.view).toMatchObject({ index: 1, revealed: false });
    act(() => result.current.finish());
    expect(result.current.view).toMatchObject({ page: 'flashcards-subject', subject });
    expect(repository.getCheckpoint('d1')).toBeUndefined();
  });

  it('preserves a changed-content checkpoint on cancel and on failed restart', async () => {
    const { result, repository, setFailWrites } = setup();
    const old = checkpointForCard('d1', cards, 'f2', 'sha256-old');
    act(() => repository.saveCheckpoint(old));
    await act(async () => {
      await result.current.launchDeck(deck, subject);
    });
    expect(result.current.pendingRestart?.reason).toBe('changed-content');
    act(() => result.current.cancelRestart());
    expect(repository.getCheckpoint('d1')).toEqual(old);
    await act(async () => {
      await result.current.launchDeck(deck, subject);
    });
    setFailWrites(true);
    act(() => result.current.confirmRestart());
    expect(result.current.pendingRestart).toBeDefined();
    expect(result.current.persistenceError).toBeDefined();
    expect(repository.getCheckpoint('d1')).toEqual(old);
    setFailWrites(false);
    act(() => result.current.confirmRestart());
    expect(result.current.view).toMatchObject({ page: 'flashcards-study', index: 0 });
    expect(repository.getCheckpoint('d1')?.currentCardId).toBe('f1');
  });

  it('uses the latest checkpoint when a pending content request finishes', async () => {
    const { result, loader, repository } = setup();
    const pending = deferred<typeof cards>();
    loader.ensureCards.mockReturnValueOnce(pending.promise);
    let launch!: Promise<void>;
    act(() => {
      launch = result.current.launchDeck(deck, subject);
    });
    const signature = await flashcardContentSignature(cards);
    act(() => repository.saveCheckpoint(checkpointForCard('d1', cards, 'f2', signature)));
    await act(async () => {
      pending.resolve(cards);
      await launch;
    });
    expect(result.current.view).toMatchObject({ page: 'flashcards-study', index: 1 });
  });
});

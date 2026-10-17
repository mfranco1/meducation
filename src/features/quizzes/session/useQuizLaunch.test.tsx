import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Question, Quiz } from '../../../domain/types';
import { useQuizLaunch } from './useQuizLaunch';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', topicId: 't1', name: 'Test', questionCount: 1 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
}

describe('quiz launch coordinator', () => {
  it('deduplicates a launch and ignores old content after navigation, while allowing a new launch', async () => {
    const old = deferred<Question[]>();
    const next = deferred<Question[]>();
    const loader = { ensureQuestions: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise), cancelQuestionLoads: vi.fn() };
    const action = vi.fn();
    const { result } = renderHook(() => useQuizLaunch(loader));

    act(() => { result.current.launch(quiz, action); result.current.launch(quiz, action); });
    expect(loader.ensureQuestions).toHaveBeenCalledTimes(1);
    act(() => result.current.cancel());
    expect(loader.cancelQuestionLoads).toHaveBeenCalledOnce();
    act(() => result.current.launch(quiz, action));
    await act(async () => old.resolve([]));
    expect(action).not.toHaveBeenCalled();
    await act(async () => next.resolve([]));
    expect(action).toHaveBeenCalledOnce();
    expect(result.current.loadingQuizIds.size).toBe(0);
  });

  it('reports only the current failure and allows a fresh launch to recover', async () => {
    const loader = { ensureQuestions: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]), cancelQuestionLoads: vi.fn() };
    const action = vi.fn();
    const onFailure = vi.fn();
    const { result } = renderHook(() => useQuizLaunch(loader, onFailure));
    act(() => result.current.launch(quiz, action));
    await waitFor(() => expect(onFailure).toHaveBeenCalledWith({ quiz, error: expect.objectContaining({ message: 'offline' }) }));
    expect(result.current.loadingQuizIds.size).toBe(0);
    act(() => result.current.launch(quiz, action));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('does not report a failure arriving after navigation cancellation', async () => {
    let reject!: (error: Error) => void;
    const loader = { ensureQuestions: vi.fn(() => new Promise<Question[]>((_, fail) => { reject = fail; })), cancelQuestionLoads: vi.fn() };
    const onFailure = vi.fn();
    const { result } = renderHook(() => useQuizLaunch(loader, onFailure));
    act(() => result.current.launch(quiz, vi.fn()));
    act(() => result.current.cancel());
    await act(async () => reject(new Error('stale')));
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe('fresh quiz launch admission', () => {
  it('does not fetch bodies or start when validation fails, and checks admission after body loading', async () => {
    const admit = vi.fn(() => { throw new Error('expired'); });
    const loader = { validateLaunch: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(admit), ensureQuestions: vi.fn().mockResolvedValue([]), cancelQuestionLoads: vi.fn() };
    const action = vi.fn();
    const failure = vi.fn();
    const { result } = renderHook(() => useQuizLaunch(loader, failure));
    act(() => result.current.launch(quiz, action));
    await waitFor(() => expect(failure).toHaveBeenCalledTimes(1));
    expect(loader.ensureQuestions).not.toHaveBeenCalled();
    act(() => result.current.launch(quiz, action));
    await waitFor(() => expect(failure).toHaveBeenCalledTimes(2));
    expect(admit).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
  });

  it('ignores late validation and body replies when a different launch wins', async () => {
    const old = deferred<() => void>();
    const loader = { validateLaunch: vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(() => undefined), ensureQuestions: vi.fn().mockResolvedValue([]), cancelQuestionLoads: vi.fn() };
    const oldAction = vi.fn();
    const nextAction = vi.fn();
    const { result } = renderHook(() => useQuizLaunch(loader));
    act(() => result.current.launch(quiz, oldAction));
    act(() => result.current.launch({ ...quiz, id: 'next' }, nextAction));
    await waitFor(() => expect(nextAction).toHaveBeenCalledOnce());
    await act(async () => old.resolve(() => undefined));
    expect(oldAction).not.toHaveBeenCalled();
    expect(loader.ensureQuestions).toHaveBeenCalledTimes(1);
    expect(loader.ensureQuestions).toHaveBeenCalledWith('next');
  });
});

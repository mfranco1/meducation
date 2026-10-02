import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentLoadError } from '../../content/contentTransport';
import type { Question, Quiz } from '../../domain/types';
import { useQuizLaunch } from './useQuizLaunch';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', name: 'Test', questionCount: 1 };

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

  it('retries an ordinary failure and reloads for a revision conflict', async () => {
    const loader = { ensureQuestions: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]).mockRejectedValueOnce(new ContentLoadError('revision', 'changed')), cancelQuestionLoads: vi.fn() };
    const action = vi.fn();
    const reload = vi.fn();
    const { result } = renderHook(() => useQuizLaunch(loader, reload));
    act(() => result.current.launch(quiz, action));
    await waitFor(() => expect(result.current.contentError).toBeDefined());
    act(() => result.current.retryContent());
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    act(() => result.current.launch(quiz, action));
    await waitFor(() => expect(result.current.contentError).toBeInstanceOf(ContentLoadError));
    act(() => result.current.retryContent());
    expect(reload).toHaveBeenCalledOnce();
  });
});

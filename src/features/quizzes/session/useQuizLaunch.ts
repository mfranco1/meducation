import { useEffect, useRef, useState } from 'react';
import { isGeneratedQuizId } from '../../../domain/generatedTests';
import type { Question, Quiz } from '../../../domain/types';

export interface QuestionLoader {
  validateLaunch?(quiz: Quiz): Promise<() => void>;
  ensureQuestions(quizId: string): Promise<Question[]>;
  ensureTestQuestions(quiz: Quiz, questionIds?: string[]): Promise<string[]>;
  cancelQuestionLoads(): void;
}
export interface QuestionLoadFailure {
  quiz: Quiz;
  error: Error;
}

/** Coordinates a question load with the current navigation destination. */
export function useQuizLaunch(loader: QuestionLoader, onFailure?: (failure: QuestionLoadFailure) => void) {
  const [loadingQuizIds, setLoadingQuizIds] = useState<Set<string>>(() => new Set());
  const inFlight = useRef(new Map<string, symbol>());
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      inFlight.current.clear();
      loader.cancelQuestionLoads();
    },
    [loader],
  );

  /** Generated tests pass the loaded question IDs to `action`: `questionIds` when given, otherwise a new selection. */
  const launch = (quiz: Quiz, action: (questionIds?: string[]) => void, questionIds?: string[]) => {
    if (inFlight.current.has(quiz.id)) return;
    if (inFlight.current.size) cancel();
    const token = Symbol(quiz.id);
    const currentGeneration = generation.current;
    inFlight.current.set(quiz.id, token);
    setLoadingQuizIds((current) => new Set(current).add(quiz.id));
    const current = () => generation.current === currentGeneration && inFlight.current.get(quiz.id) === token;
    const load = async () => {
      const admit = loader.validateLaunch ? await loader.validateLaunch(quiz) : () => undefined;
      if (!current()) return;
      const loadedIds = isGeneratedQuizId(quiz.id)
        ? await loader.ensureTestQuestions(quiz, questionIds)
        : (await loader.ensureQuestions(quiz.id), undefined);
      if (!current()) return;
      admit();
      action(loadedIds);
    };
    void load()
      .catch((error) => {
        if (generation.current !== currentGeneration || inFlight.current.get(quiz.id) !== token) return;
        const failure = error instanceof Error ? error : new Error('Please try again or come back later.');
        onFailure?.({ quiz, error: failure });
      })
      .finally(() => {
        if (inFlight.current.get(quiz.id) !== token) return;
        inFlight.current.delete(quiz.id);
        setLoadingQuizIds((current) => {
          const next = new Set(current);
          next.delete(quiz.id);
          return next;
        });
      });
  };

  const cancel = () => {
    generation.current++;
    loader.cancelQuestionLoads();
    inFlight.current.clear();
    setLoadingQuizIds(new Set());
  };

  return { loadingQuizIds, launch, cancel };
}

import { useRef, useState } from 'react';
import type { Question, Quiz } from '../../domain/types';

export interface QuestionLoader {
  ensureQuestions(quizId: string): Promise<Question[]>;
  cancelQuestionLoads(): void;
}
export interface QuestionLoadFailure { quiz: Quiz; error: Error; }

/** Coordinates a question load with the current navigation destination. */
export function useQuizLaunch(loader: QuestionLoader, onFailure?: (failure: QuestionLoadFailure) => void) {
  const [loadingQuizIds, setLoadingQuizIds] = useState<Set<string>>(() => new Set());
  const inFlight = useRef(new Map<string, symbol>());
  const generation = useRef(0);

  const launch = (quiz: Quiz, action: () => void) => {
    if (inFlight.current.has(quiz.id)) return;
    const token = Symbol(quiz.id);
    const currentGeneration = generation.current;
    inFlight.current.set(quiz.id, token);
    setLoadingQuizIds(current => new Set(current).add(quiz.id));
    void loader.ensureQuestions(quiz.id).then(() => {
      if (generation.current === currentGeneration && inFlight.current.get(quiz.id) === token) action();
    }).catch(error => {
      if (generation.current !== currentGeneration || inFlight.current.get(quiz.id) !== token) return;
      const failure = error instanceof Error ? error : new Error('Please try again or come back later.');
      onFailure?.({ quiz, error: failure });
    }).finally(() => {
      if (inFlight.current.get(quiz.id) !== token) return;
      inFlight.current.delete(quiz.id);
      setLoadingQuizIds(current => { const next = new Set(current); next.delete(quiz.id); return next; });
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

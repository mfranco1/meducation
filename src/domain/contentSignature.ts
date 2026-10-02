import type { Question } from './types';

// Store only on active attempts. Exact equality avoids hash collisions when content changes.
export function contentSignature(questions: Question[]): string {
  return JSON.stringify(questions.map(question => [
    question.id,
    question.stem,
    question.choices.map(choice => [choice.id, choice.text]),
    question.answer ?? null,
    question.verifiedAnswer ?? null,
  ]));
}

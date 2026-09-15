import type { Attempt, AttemptScore, Question, QuestionResponse } from './types';

export const answerFor = (question: Question) => question.verifiedAnswer ?? question.sourceAnswer;
export const isCorrect = (question: Question, selected?: string) => selected !== undefined && selected === answerFor(question);
export const blankResponse = (questionId: string): QuestionResponse => ({ questionId, flagged: false, locked: false, timeMs: 0 });
export function updateResponse(attempt: Attempt, response: QuestionResponse): Attempt { return { ...attempt, responses: { ...attempt.responses, [response.questionId]: response } }; }
export function scoreAttempt(attempt: Attempt, questions: Question[], endMs = Date.now()): AttemptScore {
  let correct = 0, incorrect = 0, unanswered = 0;
  questions.forEach(q => { const response = attempt.responses[q.id]; if (!response?.selectedChoiceId) unanswered++; else if (isCorrect(q, response.selectedChoiceId)) correct++; else incorrect++; });
  const total = questions.length;
  return { correct, incorrect, unanswered, total, percentage: total ? Math.round((correct / total) * 100) : 0, elapsedMs: Math.max(0, endMs - new Date(attempt.startedAt).getTime()) };
}
export function canSubmitQuestion(response: QuestionResponse | undefined) { return Boolean(response?.selectedChoiceId) && !response?.locked; }

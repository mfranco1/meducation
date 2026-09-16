import type { Attempt, AttemptScore, FeedbackMode, Question, QuestionResponse } from './types';

export const answerFor = (question: Question) => question.verifiedAnswer ?? question.sourceAnswer;
export const isCorrect = (question: Question, selected?: string) => selected !== undefined && selected === answerFor(question);
export const blankResponse = (questionId: string): QuestionResponse => ({ questionId, flagged: false, locked: false, timeMs: 0 });
export const selectChoice = (response: QuestionResponse, choiceId: string, feedbackMode: FeedbackMode): QuestionResponse => {
  if (response.locked) return response;
  return { ...response, selectedChoiceId: choiceId, locked: feedbackMode === 'immediate' };
};
export const normalizeResponseForFeedbackMode = (response: QuestionResponse, feedbackMode: FeedbackMode): QuestionResponse => {
  if (feedbackMode !== 'immediate' || !response.selectedChoiceId || response.locked) return response;
  return { ...response, locked: true };
};
export const questionIndexFor = (questions: Question[], questionId?: string) => {
  const index = questionId ? questions.findIndex(question => question.id === questionId) : -1;
  return index >= 0 ? index : 0;
};
export function updateResponse(attempt: Attempt, response: QuestionResponse): Attempt { return { ...attempt, responses: { ...attempt.responses, [response.questionId]: response } }; }
export function elapsedTimeFor(attempt: Attempt, nowMs = Date.now()): number {
  const accumulatedMs = attempt.elapsedMs ?? Math.max(0, nowMs - new Date(attempt.startedAt).getTime());
  if (!attempt.timerStartedAt) return accumulatedMs;
  return accumulatedMs + Math.max(0, nowMs - new Date(attempt.timerStartedAt).getTime());
}
export function pauseAttempt(attempt: Attempt, nowMs = Date.now()): Attempt {
  return { ...attempt, elapsedMs: elapsedTimeFor(attempt, nowMs), timerStartedAt: undefined };
}
export function resumeAttempt(attempt: Attempt, nowMs = Date.now()): Attempt {
  return { ...attempt, elapsedMs: elapsedTimeFor(attempt, nowMs), timerStartedAt: new Date(nowMs).toISOString() };
}
export function scoreAttempt(attempt: Attempt, questions: Question[], endMs = Date.now()): AttemptScore {
  let correct = 0, incorrect = 0, unanswered = 0;
  questions.forEach(q => { const response = attempt.responses[q.id]; if (!response?.selectedChoiceId) unanswered++; else if (isCorrect(q, response.selectedChoiceId)) correct++; else incorrect++; });
  const total = questions.length;
  return { correct, incorrect, unanswered, total, percentage: total ? Math.round((correct / total) * 100) : 0, elapsedMs: elapsedTimeFor(attempt, endMs) };
}

import type { Attempt, AttemptScore, CelebrationProgress, FeedbackMode, Question, QuestionResponse, StreakMilestone } from './types';

export const STREAK_MILESTONES: readonly StreakMilestone[] = [3, 5, 10, 25, 50];

export const answerFor = (question: Question) => question.verifiedAnswer ?? question.sourceAnswer;
export const isCorrect = (question: Question, selected?: string) => selected !== undefined && selected === answerFor(question);
export const blankResponse = (questionId: string): QuestionResponse => ({ questionId, flagged: false, locked: false, timeMs: 0 });
export const selectChoice = (response: QuestionResponse, choiceId: string, feedbackMode: FeedbackMode): QuestionResponse => {
  if (response.locked) return response;
  return { ...response, selectedChoiceId: choiceId, locked: feedbackMode === 'immediate' };
};
export const celebrationProgressFor = (attempt: Attempt): CelebrationProgress => ({
  correctStreak: attempt.celebrationProgress?.correctStreak ?? 0,
  awardedStreakMilestones: attempt.celebrationProgress?.awardedStreakMilestones ?? [],
});
export function commitAnswer(attempt: Attempt, question: Question, choiceId: string): { attempt: Attempt; streakMilestone?: StreakMilestone } {
  const current = attempt.responses[question.id] ?? blankResponse(question.id);
  const selected = selectChoice(current, choiceId, attempt.feedbackMode);
  const selectedAttempt = updateResponse(attempt, selected);
  if (attempt.feedbackMode !== 'immediate' || current.locked) return { attempt: selectedAttempt };

  const progress = celebrationProgressFor(attempt);
  const correct = isCorrect(question, choiceId);
  const correctStreak = correct ? progress.correctStreak + 1 : 0;
  const awardedStreakMilestones = correct ? progress.awardedStreakMilestones : [];
  const milestone = STREAK_MILESTONES.find(value => value === correctStreak && !awardedStreakMilestones.includes(value));
  return {
    attempt: {
      ...selectedAttempt,
      celebrationProgress: {
        correctStreak,
        awardedStreakMilestones: milestone ? [...awardedStreakMilestones, milestone] : awardedStreakMilestones,
      },
    },
    streakMilestone: milestone,
  };
}
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
export const isPerfectScore = (score: AttemptScore) => score.total > 0 && score.correct === score.total;

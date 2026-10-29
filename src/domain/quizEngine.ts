import type { Attempt, AttemptScore, FeedbackMode, Question, QuestionResponse, StreakMilestone } from './types';

const STREAK_MILESTONES: readonly StreakMilestone[] = [3, 5, 10, 25, 50];

export const answerFor = (question: Question) => question.answer;
export const isCorrect = (question: Question, selected?: string) => selected !== undefined && selected === answerFor(question);
export const blankResponse = (questionId: string): QuestionResponse => ({ questionId, flagged: false, locked: false, timeMs: 0 });
export const selectChoice = (response: QuestionResponse, choiceId: string, feedbackMode: FeedbackMode): QuestionResponse => {
  if (response.locked) return response;
  return { ...response, selectedChoiceId: choiceId, locked: feedbackMode === 'immediate' };
};
export function commitAnswer(attempt: Attempt, question: Question, choiceId: string): { attempt: Attempt; streakMilestone?: StreakMilestone } {
  const current = attempt.responses[question.id] ?? blankResponse(question.id);
  const selected = selectChoice(current, choiceId, attempt.feedbackMode);
  const selectedAttempt = updateResponse(attempt, selected);
  if (attempt.feedbackMode !== 'immediate' || current.locked) return { attempt: selectedAttempt };

  const progress = attempt.celebrationProgress;
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
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};
export function attemptQuestions(questions: Question[], attempt: Pick<Attempt, 'shuffleSeed'>): Question[] {
  if (attempt.shuffleSeed === undefined) return questions;
  const random = mulberry32(attempt.shuffleSeed);
  return shuffled(questions, random).map(question => ({ ...question, choices: shuffled(question.choices, random) }));
}
export function isFullyAnsweredFastFeedback(attempt: Attempt, questions: Question[]): boolean {
  return attempt.feedbackMode === 'immediate'
    && questions.length > 0
    && questions.every(question => {
      const response = attempt.responses[question.id];
      return Boolean(response?.selectedChoiceId && response.locked);
    });
}
export const questionIndexFor = (questions: Question[], questionId?: string) => {
  const index = questionId ? questions.findIndex(question => question.id === questionId) : -1;
  return index >= 0 ? index : 0;
};
export function updateResponse(attempt: Attempt, response: QuestionResponse): Attempt { return { ...attempt, responses: { ...attempt.responses, [response.questionId]: response } }; }
export function elapsedTimeFor(attempt: Attempt, nowMs = Date.now()): number {
  const accumulatedMs = attempt.elapsedMs;
  if (!attempt.timerStartedAt) return accumulatedMs;
  return accumulatedMs + Math.max(0, nowMs - new Date(attempt.timerStartedAt).getTime());
}
export function pauseAttempt(attempt: Attempt, nowMs = Date.now()): Attempt {
  return { ...attempt, elapsedMs: elapsedTimeFor(attempt, nowMs), timerStartedAt: undefined };
}
export function resumeAttempt(attempt: Attempt, nowMs = Date.now()): Attempt {
  return { ...attempt, elapsedMs: elapsedTimeFor(attempt, nowMs), timerStartedAt: new Date(nowMs).toISOString() };
}
/** Rounded percent that only reaches 100 when every item is correct. */
export const scorePercentage = (correct: number, total: number) => !total ? 0 : correct === total ? 100 : Math.min(99, Math.round((correct / total) * 100));
export function scoreAttempt(attempt: Attempt, questions: Question[], endMs = Date.now()): AttemptScore {
  let correct = 0, incorrect = 0, unanswered = 0;
  questions.forEach(q => { const response = attempt.responses[q.id]; if (!response?.selectedChoiceId) unanswered++; else if (isCorrect(q, response.selectedChoiceId)) correct++; else incorrect++; });
  const total = questions.length;
  return { correct, incorrect, unanswered, total, percentage: scorePercentage(correct, total), elapsedMs: elapsedTimeFor(attempt, endMs) };
}
export const isPerfectScore = (score: AttemptScore) => score.total > 0 && score.correct === score.total;

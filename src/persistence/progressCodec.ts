import type { Attempt, CompletedAttempt, RecentScore } from '../domain/types';
import { isObject } from '../domain/json';
import { MIXED_TEST_SIZE, isGeneratedQuizId } from '../domain/generatedTests';

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ProgressState {
  schemaVersion: 2;
  revision: string;
  active: Record<string, Attempt>;
  completed: CompletedAttempt[];
  completionCounts: Record<string, number>;
  latestScores: Record<string, RecentScore>;
  activity: Record<string, string>;
  completedIds: Record<string, true>;
}

export const progressKey = 'meducation.progress.v2';
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const validQuestionIds = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= MIXED_TEST_SIZE &&
  value.every(text) &&
  new Set(value).size === value.length;

function validAttempt(value: unknown): value is Attempt {
  if (
    !isObject(value) ||
    !text(value.id) ||
    !text(value.quizId) ||
    !text(value.subjectId) ||
    !text(value.startedAt) ||
    !['exam', 'immediate'].includes(value.feedbackMode as string) ||
    !isObject(value.responses)
  )
    return false;
  if (value.contentSignature !== undefined && !text(value.contentSignature)) return false;
  if (value.contentRevision !== undefined && !text(value.contentRevision)) return false;
  if (!number(value.elapsedMs)) return false;
  if (
    !isObject(value.celebrationProgress) ||
    !validCount(value.celebrationProgress.correctStreak) ||
    !Array.isArray(value.celebrationProgress.awardedStreakMilestones) ||
    !value.celebrationProgress.awardedStreakMilestones.every((milestone) => [3, 5, 10, 25, 50].includes(milestone))
  )
    return false;
  if (value.timerStartedAt !== undefined && !text(value.timerStartedAt)) return false;
  if (value.currentQuestionId !== undefined && !text(value.currentQuestionId)) return false;
  if (value.shuffleSeed !== undefined && !validCount(value.shuffleSeed)) return false;
  if (value.questionIds === undefined ? isGeneratedQuizId(value.quizId) : !validQuestionIds(value.questionIds))
    return false;
  return Object.values(value.responses).every(
    (response) =>
      isObject(response) &&
      text(response.questionId) &&
      (response.selectedChoiceId === undefined || text(response.selectedChoiceId)) &&
      typeof response.flagged === 'boolean' &&
      typeof response.locked === 'boolean' &&
      (value.feedbackMode !== 'immediate' || response.selectedChoiceId === undefined || response.locked === true) &&
      number(response.timeMs),
  );
}

function validScore(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    ['correct', 'incorrect', 'unanswered', 'total', 'percentage', 'elapsedMs'].every((key) => number(value[key])) &&
    (value.percentage as number) <= 100
  );
}

function validCompleted(value: unknown): value is CompletedAttempt {
  return validAttempt(value) && isObject(value) && text(value.completedAt) && validScore(value.score);
}

function mapOf<T>(value: unknown, guard: (entry: unknown) => entry is T): Record<string, T> | undefined {
  if (!isObject(value) || !Object.values(value).every(guard)) return undefined;
  return value as Record<string, T>;
}

const validRecent = (value: unknown): value is RecentScore =>
  isObject(value) && number(value.percentage) && value.percentage <= 100 && text(value.completedAt);
const validCount = (value: unknown): value is number => Number.isInteger(value) && number(value);
const validText = (value: unknown): value is string => text(value);
const validTrue = (value: unknown): value is true => value === true;

export function decodeProgress(value: unknown): ProgressState | undefined {
  if (
    !isObject(value) ||
    value.schemaVersion !== 2 ||
    !text(value.revision) ||
    !Array.isArray(value.completed) ||
    !value.completed.every(validCompleted)
  )
    return undefined;
  const active = mapOf(value.active, (entry): entry is Attempt => validAttempt(entry) && text(entry.contentSignature));
  const counts = mapOf(value.completionCounts, validCount);
  const latest = mapOf(value.latestScores, validRecent);
  const activity = mapOf(value.activity, validText);
  const completedIds = mapOf(value.completedIds, validTrue);
  if (!active || !counts || !latest || !activity || !completedIds) return undefined;
  if (Object.entries(active).some(([quizId, attempt]) => attempt.quizId !== quizId)) return undefined;
  if (value.completed.some((attempt: CompletedAttempt) => completedIds[attempt.id] !== true)) return undefined;
  // Progress saved by earlier builds also kept each quiz's lowest score. Nothing reads it, so it is dropped.
  const state = { ...value };
  delete state.lowestScores;
  return state as unknown as ProgressState;
}

export function emptyProgress(): ProgressState {
  return {
    schemaVersion: 2,
    revision: 'initial',
    active: {},
    completed: [],
    completionCounts: {},
    latestScores: {},
    activity: {},
    completedIds: {},
  };
}

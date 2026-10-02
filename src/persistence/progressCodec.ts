import type { Attempt, CompletedAttempt, RecentScore } from '../domain/types';

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
  lowestScores: Record<string, number>;
  latestScores: Record<string, RecentScore>;
  activity: Record<string, string>;
  completedIds: Record<string, true>;
}

export const progressKey = 'meducation.progress.v2';
export const legacyKeys = {
  completed: 'meducation.completed-attempts.v1',
  counts: 'meducation.completion-counts.v1',
  lowest: 'meducation.lowest-scores.v1',
  latest: 'meducation.latest-scores.v1',
  active: 'meducation.active-attempts.v1',
  activity: 'meducation.quiz-activity.v1',
} as const;

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function validAttempt(value: unknown): value is Attempt {
  if (!record(value) || !text(value.id) || !text(value.quizId) || !text(value.subjectId)
    || !text(value.startedAt) || !['exam', 'immediate'].includes(value.feedbackMode as string)
    || !record(value.responses)) return false;
  if (value.contentSignature !== undefined && !text(value.contentSignature)) return false;
  if (value.contentRevision !== undefined && !text(value.contentRevision)) return false;
  if (value.elapsedMs !== undefined && !number(value.elapsedMs)) return false;
  if (value.timerStartedAt !== undefined && !text(value.timerStartedAt)) return false;
  if (value.currentQuestionId !== undefined && !text(value.currentQuestionId)) return false;
  return Object.values(value.responses).every(response => record(response) && text(response.questionId)
    && (response.selectedChoiceId === undefined || text(response.selectedChoiceId))
    && (response.flagged === undefined || typeof response.flagged === 'boolean')
    && (response.locked === undefined || typeof response.locked === 'boolean')
    && (response.timeMs === undefined || number(response.timeMs)));
}

function validScore(value: unknown): boolean {
  if (!record(value)) return false;
  return ['correct', 'incorrect', 'unanswered', 'total', 'percentage', 'elapsedMs'].every(key => number(value[key]))
    && (value.percentage as number) <= 100;
}

function validCompleted(value: unknown): value is CompletedAttempt {
  return validAttempt(value) && record(value) && text(value.completedAt) && validScore(value.score);
}

function mapOf<T>(value: unknown, guard: (entry: unknown) => entry is T): Record<string, T> | undefined {
  if (!record(value) || !Object.values(value).every(guard)) return undefined;
  return value as Record<string, T>;
}

const validRecent = (value: unknown): value is RecentScore => record(value) && number(value.percentage)
  && value.percentage <= 100 && text(value.completedAt);
const validCount = (value: unknown): value is number => Number.isInteger(value) && number(value);
const validNumber = (value: unknown): value is number => number(value) && value <= 100;
const validText = (value: unknown): value is string => text(value);
const validTrue = (value: unknown): value is true => value === true;

export function decodeProgress(value: unknown): ProgressState | undefined {
  if (!record(value) || value.schemaVersion !== 2 || !text(value.revision)
    || !Array.isArray(value.completed) || !value.completed.every(validCompleted)) return undefined;
  const active = mapOf(value.active, validAttempt);
  const counts = mapOf(value.completionCounts, validCount);
  const lowest = mapOf(value.lowestScores, validNumber);
  const latest = mapOf(value.latestScores, validRecent);
  const activity = mapOf(value.activity, validText);
  const completedIds = mapOf(value.completedIds, validTrue);
  if (!active || !counts || !lowest || !latest || !activity || !completedIds) return undefined;
  if (Object.entries(active).some(([quizId, attempt]) => attempt.quizId !== quizId)) return undefined;
  if (value.completed.some((attempt: CompletedAttempt) => completedIds[attempt.id] !== true)) return undefined;
  return value as unknown as ProgressState;
}

function parse(value: string | null): unknown {
  if (value === null) return undefined;
  try { return JSON.parse(value) as unknown; } catch { return undefined; }
}

function legacyMap<T>(value: unknown, guard: (entry: unknown) => entry is T): Record<string, T> {
  const result: Record<string, T> = {};
  if (record(value)) for (const [key, entry] of Object.entries(value)) if (guard(entry)) result[key] = entry;
  return result;
}

export function decodeLegacy(storage: StoragePort): ProgressState {
  const completedValue = parse(storage.getItem(legacyKeys.completed));
  const completed = Array.isArray(completedValue) ? completedValue.filter(validCompleted) : [];
  const activeValue = legacyMap(parse(storage.getItem(legacyKeys.active)), validAttempt);
  const active = Object.fromEntries(Object.entries(activeValue).filter(([quizId, attempt]) => attempt.quizId === quizId));
  const counts = legacyMap(parse(storage.getItem(legacyKeys.counts)), validCount);
  const lowest = legacyMap(parse(storage.getItem(legacyKeys.lowest)), validNumber);
  const latest = legacyMap(parse(storage.getItem(legacyKeys.latest)), validRecent);
  const activity = legacyMap(parse(storage.getItem(legacyKeys.activity)), validText);
  const historyCounts: Record<string, number> = {};
  for (const attempt of completed) {
    historyCounts[attempt.quizId] = (historyCounts[attempt.quizId] ?? 0) + 1;
    lowest[attempt.quizId] = Math.min(lowest[attempt.quizId] ?? 100, attempt.score.percentage);
    const current = latest[attempt.quizId];
    if (!current || attempt.completedAt > current.completedAt) latest[attempt.quizId] = { percentage: attempt.score.percentage, completedAt: attempt.completedAt };
  }
  for (const [quizId, count] of Object.entries(historyCounts)) counts[quizId] = Math.max(counts[quizId] ?? 0, count);
  return {
    schemaVersion: 2, revision: 'legacy', active, completed,
    completionCounts: counts, lowestScores: lowest, latestScores: latest, activity,
    completedIds: Object.fromEntries(completed.map(attempt => [attempt.id, true])),
  };
}

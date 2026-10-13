import type { Attempt, CompletedAttempt, RecentScore } from '../domain/types';
import type { FlashcardDailyStats } from '../domain/flashcardDailyStats';
import { isFlashcardDailyStats } from '../domain/flashcardDailyStats';
import type { FlashcardCheckpoint } from '../domain/flashcardStudy';
import type { ProgressState } from './progressCodec';
import type { FlashcardProgressState } from '../domain/flashcardStudy';

export const PROGRESS_BACKUP_FORMAT = 'meducation-progress-backup';
export const PROGRESS_BACKUP_VERSION = 1;
export const PROGRESS_BACKUP_MAX_BYTES = 4 * 1024 * 1024;
const MAX_DEPTH = 16;
const MAX_NODES = 250_000;
const MAX_ID_BYTES = 128;
const MAX_REFERENCE_BYTES = 256;
const MAX_QUIZ_SIGNATURE_BYTES = 512 * 1024;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MILESTONES = new Set([3, 5, 10, 25, 50]);

export type BackupErrorCategory = 'too-large' | 'malformed-json' | 'wrong-format' | 'unsupported-version' | 'invalid-progress' | 'unsupported-browser' | 'storage-error' | 'recovery-required';
export type BackupParseResult = { ok: true; value: ProgressBackupV1 } | { ok: false; error: BackupErrorCategory };

export interface QuizBackupV2 {
  schemaVersion: 2;
  active: Record<string, Attempt>;
  completed: CompletedAttempt[];
  completionCounts: Record<string, number>;
  lowestScores: Record<string, number>;
  latestScores: Record<string, RecentScore>;
  activity: Record<string, string>;
  completedIds: Record<string, true>;
}
export interface FlashcardsBackupV2 {
  schemaVersion: 2;
  checkpoints: Record<string, FlashcardCheckpoint>;
  completionCounts: Record<string, number>;
  dailyStats?: FlashcardDailyStats;
}
export interface ProgressBackupV1 {
  format: typeof PROGRESS_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  quiz: QuizBackupV2;
  flashcards: FlashcardsBackupV2;
}
export interface ProgressBackupSummary {
  retainedCompletedAttempts: number;
  savedQuizzes: number;
  savedFlashcardDecks: number;
  quizCompletions: number;
  flashcardCompletions: number;
  totalRecordedCompletions: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const utf8Bytes = (s: string) => new TextEncoder().encode(s).byteLength;
const hasOnlyKeys = (v: Record<string, unknown>, allowed: readonly string[]) => Object.keys(v).every(k => allowed.includes(k));
// eslint-disable-next-line no-control-regex
const safeId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.trim() === v && utf8Bytes(v) <= MAX_ID_BYTES && !/[\x00-\x1f\x7f]/.test(v) && !DANGEROUS_KEYS.has(v);
const safeReference = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && utf8Bytes(v) <= MAX_REFERENCE_BYTES;
const safeNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const safeInt = (v: unknown): v is number => safeNumber(v) && Number.isSafeInteger(v);
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const addSafe = (a: number, b: number) => Number.isSafeInteger(a + b) && a + b >= 0;
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const ownValue = (o: Record<string, unknown>, k: string): unknown => own(o, k) ? o[k] : undefined;
const assignSafe = <T>(target: Record<string, T>, key: string, value: T) => Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
function sortedRecord<T, U = T>(source: Record<string, T>, project: (value: T) => U = value => value as unknown as U): Record<string, U> {
  const output: Record<string, U> = {};
  for (const key of Object.keys(source).sort()) assignSafe(output, key, project(source[key]!));
  return output;
}

/** Bounds the parsed tree before schema projection. Iterative to avoid attacker-controlled recursion. */
function safeTree(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++visited > MAX_NODES || item.depth > MAX_DEPTH) return false;
    if (Array.isArray(item.value)) {
      if (item.value.length > 10_000 || visited + pending.length + item.value.length > MAX_NODES) return false;
      for (let i = item.value.length - 1; i >= 0; i--) pending.push({ value: item.value[i], depth: item.depth + 1 });
    } else if (isRecord(item.value)) {
      let members = 0;
      for (const key in item.value) {
        if (!own(item.value, key)) continue;
        if (DANGEROUS_KEYS.has(key) || ++members > 50_000 || visited + pending.length + members > MAX_NODES) return false;
        pending.push({ value: item.value[key], depth: item.depth + 1 });
      }
    } else if (typeof item.value === 'string' && utf8Bytes(item.value) > PROGRESS_BACKUP_MAX_BYTES) return false;
  }
  return true;
}

function keys(v: unknown, required: readonly string[], optional: readonly string[] = []): v is Record<string, unknown> {
  return isRecord(v) && required.every(k => own(v, k)) && hasOnlyKeys(v, [...required, ...optional]);
}
function validMap<T>(value: unknown, cap: number, validator: (key: string, v: unknown) => v is T): value is Record<string, T> {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= cap && entries.every(([k, v]) => safeId(k) && validator(k, v));
}

function validResponseMap(value: unknown, mode: unknown): value is Attempt['responses'] {
  return validMap(value, 1000, (key, v): v is Attempt['responses'][string] => keys(v, ['questionId', 'flagged', 'locked', 'timeMs'], ['selectedChoiceId'])
    && safeId(v.questionId) && key === v.questionId && typeof v.flagged === 'boolean' && typeof v.locked === 'boolean'
    && safeNumber(v.timeMs) && (v.selectedChoiceId === undefined || safeId(v.selectedChoiceId))
    && (mode !== 'immediate' || v.selectedChoiceId === undefined || v.locked));
}
function validAttempt(value: unknown, active: boolean): value is Attempt | CompletedAttempt {
  const required = ['id', 'quizId', 'subjectId', 'feedbackMode', 'startedAt', 'elapsedMs', 'celebrationProgress', 'responses'];
  const optional = active ? ['currentQuestionId', 'contentSignature', 'contentRevision'] : ['currentQuestionId', 'contentRevision', 'completedAt', 'score'];
  if (!keys(value, required, optional) || !safeId(value.id) || !safeId(value.quizId) || !safeId(value.subjectId)
    || !['immediate', 'exam'].includes(value.feedbackMode as string) || !timestamp(value.startedAt) || !safeNumber(value.elapsedMs)
    || (value.currentQuestionId !== undefined && !safeId(value.currentQuestionId))
    || (value.contentRevision !== undefined && !safeReference(value.contentRevision))) return false;
  if (active) {
    if (typeof value.contentSignature !== 'string' || value.contentSignature.length === 0 || utf8Bytes(value.contentSignature) > MAX_QUIZ_SIGNATURE_BYTES) return false;
  } else if (value.completedAt === undefined || !timestamp(value.completedAt) || value.contentSignature !== undefined || !validScore(value.score, value.elapsedMs)) return false;
  const celebration = value.celebrationProgress;
  return keys(celebration, ['correctStreak', 'awardedStreakMilestones']) && safeInt(celebration.correctStreak)
    && Array.isArray(celebration.awardedStreakMilestones) && celebration.awardedStreakMilestones.length <= 5
    && new Set(celebration.awardedStreakMilestones).size === celebration.awardedStreakMilestones.length
    && celebration.awardedStreakMilestones.every(m => MILESTONES.has(m as number) && (m as number) <= (celebration.correctStreak as number))
    && validResponseMap(value.responses, value.feedbackMode)
    && (active || (Object.keys(value.responses as object).length <= ((value.score as Record<string, number>).total)
      && Object.values(value.responses as Record<string, { selectedChoiceId?: string }>).filter(r => r.selectedChoiceId !== undefined).length
        === (value.score as Record<string, number>).correct + (value.score as Record<string, number>).incorrect));
}
function validScore(v: unknown, elapsed: unknown): boolean {
  return keys(v, ['correct', 'incorrect', 'unanswered', 'total', 'percentage', 'elapsedMs'])
    && safeInt(v.correct) && safeInt(v.incorrect) && safeInt(v.unanswered) && safeInt(v.total)
    && safeInt(v.percentage) && v.percentage <= 100 && safeNumber(v.elapsedMs) && v.elapsedMs === elapsed
    && addSafe(v.correct, v.incorrect) && addSafe(v.correct + v.incorrect, v.unanswered)
    && v.correct + v.incorrect + v.unanswered === v.total
    && v.percentage === (v.total ? Math.round(v.correct / v.total * 100) : 0)
    && Object.values((v as Record<string, unknown>)).length === 6;
}
function validQuiz(value: unknown): value is QuizBackupV2 {
  if (!keys(value, ['schemaVersion', 'active', 'completed', 'completionCounts', 'lowestScores', 'latestScores', 'activity', 'completedIds']) || value.schemaVersion !== 2) return false;
  if (!validMap(value.active, 64, (key, v): v is Attempt => validAttempt(v, true) && v.quizId === key)
    || !Array.isArray(value.completed) || value.completed.length > 200 || !value.completed.every(v => validAttempt(v, false))
    || !validMap(value.completionCounts, 2048, (_k, v): v is number => safeInt(v))
    || !validMap(value.lowestScores, 2048, (_k, v): v is number => safeInt(v) && v <= 100)
    || !validMap(value.latestScores, 2048, (_k, v): v is RecentScore => keys(v, ['percentage', 'completedAt']) && safeInt(v.percentage) && v.percentage <= 100 && timestamp(v.completedAt))
    || !validMap(value.activity, 2048, (_k, v): v is string => timestamp(v))
    || !validMap(value.completedIds, 50_000, (_k, v): v is true => v === true)) return false;
  const completed = value.completed as CompletedAttempt[];
  const completedIds = value.completedIds as Record<string, true>;
  const completionCounts = value.completionCounts as Record<string, number>;
  const active = value.active as Record<string, Attempt>;
  if (new Set(completed.map(a => a.id)).size !== completed.length || completed.some(a => ownValue(completedIds, a.id) !== true)) return false;
  if (new Set(Object.values(active).map(a => a.id)).size !== Object.keys(active).length || Object.values(active).some(a => own(completedIds, a.id))) return false;
  let countTotal = 0;
  for (const count of Object.values(completionCounts)) { if (!addSafe(countTotal, count)) return false; countTotal += count; }
  if (countTotal !== Object.keys(completedIds).length) return false;
  const retainedByQuiz = new Map<string, CompletedAttempt[]>();
  for (const attempt of completed) retainedByQuiz.set(attempt.quizId, [...(retainedByQuiz.get(attempt.quizId) ?? []), attempt]);
  for (const [quizId, count] of Object.entries(completionCounts)) {
    const retained = retainedByQuiz.get(quizId) ?? [];
    const lowest = ownValue(value.lowestScores as Record<string, unknown>, quizId) as number | undefined;
    const latest = ownValue(value.latestScores as Record<string, unknown>, quizId) as RecentScore | undefined;
    if (count < retained.length || (count > 0 && (lowest === undefined || latest === undefined))) return false;
    if (lowest !== undefined && latest !== undefined && retained.some(a => lowest > a.score.percentage || Date.parse(latest.completedAt) < Date.parse(a.completedAt))) return false;
  }
  return Object.keys(value.lowestScores as object).every(k => Number(ownValue(completionCounts, k) ?? 0) > 0)
    && Object.keys(value.latestScores as object).every(k => Number(ownValue(completionCounts, k) ?? 0) > 0);
}
function validFlashcards(value: unknown): value is FlashcardsBackupV2 {
  if (!keys(value, ['schemaVersion', 'checkpoints', 'completionCounts'], ['dailyStats']) || value.schemaVersion !== 2) return false;
  if (!validMap(value.checkpoints, 128, (key, v): v is FlashcardCheckpoint => keys(v, ['deckId', 'currentCardId', 'contentSignature', 'updatedAt', 'openedCardIds', 'flaggedCardIds'])
    && safeId(v.deckId) && v.deckId === key && safeId(v.currentCardId) && safeReference(v.contentSignature) && utf8Bytes(v.contentSignature) <= MAX_REFERENCE_BYTES
    && timestamp(v.updatedAt) && validIdList(v.openedCardIds) && validIdList(v.flaggedCardIds))
    || !validMap(value.completionCounts, 2048, (_k, v): v is number => safeInt(v))) return false;
  let total = 0;
  for (const count of Object.values(value.completionCounts as Record<string, number>)) { if (!addSafe(total, count)) return false; total += count; }
  if (value.dailyStats !== undefined && (!isFlashcardDailyStats(value.dailyStats) || total < value.dailyStats.trackedCompletions)) return false;
  return true;
}
function validIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 10_000 && value.every(safeId) && new Set(value).size === value.length;
}

function validLiveQuiz(state: unknown): state is ProgressState {
  if (!keys(state, ['schemaVersion', 'revision', 'active', 'completed', 'completionCounts', 'lowestScores', 'latestScores', 'activity', 'completedIds'])
    || state.schemaVersion !== 2 || !safeReference(state.revision)) return false;
  if (!validMap(state.active, 64, (key, value): value is Attempt => {
    if (!keys(value, ['id', 'quizId', 'subjectId', 'feedbackMode', 'startedAt', 'elapsedMs', 'celebrationProgress', 'responses'], ['timerStartedAt', 'currentQuestionId', 'contentSignature', 'contentRevision'])) return false;
    return (value.timerStartedAt === undefined || timestamp(value.timerStartedAt)) && validAttempt(stripAttemptRuntimeFields(value, true), true) && value.quizId === key;
  })) return false;
  if (!Array.isArray(state.completed) || state.completed.length > 200 || !state.completed.every(value => {
    if (!keys(value, ['id', 'quizId', 'subjectId', 'feedbackMode', 'startedAt', 'elapsedMs', 'celebrationProgress', 'responses', 'completedAt', 'score'], ['timerStartedAt', 'currentQuestionId', 'contentSignature', 'contentRevision'])) return false;
    if (value.timerStartedAt !== undefined && !timestamp(value.timerStartedAt)) return false;
    if (value.contentSignature !== undefined && (typeof value.contentSignature !== 'string' || value.contentSignature.length === 0 || utf8Bytes(value.contentSignature) > MAX_QUIZ_SIGNATURE_BYTES)) return false;
    return validAttempt(stripAttemptRuntimeFields(value, false), false);
  })) return false;
  try { return validQuiz(projectQuiz(state as unknown as ProgressState)); } catch { return false; }
}
function stripAttemptRuntimeFields(value: unknown, active: boolean): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const result = { ...value };
  delete result.timerStartedAt;
  if (active) {
    delete result.completedAt;
    delete result.score;
  } else delete result.contentSignature;
  return result;
}
function validLiveFlashcards(state: unknown): state is FlashcardProgressState {
  return keys(state, ['schemaVersion', 'revision', 'checkpoints'], ['completionCounts', 'dailyStats'])
    && state.schemaVersion === 2 && safeReference(state.revision)
    && (state.completionCounts === undefined || isRecord(state.completionCounts))
    && validFlashcards({ schemaVersion: 2, checkpoints: state.checkpoints, completionCounts: state.completionCounts === undefined ? {} : state.completionCounts, ...(state.dailyStats === undefined ? {} : { dailyStats: state.dailyStats }) });
}

function projectAttempt(attempt: Attempt | CompletedAttempt, active: boolean): Attempt | CompletedAttempt {
  const result: Record<string, unknown> = {
    id: attempt.id, quizId: attempt.quizId, subjectId: attempt.subjectId, feedbackMode: attempt.feedbackMode,
    startedAt: attempt.startedAt, elapsedMs: attempt.elapsedMs, celebrationProgress: {
      correctStreak: attempt.celebrationProgress.correctStreak,
      awardedStreakMilestones: [...attempt.celebrationProgress.awardedStreakMilestones],
    }, responses: sortedRecord(attempt.responses, r => ({ questionId: r.questionId, ...(r.selectedChoiceId === undefined ? {} : { selectedChoiceId: r.selectedChoiceId }), flagged: r.flagged, locked: r.locked, timeMs: r.timeMs })),
  };
  if (attempt.currentQuestionId !== undefined) result.currentQuestionId = attempt.currentQuestionId;
  if (active) {
    result.contentSignature = attempt.contentSignature;
    if (attempt.contentRevision !== undefined) result.contentRevision = attempt.contentRevision;
  } else {
    if (attempt.contentRevision !== undefined) result.contentRevision = attempt.contentRevision;
    result.completedAt = (attempt as CompletedAttempt).completedAt;
    result.score = { ...(attempt as CompletedAttempt).score };
  }
  return result as unknown as Attempt | CompletedAttempt;
}
function projectQuiz(state: ProgressState): QuizBackupV2 {
  const active: Record<string, Attempt> = {};
  for (const key of Object.keys(state.active).sort()) {
    const attempt = state.active[key]!;
    if (attempt.timerStartedAt !== undefined && !timestamp(attempt.timerStartedAt)) throw new Error('invalid-progress');
    assignSafe(active, key, projectAttempt(attempt, true) as Attempt);
  }
  const completedIds: Record<string, true> = {};
  for (const key of Object.keys(state.completedIds).sort()) assignSafe(completedIds, key, state.completedIds[key]!);
  return {
    schemaVersion: 2, active, completed: state.completed.map(a => projectAttempt(a, false) as CompletedAttempt),
    completionCounts: sortedRecord(state.completionCounts), lowestScores: sortedRecord(state.lowestScores),
    latestScores: sortedRecord(state.latestScores, value => ({ percentage: value.percentage, completedAt: value.completedAt })),
    activity: sortedRecord(state.activity), completedIds,
  };
}

/** Copy a validated parsed payload into fresh, fixed-shape records with stable map ordering. */
function projectImportedBackup(value: ProgressBackupV1): ProgressBackupV1 {
  const quiz: QuizBackupV2 = {
    schemaVersion: 2,
    active: sortedRecord(value.quiz.active, attempt => projectAttempt(attempt, true) as Attempt),
    completed: value.quiz.completed.map(attempt => projectAttempt(attempt, false) as CompletedAttempt),
    completionCounts: sortedRecord(value.quiz.completionCounts),
    lowestScores: sortedRecord(value.quiz.lowestScores),
    latestScores: sortedRecord(value.quiz.latestScores, score => ({ percentage: score.percentage, completedAt: score.completedAt })),
    activity: sortedRecord(value.quiz.activity),
    completedIds: sortedRecord(value.quiz.completedIds),
  };
  const flashcards: FlashcardsBackupV2 = {
    schemaVersion: 2,
    checkpoints: sortedRecord(value.flashcards.checkpoints, checkpoint => ({
      deckId: checkpoint.deckId, currentCardId: checkpoint.currentCardId, contentSignature: checkpoint.contentSignature,
      updatedAt: checkpoint.updatedAt, openedCardIds: [...checkpoint.openedCardIds], flaggedCardIds: [...checkpoint.flaggedCardIds],
    })),
    completionCounts: sortedRecord(value.flashcards.completionCounts),
    ...(value.flashcards.dailyStats === undefined ? {} : { dailyStats: {
      firstDay: value.flashcards.dailyStats.firstDay, currentDay: value.flashcards.dailyStats.currentDay,
      currentDayCount: value.flashcards.dailyStats.currentDayCount, trackedCompletions: value.flashcards.dailyStats.trackedCompletions,
      highestDailyCount: value.flashcards.dailyStats.highestDailyCount,
    } }),
  };
  return { format: PROGRESS_BACKUP_FORMAT, version: 1, exportedAt: value.exportedAt, quiz, flashcards };
}

export function validateProgressBackup(value: unknown): BackupParseResult {
  if (!isRecord(value)) return { ok: false, error: 'wrong-format' };
  if (value.format !== PROGRESS_BACKUP_FORMAT) return { ok: false, error: 'wrong-format' };
  if (value.version !== 1) return { ok: false, error: 'unsupported-version' };
  if (!safeTree(value)) return { ok: false, error: 'invalid-progress' };
  if (!keys(value, ['format', 'version', 'exportedAt', 'quiz', 'flashcards']) || !timestamp(value.exportedAt) || !validQuiz(value.quiz) || !validFlashcards(value.flashcards)) return { ok: false, error: 'invalid-progress' };
  return { ok: true, value: projectImportedBackup(value as unknown as ProgressBackupV1) };
}

export function parseProgressBackup(text: string): BackupParseResult {
  if (utf8Bytes(text) > PROGRESS_BACKUP_MAX_BYTES) return { ok: false, error: 'too-large' };
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { return { ok: false, error: 'malformed-json' }; }
  return validateProgressBackup(value);
}

export function summarizeProgressBackup(value: ProgressBackupV1): ProgressBackupSummary | undefined {
  if (!validateProgressBackup(value).ok) return undefined;
  const quizIds = new Set<string>([
    ...Object.keys(value.quiz.active), ...value.quiz.completed.map(attempt => attempt.quizId),
    ...Object.keys(value.quiz.completionCounts), ...Object.keys(value.quiz.lowestScores),
    ...Object.keys(value.quiz.latestScores), ...Object.keys(value.quiz.activity),
  ]);
  const deckIds = new Set([...Object.keys(value.flashcards.checkpoints), ...Object.keys(value.flashcards.completionCounts)]);
  const quizCompletions = Object.values(value.quiz.completionCounts).reduce((sum, count) => sum + count, 0);
  const flashcardCompletions = Object.values(value.flashcards.completionCounts).reduce((sum, count) => sum + count, 0);
  return {
    retainedCompletedAttempts: value.quiz.completed.length,
    savedQuizzes: quizIds.size,
    savedFlashcardDecks: deckIds.size,
    quizCompletions,
    flashcardCompletions,
    totalRecordedCompletions: (BigInt(quizCompletions) + BigInt(flashcardCompletions)).toString(),
  };
}

/** Build the exact portable allowlist, pause running timers, and revalidate the result. */
export function encodeProgressBackup(quiz: ProgressState, flashcards: FlashcardProgressState, exportedAt = new Date().toISOString()): string | undefined {
  if (!safeTree({ quiz, flashcards }) || !validLiveQuiz(quiz) || !validLiveFlashcards(flashcards) || !timestamp(exportedAt)) return undefined;
  let quizPayload: QuizBackupV2;
  try { quizPayload = projectQuiz(quiz); } catch { return undefined; }
  const flashcardPayload: FlashcardsBackupV2 = {
    schemaVersion: 2, checkpoints: sortedRecord(flashcards.checkpoints, checkpoint => ({
      deckId: checkpoint.deckId, currentCardId: checkpoint.currentCardId, contentSignature: checkpoint.contentSignature,
      updatedAt: checkpoint.updatedAt, openedCardIds: [...checkpoint.openedCardIds], flaggedCardIds: [...checkpoint.flaggedCardIds],
    })), completionCounts: sortedRecord(flashcards.completionCounts ?? {}),
    ...(flashcards.dailyStats === undefined ? {} : { dailyStats: { ...flashcards.dailyStats } }),
  };
  const value: ProgressBackupV1 = { format: PROGRESS_BACKUP_FORMAT, version: 1, exportedAt, quiz: quizPayload, flashcards: flashcardPayload };
  const json = JSON.stringify(value);
  return utf8Bytes(json) <= PROGRESS_BACKUP_MAX_BYTES && validateProgressBackup(value).ok ? json : undefined;
}

import type { Attempt, AttemptRepository, CompletedAttempt, RecentScore } from '../domain/types';

const completedKey = 'meducation.completed-attempts.v1';
const completionCountsKey = 'meducation.completion-counts.v1';
const lowestScoresKey = 'meducation.lowest-scores.v1';
const latestScoresKey = 'meducation.latest-scores.v1';
const activeKey = 'meducation.active-attempts.v1';
const activityKey = 'meducation.quiz-activity.v1';
const completedAttemptLimit = 200;

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function latestTimestamp(...timestamps: Array<string | undefined>): string | undefined {
  return timestamps.filter((value): value is string => value !== undefined).sort().at(-1);
}

export class LocalAttemptRepository implements AttemptRepository {
  list() {
    return read<CompletedAttempt[]>(completedKey, []);
  }

  private completionCounts() {
    if (localStorage.getItem(completionCountsKey) !== null) return read<Record<string, number>>(completionCountsKey, {});
    const counts = this.list().reduce<Record<string, number>>((total, attempt) => ({
      ...total,
      [attempt.quizId]: (total[attempt.quizId] ?? 0) + 1,
    }), {});
    write(completionCountsKey, counts);
    return counts;
  }

  completionCount(quizId: string) {
    return this.completionCounts()[quizId] ?? 0;
  }

  private lowestScores() {
    if (localStorage.getItem(lowestScoresKey) !== null) return read<Record<string, number>>(lowestScoresKey, {});
    const scores = this.list().reduce<Record<string, number>>((total, attempt) => {
      const lowest = total[attempt.quizId];
      total[attempt.quizId] = lowest === undefined ? attempt.score.percentage : Math.min(lowest, attempt.score.percentage);
      return total;
    }, {});
    write(lowestScoresKey, scores);
    return scores;
  }

  lowestScore(quizId: string) {
    return this.lowestScores()[quizId];
  }

  private latestScores() {
    if (localStorage.getItem(latestScoresKey) !== null) return read<Record<string, RecentScore>>(latestScoresKey, {});
    const scores = this.list().reduce<Record<string, RecentScore>>((total, attempt) => {
      const existing = total[attempt.quizId];
      if (!existing || attempt.completedAt > existing.completedAt) {
        total[attempt.quizId] = { percentage: attempt.score.percentage, completedAt: attempt.completedAt };
      }
      return total;
    }, {});
    write(latestScoresKey, scores);
    return scores;
  }

  latestScore(quizId: string) {
    return this.latestScores()[quizId];
  }

  latestActivityAt(quizId: string) {
    const recorded = read<Record<string, string>>(activityKey, {})[quizId];
    return recorded ?? latestTimestamp(this.getActive(quizId)?.startedAt, this.latestScore(quizId)?.completedAt);
  }

  getActive(quizId: string) {
    return read<Record<string, Attempt>>(activeKey, {})[quizId];
  }

  private recordActivity(quizId: string, at = new Date().toISOString()) {
    write(activityKey, { ...read<Record<string, string>>(activityKey, {}), [quizId]: at });
  }

  saveActive(attempt: Attempt) {
    write(activeKey, { ...read<Record<string, Attempt>>(activeKey, {}), [attempt.quizId]: attempt });
    this.recordActivity(attempt.quizId);
  }

  clearActive(quizId: string) {
    const values = read<Record<string, Attempt>>(activeKey, {});
    delete values[quizId];
    write(activeKey, values);
  }

  saveCompleted(attempt: CompletedAttempt) {
    const counts = this.completionCounts();
    const lowestScores = this.lowestScores();
    const latestScores = this.latestScores();
    const currentLatest = latestScores[attempt.quizId];
    const latest = !currentLatest || attempt.completedAt >= currentLatest.completedAt
      ? { percentage: attempt.score.percentage, completedAt: attempt.completedAt }
      : currentLatest;

    write(completedKey, [attempt, ...this.list()].slice(0, completedAttemptLimit));
    write(completionCountsKey, { ...counts, [attempt.quizId]: (counts[attempt.quizId] ?? 0) + 1 });
    write(lowestScoresKey, {
      ...lowestScores,
      [attempt.quizId]: lowestScores[attempt.quizId] === undefined
        ? attempt.score.percentage
        : Math.min(lowestScores[attempt.quizId], attempt.score.percentage),
    });
    write(latestScoresKey, { ...latestScores, [attempt.quizId]: latest });
    this.recordActivity(attempt.quizId, attempt.completedAt);
  }
}

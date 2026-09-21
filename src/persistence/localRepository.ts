import type { Attempt, AttemptRepository, CompletedAttempt, RecentScore } from '../domain/types';
const completedKey = 'meducation.completed-attempts.v1'; const completionCountsKey = 'meducation.completion-counts.v1'; const lowestScoresKey = 'meducation.lowest-scores.v1'; const latestScoresKey = 'meducation.latest-scores.v1'; const activeKey = 'meducation.active-attempts.v1';
function read<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return fallback; } }
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); }
export class LocalAttemptRepository implements AttemptRepository {
  list() { return read<CompletedAttempt[]>(completedKey, []); }
  private completionCounts() {
    const savedCounts = localStorage.getItem(completionCountsKey);
    if (savedCounts !== null) return read<Record<string, number>>(completionCountsKey, {});
    const counts = this.list().reduce<Record<string, number>>((total, attempt) => ({ ...total, [attempt.quizId]: (total[attempt.quizId] ?? 0) + 1 }), {});
    write(completionCountsKey, counts);
    return counts;
  }
  completionCount(quizId: string) { return this.completionCounts()[quizId] ?? 0; }
  private lowestScores() {
    const savedScores = localStorage.getItem(lowestScoresKey);
    if (savedScores !== null) return read<Record<string, number>>(lowestScoresKey, {});
    const scores = this.list().reduce<Record<string, number>>((total, attempt) => {
      const lowest = total[attempt.quizId];
      total[attempt.quizId] = lowest === undefined ? attempt.score.percentage : Math.min(lowest, attempt.score.percentage);
      return total;
    }, {});
    write(lowestScoresKey, scores);
    return scores;
  }
  lowestScore(quizId: string) { return this.lowestScores()[quizId]; }
  private latestScores() {
    const savedScores = localStorage.getItem(latestScoresKey);
    if (savedScores !== null) return read<Record<string, RecentScore>>(latestScoresKey, {});
    const scores = this.list().reduce<Record<string, RecentScore>>((total, attempt) => {
      const existing = total[attempt.quizId];
      if (!existing || attempt.completedAt > existing.completedAt) total[attempt.quizId] = { percentage: attempt.score.percentage, completedAt: attempt.completedAt };
      return total;
    }, {});
    write(latestScoresKey, scores);
    return scores;
  }
  latestScore(quizId: string) { return this.latestScores()[quizId]; }
  getActive(quizId: string) { return read<Record<string, Attempt>>(activeKey, {})[quizId]; }
  saveActive(attempt: Attempt) { write(activeKey, { ...read<Record<string, Attempt>>(activeKey, {}), [attempt.quizId]: attempt }); }
  clearActive(quizId: string) { const values = read<Record<string, Attempt>>(activeKey, {}); delete values[quizId]; write(activeKey, values); }
  saveCompleted(attempt: CompletedAttempt) {
    const counts = this.completionCounts();
    const lowestScores = this.lowestScores();
    const latestScores = this.latestScores();
    write(completedKey, [attempt, ...this.list()].slice(0, 200));
    write(completionCountsKey, { ...counts, [attempt.quizId]: (counts[attempt.quizId] ?? 0) + 1 });
    write(lowestScoresKey, { ...lowestScores, [attempt.quizId]: lowestScores[attempt.quizId] === undefined ? attempt.score.percentage : Math.min(lowestScores[attempt.quizId], attempt.score.percentage) });
    const currentLatest = latestScores[attempt.quizId];
    const latest = !currentLatest || attempt.completedAt >= currentLatest.completedAt
      ? { percentage: attempt.score.percentage, completedAt: attempt.completedAt }
      : currentLatest;
    write(latestScoresKey, { ...latestScores, [attempt.quizId]: latest });
  }
}

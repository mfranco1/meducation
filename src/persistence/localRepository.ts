import type { Attempt, AttemptRepository, CompletedAttempt, RecentScore } from '../domain/types';
import { currentQuestionIdForLegacy, currentQuizIdForLegacy, currentSubjectIdForLegacy } from '../content/legacyContentIds';
const completedKey = 'meducation.completed-attempts.v1'; const completionCountsKey = 'meducation.completion-counts.v1'; const lowestScoresKey = 'meducation.lowest-scores.v1'; const latestScoresKey = 'meducation.latest-scores.v1'; const activeKey = 'meducation.active-attempts.v1';
const contentIdentityMigrationKey = 'meducation.content-identity.v4';
function read<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return fallback; } }
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); }
export class LocalAttemptRepository implements AttemptRepository {
  private migrateContentIdentity() {
    if (localStorage.getItem(contentIdentityMigrationKey) === 'done') return;
    const migrateAttempt = <T extends Attempt>(attempt: T): T => {
      const responses = Object.values(attempt.responses).map(response => {
        const questionId = currentQuestionIdForLegacy(response.questionId);
        return [questionId, { ...response, questionId }];
      });
      return {
        ...attempt,
        quizId: currentQuizIdForLegacy(attempt.quizId),
        subjectId: currentSubjectIdForLegacy(attempt.subjectId),
        currentQuestionId: attempt.currentQuestionId ? currentQuestionIdForLegacy(attempt.currentQuestionId) : undefined,
        responses: Object.fromEntries(responses),
      };
    };
    const remapRecord = <T>(key: string) => Object.fromEntries(Object.entries(read<Record<string, T>>(key, {})).map(([id, value]) => [currentQuizIdForLegacy(id), value]));
    write(completedKey, read<CompletedAttempt[]>(completedKey, []).map(migrateAttempt));
    write(activeKey, Object.fromEntries(Object.values(read<Record<string, Attempt>>(activeKey, {})).map(attempt => {
      const migrated = migrateAttempt(attempt);
      return [migrated.quizId, migrated];
    })));
    if (localStorage.getItem(completionCountsKey) !== null) write(completionCountsKey, remapRecord<number>(completionCountsKey));
    if (localStorage.getItem(lowestScoresKey) !== null) write(lowestScoresKey, remapRecord<number>(lowestScoresKey));
    if (localStorage.getItem(latestScoresKey) !== null) write(latestScoresKey, remapRecord<RecentScore>(latestScoresKey));
    localStorage.setItem(contentIdentityMigrationKey, 'done');
  }
  list() { this.migrateContentIdentity(); return read<CompletedAttempt[]>(completedKey, []); }
  private completionCounts() {
    this.migrateContentIdentity();
    const savedCounts = localStorage.getItem(completionCountsKey);
    if (savedCounts !== null) return read<Record<string, number>>(completionCountsKey, {});
    const counts = this.list().reduce<Record<string, number>>((total, attempt) => ({ ...total, [attempt.quizId]: (total[attempt.quizId] ?? 0) + 1 }), {});
    write(completionCountsKey, counts);
    return counts;
  }
  completionCount(quizId: string) { return this.completionCounts()[quizId] ?? 0; }
  private lowestScores() {
    this.migrateContentIdentity();
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
    this.migrateContentIdentity();
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
  getActive(quizId: string) { this.migrateContentIdentity(); return read<Record<string, Attempt>>(activeKey, {})[quizId]; }
  saveActive(attempt: Attempt) { this.migrateContentIdentity(); write(activeKey, { ...read<Record<string, Attempt>>(activeKey, {}), [attempt.quizId]: attempt }); }
  clearActive(quizId: string) { this.migrateContentIdentity(); const values = read<Record<string, Attempt>>(activeKey, {}); delete values[quizId]; write(activeKey, values); }
  saveCompleted(attempt: CompletedAttempt) {
    this.migrateContentIdentity();
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

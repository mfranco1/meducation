import type { Attempt, AttemptRepository, CompletedAttempt } from '../domain/types';
const completedKey = 'meducation.completed-attempts.v1'; const completionCountsKey = 'meducation.completion-counts.v1'; const activeKey = 'meducation.active-attempts.v1';
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
  getActive(quizId: string) { return read<Record<string, Attempt>>(activeKey, {})[quizId]; }
  saveActive(attempt: Attempt) { write(activeKey, { ...read<Record<string, Attempt>>(activeKey, {}), [attempt.quizId]: attempt }); }
  clearActive(quizId: string) { const values = read<Record<string, Attempt>>(activeKey, {}); delete values[quizId]; write(activeKey, values); }
  saveCompleted(attempt: CompletedAttempt) {
    const counts = this.completionCounts();
    write(completedKey, [attempt, ...this.list()].slice(0, 200));
    write(completionCountsKey, { ...counts, [attempt.quizId]: (counts[attempt.quizId] ?? 0) + 1 });
  }
}

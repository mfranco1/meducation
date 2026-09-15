import type { Attempt, AttemptRepository, CompletedAttempt } from '../domain/types';
const completedKey = 'meducation.completed-attempts.v1'; const activeKey = 'meducation.active-attempts.v1';
function read<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return fallback; } }
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); }
export class LocalAttemptRepository implements AttemptRepository {
  list() { return read<CompletedAttempt[]>(completedKey, []); }
  getActive(quizId: string) { return read<Record<string, Attempt>>(activeKey, {})[quizId]; }
  saveActive(attempt: Attempt) { write(activeKey, { ...read<Record<string, Attempt>>(activeKey, {}), [attempt.quizId]: attempt }); }
  clearActive(quizId: string) { const values = read<Record<string, Attempt>>(activeKey, {}); delete values[quizId]; write(activeKey, values); }
  saveCompleted(attempt: CompletedAttempt) { write(completedKey, [attempt, ...this.list()].slice(0, 200)); }
}

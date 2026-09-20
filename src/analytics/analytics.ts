import { isCorrect } from '../domain/quizEngine';
import type { CompletedAttempt, Question, RecentScore } from '../domain/types';
export interface PerformanceRow { label: string; correct: number; total: number; percentage: number }
export type ScoreTrend = 'increase' | 'decrease' | 'unchanged';
export function lowestScore(scores: Iterable<number>): number | undefined {
  let lowest: number | undefined;
  for (const score of scores) lowest = lowest === undefined ? score : Math.min(lowest, score);
  return lowest;
}
export function averageScore(scores: Iterable<number>): number | undefined {
  let total = 0; let count = 0;
  for (const score of scores) { total += score; count++; }
  return count ? Math.round(total / count) : undefined;
}
export function mostRecentScore(scores: Iterable<RecentScore>): RecentScore | undefined {
  let mostRecent: RecentScore | undefined;
  for (const score of scores) if (!mostRecent || score.completedAt > mostRecent.completedAt) mostRecent = score;
  return mostRecent;
}
export function lowestRecentScore<T extends RecentScore>(scores: Iterable<T>): T | undefined {
  let lowest: T | undefined;
  for (const score of scores) {
    if (!lowest || score.percentage < lowest.percentage || (score.percentage === lowest.percentage && score.completedAt > lowest.completedAt)) lowest = score;
  }
  return lowest;
}
export function scoreTrend(scores: Iterable<RecentScore>): ScoreTrend | undefined {
  const [latest, previous] = [...scores].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  if (!latest || !previous) return undefined;
  if (latest.percentage === previous.percentage) return 'unchanged';
  return latest.percentage > previous.percentage ? 'increase' : 'decrease';
}
export function performanceBy(questions: Question[], attempts: CompletedAttempt[], dimension: keyof Question['metadata']): PerformanceRow[] {
  const rows = new Map<string, { correct: number; total: number }>();
  attempts.forEach(attempt => questions.filter(q => q.quizId === attempt.quizId).forEach(question => {
    const response = attempt.responses[question.id]; if (!response?.selectedChoiceId) return;
    const raw = question.metadata[dimension]; const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    values.forEach(value => { const entry = rows.get(value) ?? { correct: 0, total: 0 }; entry.total++; if (isCorrect(question, response.selectedChoiceId)) entry.correct++; rows.set(value, entry); });
  }));
  return [...rows].map(([label, value]) => ({ label, ...value, percentage: Math.round(value.correct / value.total * 100) })).sort((a,b) => b.total - a.total);
}

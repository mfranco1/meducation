import type { ScoreTrend } from '../analytics/analytics';
import type { Subject } from '../domain/types';

export interface SubjectStat {
  subject: Subject;
  quizCount: number;
  activeQuizCount: number;
  latestActiveAt?: string;
  latest?: number;
  latestCompletedAt?: string;
  trend?: ScoreTrend;
}

/** Returns active subjects in most-recent active-quiz order, preserving catalog order for ties. */
export function activeSubjectStats(subjectStats: SubjectStat[]): SubjectStat[] {
  return subjectStats
    .map((stat, index) => ({ stat, index }))
    .filter(({ stat }) => stat.activeQuizCount > 0)
    .sort((left, right) => (right.stat.latestActiveAt ?? '').localeCompare(left.stat.latestActiveAt ?? '') || left.index - right.index)
    .map(({ stat }) => stat);
}

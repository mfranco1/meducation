import type { SubjectStat } from './progress';
export type { SubjectStat } from './progress';

/** Returns active subjects in most-recent active-quiz order, preserving catalog order for ties. */
export function activeSubjectStats(subjectStats: SubjectStat[]): SubjectStat[] {
  return subjectStats
    .map((stat, index) => ({ stat, index }))
    .filter(({ stat }) => stat.activeQuizCount > 0)
    .sort((left, right) => (right.stat.latestActiveAt ?? '').localeCompare(left.stat.latestActiveAt ?? '') || left.index - right.index)
    .map(({ stat }) => stat);
}

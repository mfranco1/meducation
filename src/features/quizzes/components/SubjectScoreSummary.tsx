import type { ScoreTrend } from '../../../analytics/analytics';
import { ScoreTrendIndicator } from './ScoreTrendIndicator';
import { SubjectProgressLabel, SubjectProgressSummary } from '../../../shared/ui/catalog/SubjectProgressSummary';

export function SubjectScoreSummary({
  score,
  trend,
  activeCount = 0,
}: {
  score?: number;
  trend?: ScoreTrend;
  activeCount?: number;
}) {
  const hasScore = score !== undefined && Number.isFinite(score) && score >= 0 && score <= 100;
  return (
    <SubjectProgressSummary
      percent={score}
      activeCount={activeCount}
      label={
        hasScore && (
          <>
            <SubjectProgressLabel>Latest Score {score}%</SubjectProgressLabel>
            {trend && <ScoreTrendIndicator trend={trend} />}
          </>
        )
      }
    />
  );
}

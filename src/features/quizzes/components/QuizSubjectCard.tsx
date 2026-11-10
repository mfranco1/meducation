import { Chip, Stack, Typography } from '@mui/material';
import { fontWeight } from '../../../shared/theme';
import type { SubjectStat } from '../selectors/progress';
import { ScoreTrendIndicator } from './ScoreTrendIndicator';
import { SubjectCard } from '../../../shared/ui/catalog/SubjectCard';
import { SubjectScoreSummary } from './SubjectScoreSummary';

export function QuizSubjectCard({
  stat,
  onSelect,
  appearance = 'standard',
}: {
  stat: SubjectStat;
  onSelect: (subject: SubjectStat['subject']) => void;
  appearance?: 'standard' | 'dashboardGrid';
}) {
  const { subject, activeQuizCount, latest, trend } = stat;
  if (appearance === 'dashboardGrid') {
    return (
      <SubjectCard subject={subject} onSelect={onSelect} appearance="dashboardGrid">
        <SubjectScoreSummary score={latest} trend={trend} activeCount={activeQuizCount} />
      </SubjectCard>
    );
  }
  return (
    <SubjectCard subject={subject} onSelect={onSelect}>
      {activeQuizCount > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Chip
            label={`${activeQuizCount} in progress`}
            size="small"
            sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: fontWeight.semibold }}
          />
        </Stack>
      )}
      {latest !== undefined && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 2 }}>
          <Typography variant="subtitle2" sx={{ color: 'primary.dark' }}>
            Latest score {latest}%
          </Typography>
          {trend && <ScoreTrendIndicator trend={trend} />}
        </Stack>
      )}
    </SubjectCard>
  );
}

import { Chip, Stack, Typography } from '@mui/material';
import type { SubjectStat } from '../progress';
import { ScoreTrendIndicator } from './ScoreTrendIndicator';
import { SubjectCard } from './SubjectCard';

export function QuizSubjectCard({ stat, onSelect }: { stat: SubjectStat; onSelect: (subject: SubjectStat['subject']) => void }) {
  const { subject, activeQuizCount, latest, trend } = stat;
  return <SubjectCard subject={subject} onSelect={onSelect}>
    {activeQuizCount > 0 && <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}><Chip label={`${activeQuizCount} in progress`} size="small" sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }} /></Stack>}
    {latest !== undefined && <Stack alignItems="center" direction="row" spacing={0.75} sx={{ mt: 2 }}>
      <Typography variant="body2" sx={{ color: 'primary.dark', fontWeight: 700 }}>Latest Score {latest}%</Typography>
      {trend && <ScoreTrendIndicator trend={trend} />}
    </Stack>}
  </SubjectCard>;
}

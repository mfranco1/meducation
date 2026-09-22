import { Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { SubjectStat } from '../dashboard';
import { ScoreTrendIndicator } from './ScoreTrendIndicator';

export function SubjectCard({ stat, onSelect }: { stat: SubjectStat; onSelect: (subject: SubjectStat['subject']) => void }) {
  const { subject, quizCount, activeQuizCount, latest, trend } = stat;

  return <Card sx={{ height: '100%', '&:hover': { borderColor: subject.accent, transform: 'translateY(-2px)' }, '&:has(.Mui-focusVisible)': { borderColor: subject.accent }, transition: 'all .18s' }}>
    <CardActionArea aria-label={`Open ${subject.name}`} onClick={() => onSelect(subject)} sx={{ alignItems: 'flex-start', display: 'flex', height: '100%', justifyContent: 'flex-start', textAlign: 'left' }}>
      <CardContent sx={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', width: '100%' }}><Typography variant="h6">{subject.name}</Typography><Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
        <Chip label={`${quizCount} quizzes`} size="small" />
        {activeQuizCount > 0 && <Chip label={`${activeQuizCount} in progress`} size="small" sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }} />}
      </Stack>
        {latest !== undefined && <Stack alignItems="center" direction="row" spacing={0.75} sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ color: 'primary.dark', fontWeight: 700 }}>Latest Score {latest}%</Typography>
          {trend && <ScoreTrendIndicator trend={trend} />}
        </Stack>}
      </CardContent>
    </CardActionArea>
  </Card>;
}

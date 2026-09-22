import { Box, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import type { ScoreTrend } from '../../analytics/analytics';
import type { CompletedAttempt, Subject } from '../../domain/types';
import { ScoreTrendIndicator } from '../components/ScoreTrendIndicator';
import { StatCard } from '../components/StatCard';

export interface SubjectStat {
  subject: Subject;
  quizCount: number;
  activeQuizCount: number;
  latest?: number;
  latestCompletedAt?: string;
  trend?: ScoreTrend;
}

export function DashboardScreen({ attempts, subjectStats, averageLatest, personalLowest, personalLowestSubject, onSelectSubject }: { attempts: CompletedAttempt[]; subjectStats: SubjectStat[]; averageLatest?: number; personalLowest?: number; personalLowestSubject?: string; onSelectSubject: (subject: Subject) => void }) {
  return <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>
      <StatCard label="Completed quizzes" value={attempts.length} />
      <StatCard label="Average" value={averageLatest === undefined ? '—' : `${averageLatest}%`} />
      <StatCard badge={personalLowestSubject} label="Lowest" value={personalLowest === undefined ? '—' : `${personalLowest}%`} />
    </Stack>
    <Typography variant="h5" sx={{ mb: 2 }}>Subjects</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>
      {subjectStats.map(({ subject, quizCount, activeQuizCount, latest, trend }) => <Card key={subject.id} sx={{ cursor: 'pointer', '&:hover': { borderColor: subject.accent, transform: 'translateY(-2px)' }, transition: 'all .18s' }} onClick={() => onSelectSubject(subject)}>
        <CardContent><Typography variant="h6">{subject.name}</Typography><Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
          <Chip label={`${quizCount} quizzes`} size="small" />
          {activeQuizCount > 0 && <Chip label={`${activeQuizCount} in progress`} size="small" sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }} />}
        </Stack>
          {latest !== undefined && <Stack alignItems="center" direction="row" spacing={0.75} sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ color: 'primary.dark', fontWeight: 700 }}>Latest Score {latest}%</Typography>
            {trend && <ScoreTrendIndicator trend={trend} />}
          </Stack>}
        </CardContent>
      </Card>)}
    </Box>
  </Container>;
}

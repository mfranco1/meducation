import { Box, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import type { CompletedAttempt, Subject } from '../../domain/types';
import { StatCard } from '../components/StatCard';

export interface SubjectStat {
  subject: Subject;
  quizCount: number;
  latest?: number;
}

export function DashboardScreen({ attempts, subjectStats, averageLatest, personalLowest, onSelectSubject }: { attempts: CompletedAttempt[]; subjectStats: SubjectStat[]; averageLatest?: number; personalLowest?: number; onSelectSubject: (subject: Subject) => void }) {
  return <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
    <Stack sx={{ mb: 4 }}><Typography variant="h4">Choose a subject and start practicing</Typography></Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>
      <StatCard label="Completed quizzes" value={attempts.length} />
      <StatCard label="Average" value={averageLatest === undefined ? '—' : `${averageLatest}%`} />
      <StatCard label="Personal Lowest" value={personalLowest === undefined ? '—' : `${personalLowest}%`} />
    </Stack>
    <Typography variant="h5" sx={{ mb: 2 }}>Subjects</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>
      {subjectStats.map(({ subject, quizCount, latest }) => <Card key={subject.id} sx={{ cursor: 'pointer', '&:hover': { borderColor: subject.accent, transform: 'translateY(-2px)' }, transition: 'all .18s' }} onClick={() => onSelectSubject(subject)}>
        <CardContent><Typography variant="h6">{subject.name}</Typography><Chip label={`${quizCount} quizzes`} size="small" sx={{ mt: 1.25 }} />
          {latest !== undefined && <Typography variant="body2" sx={{ mt: 2, color: 'primary.dark', fontWeight: 700 }}>Latest Score {latest}%</Typography>}
        </CardContent>
      </Card>)}
    </Box>
  </Container>;
}

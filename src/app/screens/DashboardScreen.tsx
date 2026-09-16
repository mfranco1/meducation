import { Box, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import type { CompletedAttempt, Subject } from '../../domain/types';
import { StatCard } from '../components/StatCard';

export interface SubjectStat {
  subject: Subject;
  quizCount: number;
  best?: number;
}

export function DashboardScreen({ attempts, subjectStats, onSelectSubject }: { attempts: CompletedAttempt[]; subjectStats: SubjectStat[]; onSelectSubject: (subject: Subject) => void }) {
  const best = attempts.length ? `${Math.max(...attempts.map(attempt => attempt.score.percentage))}%` : '—';
  const reviewed = attempts.reduce((total, attempt) => total + attempt.score.total, 0);
  return <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
    <Stack sx={{ mb: 4 }}><Typography variant="h4">Choose a subject and start practicing</Typography></Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>
      <StatCard label="Completed quizzes" value={attempts.length} />
      <StatCard label="Questions reviewed" value={reviewed} />
      <StatCard label="Personal best" value={best} />
    </Stack>
    <Typography variant="h5" sx={{ mb: 2 }}>Subjects</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>
      {subjectStats.map(({ subject, quizCount, best: subjectBest }) => <Card key={subject.id} sx={{ cursor: 'pointer', '&:hover': { borderColor: subject.accent, transform: 'translateY(-2px)' }, transition: 'all .18s' }} onClick={() => onSelectSubject(subject)}>
        <CardContent><Typography variant="h6">{subject.name}</Typography><Chip label={`${quizCount} quizzes`} size="small" sx={{ mt: 1.25 }} />
          {subjectBest !== undefined && <Typography variant="body2" sx={{ mt: 2, color: 'primary.dark', fontWeight: 700 }}>Best score {subjectBest}%</Typography>}
        </CardContent>
      </Card>)}
    </Box>
  </Container>;
}

import { Box, Container, Stack, Typography } from '@mui/material';
import type { CompletedAttempt, Subject } from '../../domain/types';
import { activeSubjectStats, type SubjectStat } from '../dashboard';
import { ActiveSubjectCarousel } from '../components/ActiveSubjectCarousel';
import { StatCard } from '../components/StatCard';
import { SubjectCard } from '../components/SubjectCard';

export type { SubjectStat } from '../dashboard';

export function DashboardScreen({ attempts, subjectStats, averageLatest, personalLowest, personalLowestSubject, onSelectSubject }: { attempts: CompletedAttempt[]; subjectStats: SubjectStat[]; averageLatest?: number; personalLowest?: number; personalLowestSubject?: string; onSelectSubject: (subject: Subject) => void }) {
  return <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>
      <StatCard label="Completed quizzes" value={attempts.length} />
      <StatCard label="Average" value={averageLatest === undefined ? '—' : `${averageLatest}%`} />
      <StatCard badge={personalLowestSubject} label="Lowest" value={personalLowest === undefined ? '—' : `${personalLowest}%`} />
    </Stack>
    <ActiveSubjectCarousel subjects={activeSubjectStats(subjectStats)} onSelectSubject={onSelectSubject} />
    <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>All Subjects</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>
      {subjectStats.map(stat => <SubjectCard key={stat.subject.id} stat={stat} onSelect={onSelectSubject} />)}
    </Box>
  </Container>;
}

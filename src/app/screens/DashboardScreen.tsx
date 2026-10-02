import { Box, Container, Stack, Typography } from '@mui/material';
import type { CompletedAttempt, Subject } from '../../domain/types';
import { activeSubjectStats, type SubjectStat } from '../dashboard';
import { ActiveSubjectCarousel } from '../components/ActiveSubjectCarousel';
import { StatCard } from '../components/StatCard';
import { SubjectCard } from '../components/SubjectCard';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ContentLoadFailure } from '../components/ContentLoadFailure';

export type { SubjectStat } from '../dashboard';

export function DashboardScreen({ attempts, subjectStats, averageLatest, personalLowest, personalLowestSubject, loading = false, statsLoading = false, activeAttempts = false, error, onRetry = () => undefined, onSelectSubject }: { attempts: CompletedAttempt[]; subjectStats: SubjectStat[]; averageLatest?: number; personalLowest?: number; personalLowestSubject?: string; loading?: boolean; statsLoading?: boolean; activeAttempts?: boolean; error?: Error; onRetry?: () => void; onSelectSubject: (subject: Subject) => void }) {
  return <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>
      <StatCard label="Completed quizzes" value={attempts.length} />
      {error ? <Box sx={{ flex: 2 }}><ContentLoadFailure title="Failed to load statistics" error={error} onRetry={onRetry} /></Box> : <>
        <StatCard label="Average" value={statsLoading ? null : averageLatest === undefined ? '—' : `${averageLatest}%`} />
        <StatCard badge={statsLoading ? undefined : personalLowestSubject} label="Lowest" value={statsLoading ? null : personalLowest === undefined ? '—' : `${personalLowest}%`} />
      </>}
    </Stack>
    {loading && activeAttempts && <Box sx={{ mb: 3 }} role="status" aria-busy="true" aria-label="Loading active subjects"><LoadingSkeleton variant="rounded" height={122} /></Box>}
    {!loading && !error && <ActiveSubjectCarousel subjects={activeSubjectStats(subjectStats)} onSelectSubject={onSelectSubject} />}
    <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>All Subjects</Typography>
    {error ? <ContentLoadFailure title="Failed to load subjects" error={error} onRetry={onRetry} /> : loading ? <Box role="status" aria-busy="true" aria-label="Loading subjects" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>{Array.from({ length: 6 }, (_, index) => <LoadingSkeleton key={index} variant="rounded" height={112} />)}</Box> : subjectStats.length === 0 ? <Typography color="text.secondary">No subjects are available yet.</Typography> : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>
      {subjectStats.map(stat => <SubjectCard key={stat.subject.id} stat={stat} onSelect={onSelectSubject} />)}
    </Box>}
  </Container>;
}

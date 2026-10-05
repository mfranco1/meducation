import { useEffect, useState } from 'react';
import { Box, Button, Container, Stack, Typography } from '@mui/material';
import CloudOffRoundedIcon from '@mui/icons-material/CloudOffRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import type { CompletedAttempt, Subject } from '../../domain/types';
import type { ContentLoadError } from '../../content/contentTransport';
import { activeSubjectStats, type SubjectStat } from '../dashboard';
import { ActiveSubjectCarousel } from '../components/ActiveSubjectCarousel';
import { StatCard } from '../components/StatCard';
import { SubjectCard } from '../components/SubjectCard';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

export type { SubjectStat } from '../dashboard';

function useRetrySeconds(retryAt?: number) {
  const [seconds, setSeconds] = useState<number | undefined>();
  useEffect(() => {
    const update = () => setSeconds(retryAt === undefined ? undefined : Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    if (retryAt === undefined) return;
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  return seconds;
}

function SharedFailureBanner({ error, retrying, retryAt, onRetry }: { error?: Error; retrying: boolean; retryAt?: number; onRetry: () => void }) {
  const seconds = useRetrySeconds(retryAt);
  const reload = (error as ContentLoadError | undefined)?.kind === 'revision';
  const detail = reload ? 'Reload to continue with the latest available content.'
    : retrying ? seconds && seconds > 0 ? `Trying again in ${seconds}s…` : 'Retrying…'
      : 'Your saved quiz history is safe. Please try again.';
  return <Box role="alert" data-testid="dashboard-error-banner" sx={{ width: '100%', borderBottom: '1px solid', borderColor: 'warning.light', bgcolor: '#fff7ed' }}>
    <Container maxWidth="lg"><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1.25} sx={{ py: 1.5 }}>
    <CloudOffRoundedIcon color="primary" aria-hidden="true" />
    <Typography variant="body2" sx={{ flex: 1 }}><Box component="span" sx={{ fontWeight: 800 }}>{reload ? 'Content has changed.' : 'We can’t load your stats and subjects right now.'}</Box> {detail}</Typography>
    <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={onRetry} sx={{ minHeight: 44, whiteSpace: 'nowrap' }}>
      {reload ? 'Reload' : retrying ? 'Retrying...' : 'Retry'}
    </Button>
    </Stack></Container>
  </Box>;
}

function StatFailure({ label, onRetry }: { label: string; onRetry: () => void }) {
  return <StatCard label={label} value="—" footer={<Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
    <Stack direction="row" spacing={.5} alignItems="center"><ErrorOutlineRoundedIcon color="error" sx={{ fontSize: 16 }} aria-hidden="true" /><Typography color="text.secondary" variant="caption">Couldn’t load</Typography></Stack>
    <Button variant="outlined" size="small" startIcon={<RefreshRoundedIcon />} onClick={onRetry} aria-label={`Retry ${label.toLowerCase()} statistics`} sx={{ minHeight: 36, px: 1 }}>Retry</Button>
  </Stack>} />;
}

function SubjectPlaceholders({ dashed = false }: { dashed?: boolean }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>
    {Array.from({ length: 6 }, (_, index) => <Box key={index} sx={dashed ? { border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 3 } : undefined}><LoadingSkeleton variant="rounded" height={dashed ? 58 : 112} /></Box>)}
  </Box>;
}

function SubjectFailure({ onRetry }: { onRetry: () => void }) {
  return <Box sx={{ position: 'relative' }}><SubjectPlaceholders dashed />
    <Stack alignItems="center" spacing={1} sx={{ position: 'absolute', inset: 0, justifyContent: 'center', pointerEvents: 'none' }}>
      <Typography variant="body2" sx={{ fontWeight: 700, bgcolor: 'background.default', px: 1 }}>Couldn’t load subjects</Typography>
      <Button variant="outlined" size="small" startIcon={<RefreshRoundedIcon />} onClick={onRetry} sx={{ pointerEvents: 'auto', minHeight: 40 }}>Retry</Button>
    </Stack>
  </Box>;
}

export function DashboardScreen({ attempts, subjectStats, averageLatest, personalLowest, personalLowestSubject, loading = false, retrying = false, statsLoading = false, activeAttempts = false, error, retryAt, onRetry = () => undefined, onSelectSubject, statsError, subjectsError }: { attempts: readonly CompletedAttempt[]; subjectStats: SubjectStat[]; averageLatest?: number; personalLowest?: number; personalLowestSubject?: string; loading?: boolean; retrying?: boolean; statsLoading?: boolean; activeAttempts?: boolean; error?: Error; retryAt?: number; onRetry?: () => void; onSelectSubject: (subject: Subject) => void; statsError?: Error; subjectsError?: Error }) {
  const sharedError = error;
  const statsFailure = !sharedError && statsError;
  const subjectsFailure = !sharedError && subjectsError;
  return <>
    {(sharedError || retrying) && <SharedFailureBanner error={sharedError} retrying={retrying} retryAt={retryAt} onRetry={onRetry} />}
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>
      <StatCard label="Completed quizzes" value={attempts.length} />
      {sharedError || retrying ? <><StatCard label="Average" value={null} /><StatCard label="Lowest" value={null} /></>
        : statsFailure ? <><StatFailure label="Average" onRetry={onRetry} /><StatFailure label="Lowest" onRetry={onRetry} /></>
          : <><StatCard label="Average" value={statsLoading ? null : averageLatest === undefined ? '—' : `${averageLatest}%`} />
            <StatCard badge={statsLoading ? undefined : personalLowestSubject} label="Lowest" value={statsLoading ? null : personalLowest === undefined ? '—' : `${personalLowest}%`} /></>}
    </Stack>
    {(loading || retrying || sharedError) && activeAttempts && <Box sx={{ mb: 3 }} role="status" aria-busy={!sharedError} aria-label={retrying ? 'Retrying active subjects' : 'Loading active subjects'}><LoadingSkeleton variant="rounded" height={122} /></Box>}
    {!loading && !sharedError && !subjectsFailure && !retrying && <ActiveSubjectCarousel subjects={activeSubjectStats(subjectStats)} onSelectSubject={onSelectSubject} />}
    <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>All Subjects</Typography>
    {sharedError || retrying ? <SubjectPlaceholders /> : subjectsFailure ? <SubjectFailure onRetry={onRetry} /> : loading ? <Box role="status" aria-busy="true" aria-label="Loading subjects"><SubjectPlaceholders /></Box> : subjectStats.length === 0 ? <Typography color="text.secondary">No subjects are available yet.</Typography> : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>
      {subjectStats.map(stat => <SubjectCard key={stat.subject.id} stat={stat} onSelect={onSelectSubject} />)}
    </Box>}
    </Container>
  </>;
}

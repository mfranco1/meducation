import { Box, Button, Container, Stack, Typography } from '@mui/material';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useEffect, useRef, useState } from 'react';
import type { CompletedAttempt, Subject } from '../../domain/types';
import { activeSubjectStats, type SubjectStat } from '../dashboard';
import { ActiveSubjectCarousel } from '../components/ActiveSubjectCarousel';
import { StatCard } from '../components/StatCard';
import { SubjectCard } from '../components/SubjectCard';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ContentRecoveryBanner } from '../components/ContentRecoveryBanner';

export type { SubjectStat } from '../dashboard';

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

export function DashboardScreen({ attempts, subjectStats, averageLatest, personalLowest, personalLowestSubject, loading = false, retrying = false, statsLoading = false, activeAttempts = false, error, retryAt, onRetry = () => undefined, onSelectSubject, statsError, subjectsError }: { attempts: readonly CompletedAttempt[]; subjectStats: SubjectStat[]; averageLatest?: number; personalLowest?: number; personalLowestSubject?: string; loading?: boolean; retrying?: boolean; statsLoading?: boolean; activeAttempts?: boolean; error?: Error; retryAt?: number; onRetry?: () => void | Promise<void>; onSelectSubject: (subject: Subject) => void; statsError?: Error; subjectsError?: Error }) {
  const [manualRetryPending, setManualRetryPending] = useState(false);
  const manualRetryStarted = useRef(false);
  useEffect(() => {
    if (!manualRetryPending) {
      manualRetryStarted.current = false;
      return;
    }
    if (loading || retrying) manualRetryStarted.current = true;
    else if (manualRetryStarted.current) setManualRetryPending(false);
  }, [loading, manualRetryPending, retrying]);
  const sharedError = error;
  const statsFailure = !sharedError && statsError;
  const subjectsFailure = !sharedError && subjectsError;
  const handleRetry = () => { manualRetryStarted.current = false; setManualRetryPending(true); return onRetry(); };
  const sharedRecovery = Boolean(sharedError || retrying || manualRetryPending);
  return <>
    {sharedRecovery && <ContentRecoveryBanner testId="dashboard-error-banner" error={sharedError} retrying={retrying} busy={manualRetryPending && loading} retryAt={retryAt} onRetry={handleRetry} />}
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>
      <StatCard label="Completed quizzes" value={attempts.length} />
      {sharedRecovery ? <><StatCard label="Average" value={null} /><StatCard label="Lowest" value={null} /></>
        : statsFailure ? <><StatFailure label="Average" onRetry={onRetry} /><StatFailure label="Lowest" onRetry={onRetry} /></>
          : <><StatCard label="Average" value={statsLoading ? null : averageLatest === undefined ? '—' : `${averageLatest}%`} />
            <StatCard badge={statsLoading ? undefined : personalLowestSubject} label="Lowest" value={statsLoading ? null : personalLowest === undefined ? '—' : `${personalLowest}%`} /></>}
    </Stack>
    {(loading || retrying || sharedError || manualRetryPending) && activeAttempts && <Box sx={{ mb: 3 }} role="status" aria-busy={!sharedError} aria-label={retrying ? 'Retrying active subjects' : 'Loading active subjects'}><LoadingSkeleton variant="rounded" height={122} /></Box>}
    {!loading && !sharedError && !subjectsFailure && !retrying && !manualRetryPending && <ActiveSubjectCarousel subjects={activeSubjectStats(subjectStats)} onSelectSubject={onSelectSubject} />}
    <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>All Subjects</Typography>
    {sharedRecovery ? <SubjectPlaceholders /> : subjectsFailure ? <SubjectFailure onRetry={onRetry} /> : loading ? <Box role="status" aria-busy="true" aria-label="Loading subjects"><SubjectPlaceholders /></Box> : subjectStats.length === 0 ? <Typography color="text.secondary">No subjects are available yet.</Typography> : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>
      {subjectStats.map(stat => <SubjectCard key={stat.subject.id} stat={stat} onSelect={onSelectSubject} />)}
    </Box>}
    </Container>
  </>;
}

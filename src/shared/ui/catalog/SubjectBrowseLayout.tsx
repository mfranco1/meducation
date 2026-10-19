import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { SubjectIconBadge } from './icons/SubjectIconBadge';
import { reducedMotion } from '../motion';

export function SubjectBrowseLayout({ subjectId, subjectName, subjectDescription, progress, onBack, children }: { subjectId: string; subjectName: string; subjectDescription?: string; progress?: { completed: number; total: number; nouns: string }; onBack: () => void; children: ReactNode }) {
  const percent = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
    <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} color="inherit">Dashboard</Button>
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mt: 2, mb: 4 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 0 }}>
        <SubjectIconBadge subjectId={subjectId} size={88} />
        <Stack justifyContent="center" sx={{ minHeight: 88, minWidth: 0 }}>
          <Typography variant="h3" sx={{ fontSize: { xs: '1.5rem', sm: '3rem' }, overflowWrap: 'break-word', minWidth: 0 }}>{subjectName}</Typography>
          {subjectDescription && <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>{subjectDescription}</Typography>}
        </Stack>
      </Stack>
      {progress && progress.total > 0 && <Stack alignItems="center" spacing={0.75} sx={{ flex: '0 0 auto', textAlign: 'center' }}>
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <CircularProgress variant="determinate" value={100} size={66} thickness={4} sx={{ color: 'divider' }} aria-hidden />
          {percent > 0 && <CircularProgress variant="determinate" value={percent} size={66} thickness={4} aria-hidden sx={{ position: 'absolute', left: 0, '& .MuiCircularProgress-circle': { [reducedMotion]: { transition: 'none' } } }} />}
          <Typography variant="subtitle2" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{percent}%</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>{`${progress.completed} / ${progress.total} ${progress.nouns} completed`}</Typography>
      </Stack>}
    </Stack>
    {children}
  </Container>;
}

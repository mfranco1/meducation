import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { SubjectIconBadge } from './icons/SubjectIconBadge';
import { reducedMotion } from '../motion';

export function SubjectBrowseLayout({ subjectId, subjectName, progress, onBack, children }: { subjectId: string; subjectName: string; progress?: { completed: number; total: number; nouns: string }; onBack: () => void; children: ReactNode }) {
  const percent = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
    <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} color="inherit">All subjects</Button>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mt: 2, mb: 4 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 0 }}>
        <SubjectIconBadge subjectId={subjectId} />
        <Typography variant="h3" sx={{ overflowWrap: 'anywhere' }}>{subjectName}</Typography>
      </Stack>
      {progress && progress.total > 0 && <Stack alignItems="center" sx={{ flex: '0 0 auto', textAlign: 'center' }}>
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <CircularProgress variant="determinate" value={100} size={72} thickness={4} sx={{ color: 'divider' }} aria-hidden />
          <CircularProgress variant="determinate" value={percent} size={72} thickness={4} aria-hidden sx={{ position: 'absolute', left: 0, '& .MuiCircularProgress-circle': { [reducedMotion]: { transition: 'none' } } }} />
          <Typography variant="subtitle2" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{percent}%</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">{`${progress.completed} / ${progress.total} ${progress.nouns} completed`}</Typography>
      </Stack>}
    </Stack>
    {children}
  </Container>;
}

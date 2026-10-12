import { Box } from '@mui/material';
import { LoadingSkeleton } from '../loading/LoadingSkeleton';

export function SubjectCardSkeleton({ dashed = false }: { dashed?: boolean }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        alignItems: 'stretch',
        bgcolor: 'background.paper',
        border: dashed ? '1px dashed' : '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 172,
        minWidth: 0,
        p: 2.5,
      }}
    >
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}>
        <LoadingSkeleton variant="circular" width={40} height={40} />
        <Box sx={{ flex: 1 }}>
          <LoadingSkeleton variant="text" width="82%" height={24} />
          <LoadingSkeleton variant="text" width="60%" height={20} />
        </Box>
      </Box>
      <Box>
        <LoadingSkeleton variant="text" width="45%" height={20} />
        <LoadingSkeleton variant="rounded" width="100%" height={6} sx={{ borderRadius: 99 }} />
      </Box>
    </Box>
  );
}

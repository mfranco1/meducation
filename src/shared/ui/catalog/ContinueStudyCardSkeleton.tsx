import { Box } from '@mui/material';
import { LoadingSkeleton } from '../loading/LoadingSkeleton';

export function ContinueStudyCardSkeleton() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        background: 'linear-gradient(110deg, #fcf7f3 0%, #fff8f2 58%, #ffe5d3 100%)',
        border: '1px solid #f4ebe5',
        borderRadius: '22px',
        boxSizing: 'border-box',
        containerName: 'continue-card',
        containerType: 'inline-size',
        minHeight: 232,
        minWidth: 0,
        overflow: 'hidden',
        p: 2.75,
        '@container continue-card (min-width: 478px)': { minHeight: 244, p: 3.25 },
        '@container continue-card (min-width: 638px)': { minHeight: 256, p: 4.25 },
        '@container continue-card (max-width: 297px)': { p: 2 },
      }}
    >
      <LoadingSkeleton variant="text" width="34%" height={27} />
      <LoadingSkeleton variant="text" width="48%" height={35} sx={{ mt: 0.5 }} />
      <LoadingSkeleton variant="text" width="28%" height={24} sx={{ mt: 0.5 }} />
      <LoadingSkeleton variant="rounded" width={164} height={48} sx={{ borderRadius: '14px', mt: 2.75 }} />
    </Box>
  );
}

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
        minHeight: 152,
        minWidth: 0,
        overflow: 'hidden',
        px: 2.75,
        py: 1.75,
        '@container continue-card (min-width: 478px)': { minHeight: 156, px: 3.25, py: 2 },
        '@container continue-card (min-width: 638px)': { minHeight: 160, px: 4, py: 2.25 },
        '@container continue-card (max-width: 297px)': { px: 2, py: 1.5 },
      }}
    >
      <LoadingSkeleton variant="text" width="34%" height={27} />
      <LoadingSkeleton variant="text" width="48%" height={35} sx={{ mt: 0.25 }} />
      <LoadingSkeleton variant="text" width="28%" height={24} sx={{ mt: 0.25 }} />
      <LoadingSkeleton variant="rounded" width={164} height={42} sx={{ borderRadius: '14px', mt: 1.75 }} />
    </Box>
  );
}

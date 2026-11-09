import { Box } from '@mui/material';
import { LoadingSkeleton } from '../loading/LoadingSkeleton';
import { radius } from '../../theme';

export function ContinueStudyCardSkeleton() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        background: 'linear-gradient(110deg, #fcf7f3 0%, #fff8f2 58%, #ffe5d3 100%)',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: radius.feature,
        boxSizing: 'border-box',
        containerName: 'continue-card',
        containerType: 'inline-size',
        minHeight: 152,
        minWidth: 0,
        overflow: 'hidden',
        px: 3,
        py: 2,
        '@container continue-card (min-width: 478px)': { minHeight: 156, px: 3, py: 2 },
        '@container continue-card (min-width: 638px)': { minHeight: 160, px: 4, py: 2.5 },
        '@container continue-card (max-width: 297px)': { px: 2, py: 1.5 },
      }}
    >
      <LoadingSkeleton variant="text" width="34%" height={27} />
      <LoadingSkeleton variant="text" width="48%" height={35} sx={{ mt: 0.25 }} />
      <LoadingSkeleton variant="text" width="28%" height={24} sx={{ mt: 0.25 }} />
      <LoadingSkeleton variant="rounded" width={164} height={42} sx={{ borderRadius: radius.control, mt: 2 }} />
    </Box>
  );
}

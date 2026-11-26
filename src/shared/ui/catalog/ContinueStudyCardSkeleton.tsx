import { Box } from '@mui/material';
import { LoadingSkeleton } from '../loading/LoadingSkeleton';
import { radius, shadow } from '../../theme';
import { continueCardBackground, tallHero } from './ContinueStudyCard';

/** Matches ContinueStudyCard's padding, copy width and lines: eyebrow, title, activity, progress, Continue. */
export function ContinueStudyCardSkeleton() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        background: continueCardBackground,
        border: '2px solid',
        borderColor: 'common.white',
        borderRadius: radius.feature,
        boxShadow: shadow.overlay,
        boxSizing: 'border-box',
        containerName: 'continue-card',
        containerType: 'inline-size',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 152,
        minWidth: 0,
        overflow: 'hidden',
        pl: '24px',
        pr: '40px',
        py: '16px',
        '& .skeleton-copy': { width: '100%' },
        '@container continue-card (max-width: 297px)': { pl: '16px', pr: '32px', py: '12px' },
        '@container continue-card (min-width: 478px)': {
          minHeight: 156,
          px: '24px',
          py: '16px',
          '& .skeleton-copy': { width: '58%' },
        },
        '@container continue-card (min-width: 638px)': {
          minHeight: 160,
          px: '32px',
          py: '20px',
          '& .skeleton-copy': { width: '55%' },
        },
        [tallHero]: {
          justifyContent: 'center',
          minHeight: 280,
          px: '28px',
          py: '24px',
          '& .skeleton-copy': { width: '58%' },
        },
      }}
    >
      <Box className="skeleton-copy">
        <LoadingSkeleton variant="text" width="45%" height={24} />
        <LoadingSkeleton variant="text" width="75%" height={35} sx={{ mt: '4px' }} />
        <LoadingSkeleton variant="text" width="55%" height={22} sx={{ mt: '2px' }} />
        <LoadingSkeleton variant="rounded" width={120} height={6} sx={{ borderRadius: radius.pill, mt: '8px' }} />
        <LoadingSkeleton variant="text" width="65%" height={18} sx={{ mt: '4px' }} />
        <LoadingSkeleton variant="rounded" width={140} height={42} sx={{ borderRadius: radius.control, mt: '16px' }} />
      </Box>
    </Box>
  );
}

import { Skeleton, useMediaQuery } from '@mui/material';
import type { SkeletonProps } from '@mui/material';
import { alpha } from '@mui/material/styles';

export function LoadingSkeleton({ sx, ...props }: SkeletonProps) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return (
    <Skeleton
      {...props}
      animation={reducedMotion ? false : 'wave'}
      sx={[{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.09) }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
}

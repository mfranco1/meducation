import { Skeleton, useMediaQuery } from '@mui/material';
import type { SkeletonProps } from '@mui/material';

export function LoadingSkeleton(props: SkeletonProps) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return <Skeleton {...props} animation={reducedMotion ? false : 'wave'} sx={{ bgcolor: 'rgba(185, 81, 27, 0.09)' }} />;
}

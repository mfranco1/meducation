import { keyframes } from '@emotion/react';
import { Box, LinearProgress, Typography } from '@mui/material';
import { useEffect, type ReactNode } from 'react';
import { AppBrand } from '../brand/AppBrand';
import { easing, reducedMotion } from '../motion';
import { screenTransitionDurationMs } from '../transitions/ScreenTransition';

const enterContent = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

export function ScreenLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-busy="true"
      sx={{
        flex: 1,
        minHeight: 240,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        color: 'text.secondary',
      }}
    >
      <AppBrand variant="icon" size={{ xs: 80, sm: 96 }} decorative />
      <LinearProgress
        aria-hidden="true"
        sx={{
          width: { xs: 'min(208px, calc(100% - 32px))', sm: 240 },
          height: 6,
          borderRadius: 99,
          bgcolor: 'action.hover',
          '& .MuiLinearProgress-bar': { borderRadius: 99 },
          [reducedMotion]: {
            '& .MuiLinearProgress-bar': { animation: 'none', transform: 'translateX(-35%)', width: '45%' },
          },
        }}
      />
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ px: 2, maxWidth: '100%', textAlign: 'center', fontSize: { xs: '1rem', sm: '1.125rem' }, lineHeight: 1.5 }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export function LoadedScreenContent({
  children,
  animate,
  onReady,
}: {
  children: ReactNode;
  animate: boolean;
  onReady?: () => void;
}) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    <Box
      sx={{
        animation: animate ? `${enterContent} ${screenTransitionDurationMs}ms ${easing.standard} both` : 'none',
        [reducedMotion]: { animation: 'none' },
      }}
    >
      {children}
    </Box>
  );
}

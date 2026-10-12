import { keyframes } from '@emotion/react';
import { Box, LinearProgress, Typography } from '@mui/material';
import { useEffect, type ReactNode } from 'react';
import { AppBrand } from '../brand/AppBrand';

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
        gap: 1.5,
        color: 'text.secondary',
      }}
    >
      <AppBrand variant="icon" size={56} decorative />
      <LinearProgress
        aria-hidden="true"
        sx={{
          width: 144,
          height: 4,
          borderRadius: 99,
          bgcolor: 'action.hover',
          '& .MuiLinearProgress-bar': { borderRadius: 99 },
          '@media (prefers-reduced-motion: reduce)': {
            '& .MuiLinearProgress-bar': { animation: 'none', transform: 'translateX(-35%)', width: '45%' },
          },
        }}
      />
      <Typography variant="body2" color="text.secondary">
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
        animation: animate ? `${enterContent} 170ms cubic-bezier(0.2, 0, 0, 1) both` : 'none',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      {children}
    </Box>
  );
}

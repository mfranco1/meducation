import { keyframes } from '@emotion/react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useEffect, type ReactNode } from 'react';

const enterContent = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

export function ScreenLoading({ label = 'Loading…' }: { label?: string }) {
  return <Box role="status" aria-live="polite" aria-busy="true" sx={{ flex: 1, minHeight: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, color: 'text.secondary' }}>
    <CircularProgress aria-hidden="true" size={32} thickness={4} sx={{ color: 'primary.main', '@media (prefers-reduced-motion: reduce)': { animation: 'none', transform: 'none', '& .MuiCircularProgress-circle': { animation: 'none', strokeDasharray: '80px, 200px', strokeDashoffset: 0 } } }} />
    <Typography variant="body2" color="text.secondary">{label}</Typography>
  </Box>;
}

export function LoadedScreenContent({ children, animate, onReady }: { children: ReactNode; animate: boolean; onReady?: () => void }) {
  useEffect(() => { onReady?.(); }, [onReady]);
  return <Box sx={{ animation: animate ? `${enterContent} 170ms cubic-bezier(0.2, 0, 0, 1) both` : 'none', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}>{children}</Box>;
}

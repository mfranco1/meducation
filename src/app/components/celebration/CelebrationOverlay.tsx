import { keyframes } from '@emotion/react';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { Box, Stack, Typography } from '@mui/material';
import { useEffect } from 'react';
import { RadiatingCircles, useReducedMotion } from './RadiatingCircles';

export type CelebrationVariant = 'streak' | 'perfect';

export interface CelebrationOverlayProps {
  open: boolean;
  title: string;
  message: string;
  variant: CelebrationVariant;
  durationMs?: number;
  onComplete?: () => void;
}

const enter = keyframes`
  0% { opacity: 0; transform: translateY(-10px) scale(.94); }
  18% { opacity: 1; transform: translateY(0) scale(1.03); }
  30%, 82% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-6px) scale(.98); }
`;
const reducedEnter = keyframes`
  0% { opacity: 0; }
  14%, 86% { opacity: 1; }
  100% { opacity: 0; }
`;
export function CelebrationOverlay({ open, title, message, variant, durationMs = variant === 'perfect' ? 3500 : 2500, onComplete }: CelebrationOverlayProps) {
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!open || !onComplete) return;
    const timer = window.setTimeout(onComplete, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onComplete, open]);

  if (!open) return null;
  const particles = variant === 'perfect' ? 7 : 5;
  return <Box
    role="status"
    aria-live="polite"
    aria-atomic="true"
    sx={{ position: 'fixed', zIndex: theme => theme.zIndex.snackbar, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(calc(100% - 32px), 390px)', pointerEvents: 'none' }}
  >
    <Box
      sx={{
        border: '1px solid', borderColor: '#8bc9a9', borderRadius: 3, bgcolor: '#f1faf4', boxShadow: '0 10px 30px rgba(27, 104, 66, .18)', px: 2.25, py: 1.25,
        animation: `${reducedMotion ? reducedEnter : enter} ${durationMs}ms ease-in-out both`,
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
        <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', bgcolor: '#d9f0e1', color: 'success.main', flexShrink: 0 }}><CheckRoundedIcon fontSize="small" /></Box>
        <Box><Typography fontWeight={800} lineHeight={1.2}>{title}</Typography><Typography variant="body2" color="text.secondary">{message}</Typography></Box>
      </Stack>
      <RadiatingCircles particleCount={particles} durationMs={durationMs - 150} delayMs={90} />
    </Box>
  </Box>;
}

import { keyframes } from '@emotion/react';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { Box, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

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
const sparkle = keyframes`
  0% { opacity: 0; transform: translate(0, 0) scale(.4) rotate(0deg); }
  20% { opacity: 1; }
  75% { opacity: .8; }
  100% { opacity: 0; transform: translate(var(--sparkle-x), var(--sparkle-y)) scale(1.15) rotate(90deg); }
`;

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reducedMotion;
}

export function CelebrationOverlay({ open, title, message, variant, durationMs = variant === 'perfect' ? 2200 : 1700, onComplete }: CelebrationOverlayProps) {
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!open || !onComplete) return;
    const timer = window.setTimeout(onComplete, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onComplete, open]);

  if (!open) return null;
  const perfect = variant === 'perfect';
  const sparkles = perfect ? 7 : 5;
  return <Box
    role="status"
    aria-live="polite"
    aria-atomic="true"
    sx={{ position: 'fixed', zIndex: theme => theme.zIndex.snackbar, top: { xs: 12, sm: 20 }, left: '50%', transform: 'translateX(-50%)', width: 'min(calc(100% - 32px), 390px)', pointerEvents: 'none' }}
  >
    <Box
      sx={{
        position: 'relative', overflow: 'visible', border: '1px solid', borderColor: perfect ? '#e5ba45' : '#e6b18d', borderRadius: 3, bgcolor: perfect ? '#fff8df' : '#fff4ec', boxShadow: perfect ? '0 10px 30px rgba(128, 82, 11, .18)' : '0 8px 22px rgba(94, 47, 21, .14)', px: 2.25, py: 1.25,
        animation: `${reducedMotion ? reducedEnter : enter} ${durationMs}ms ease-in-out both`,
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', bgcolor: perfect ? '#f5d77b' : 'primary.light', color: perfect ? '#775200' : 'primary.dark', flexShrink: 0 }}><AutoAwesomeRoundedIcon fontSize="small" /></Box>
        <Box><Typography fontWeight={800} lineHeight={1.2}>{title}</Typography><Typography variant="body2" color="text.secondary">{message}</Typography></Box>
      </Stack>
      {!reducedMotion && <Box aria-hidden sx={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {Array.from({ length: sparkles }, (_, index) => <Box
          key={index}
          sx={{
            '--sparkle-x': `${(index - (sparkles - 1) / 2) * 17}px`, '--sparkle-y': `${-22 - (index % 3) * 13}px`, position: 'absolute', width: index % 2 ? 6 : 8, height: index % 2 ? 6 : 8, borderRadius: index % 2 ? '50%' : 1, bgcolor: perfect ? '#d29b13' : 'primary.main', top: index % 2 ? '52%' : '34%', left: `${17 + index * (66 / (sparkles - 1))}%`, animation: `${sparkle} ${durationMs - 150}ms ease-out both`, animationDelay: `${90 + index * 28}ms`,
          }}
        />)}
      </Box>}
    </Box>
  </Box>;
}

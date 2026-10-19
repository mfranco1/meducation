import { keyframes } from '@emotion/react';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import { useEffect, useId } from 'react';
import { brand } from '../../../../shared/brand';
import { easing, useReducedMotion } from '../../../../shared/ui/motion';
import { type CelebrationLevel, GoldBurst } from './GoldBurst';

export type CelebrationVariant = 'streak' | 'perfect';

export interface CelebrationOverlayProps {
  open: boolean;
  title: string;
  message: string;
  variant: CelebrationVariant;
  level: CelebrationLevel;
  durationMs?: number;
  onComplete?: () => void;
}

const durations = [2500, 2500, 2600, 2900, 3200] as const;
const flameSizes = [46, 48, 50, 53, 56] as const;

const enter = keyframes`
  0% { opacity: 0; transform: translateY(-10px) scale(.95); animation-timing-function: ${easing.out}; }
  20% { opacity: 1; transform: translateY(0) scale(1.02); animation-timing-function: ${easing.out}; }
  32%, 82% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-6px) scale(.98); }
`;
const reducedEnter = keyframes`
  0% { opacity: 0; }
  14%, 86% { opacity: 1; }
  100% { opacity: 0; }
`;
const ignite = keyframes`
  0% { transform: scale(.6); opacity: 0; }
  60% { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;
const flicker = keyframes`
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.04); }
`;
const shine = keyframes`
  0% { transform: translateX(-120%) skewX(-20deg); }
  100% { transform: translateX(680%) skewX(-20deg); }
`;

function StreakFlame({ size, animated }: { size: number; animated: boolean }) {
  const theme = useTheme();
  const id = useId();
  const { primary, reward } = theme.palette;
  return <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} style={{ position: 'relative', display: 'block', overflow: 'visible', transformOrigin: '50% 100%', filter: `drop-shadow(0 2px 4px ${alpha(primary.main, .3)})`, animation: animated ? `${ignite} 520ms ${easing.out} both, ${flicker} 1.6s ease-in-out 520ms infinite` : undefined }}>
    <defs>
      <linearGradient id={`${id}o`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={primary.main} /><stop offset="1" stopColor={brand.palette.light.right} /></linearGradient>
      <linearGradient id={`${id}m`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={reward.main} /><stop offset="1" stopColor={brand.palette.light.right} /></linearGradient>
      <linearGradient id={`${id}i`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={reward.main} /><stop offset="1" stopColor={reward.light} /></linearGradient>
    </defs>
    <path d="M12 1.5C12.6 5 18.2 7.6 18.2 13.6A6.2 6.2 0 0 1 5.8 13.6C5.8 11.4 6.8 9.8 8.2 8.4 8.4 10 9.2 11 10.3 11.3 10 7.2 10.6 4.2 12 1.5Z" fill={`url(#${id}o)`} />
    <path d="M12 8C12.4 10.4 16 11.8 16 15.2A4 4 0 0 1 8 15.2C8 13.8 8.6 12.9 9.5 12 9.7 12.9 10.2 13.4 10.9 13.6 10.7 11.2 11 9.6 12 8Z" fill={`url(#${id}m)`} />
    <path d="M12 13C12.3 14.4 14 15.1 14 16.8A2 2 0 0 1 10 16.8C10 16 10.4 15.5 10.9 15 11 15.5 11.3 15.8 11.6 15.9 11.5 14.6 11.6 13.8 12 13Z" fill={`url(#${id}i)`} />
  </svg>;
}

export function CelebrationOverlay({ open, title, message, variant, level, durationMs = durations[level - 1], onComplete }: CelebrationOverlayProps) {
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!open || !onComplete) return;
    const timer = window.setTimeout(onComplete, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onComplete, open]);

  if (!open) return null;
  const size = flameSizes[level - 1];
  return <Box
    role="status"
    aria-live="polite"
    aria-atomic="true"
    sx={{ position: 'fixed', zIndex: theme => theme.zIndex.snackbar, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(calc(100% - 32px), 390px)', pointerEvents: 'none' }}
  >
    <Box
      sx={{
        position: 'relative', border: '1px solid', borderColor: level >= 4 ? 'reward.main' : '#eee5df', borderRadius: 1, bgcolor: 'background.paper', px: 2.5, py: 1.75,
        boxShadow: t => `0 2px 6px ${alpha(t.palette.primary.dark, .08)}, 0 16px 40px ${alpha(t.palette.primary.dark, .14)}`,
        animation: `${reducedMotion ? reducedEnter : enter} ${durationMs}ms ease-in-out both`,
      }}
    >
      {level >= 3 && !reducedMotion && <Box aria-hidden sx={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none', '&::after': { content: '""', position: 'absolute', top: 0, bottom: 0, left: 0, width: '18%', background: t => `linear-gradient(90deg, transparent, rgba(255,255,255,.75), ${alpha(t.palette.reward.light, .35)}, transparent)`, animation: `${shine} 900ms ${easing.out} 700ms both` } }} />}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
        <Box aria-hidden sx={{ position: 'relative', display: 'grid', placeItems: 'center', width: 56, height: 56, flexShrink: 0 }}>
          <GoldBurst level={level} durationMs={durationMs} />
          {variant === 'perfect'
            ? <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: '12px', background: t => `linear-gradient(135deg, ${t.palette.reward.light}, ${t.palette.reward.main})`, color: 'primary.dark' }}><CheckRoundedIcon /></Box>
            : <StreakFlame size={size} animated={!reducedMotion} />}
        </Box>
        <Box sx={{ position: 'relative', zIndex: 1 }}><Typography variant="h6" fontWeight={800} lineHeight={1.2} letterSpacing="-.01em" color="primary.dark">{title}</Typography><Typography variant="body2" color="text.secondary">{message}</Typography></Box>
      </Stack>
    </Box>
  </Box>;
}

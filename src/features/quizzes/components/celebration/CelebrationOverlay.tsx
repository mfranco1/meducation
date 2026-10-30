import { keyframes } from '@emotion/react';
import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import { useEffect, useId, useRef } from 'react';
import { brand } from '../../../../shared/brand';
import { easing, sizzle, useReducedMotion } from '../../../../shared/ui/motion';
import { Crackle } from '../../../../shared/ui/transitions/Crackle';
import { type CelebrationLevel, GoldBurst } from './GoldBurst';

export type CelebrationVariant = 'streak' | 'perfect';

export interface CelebrationOverlayProps {
  open: boolean;
  title: string;
  message: string;
  variant: CelebrationVariant;
  level: CelebrationLevel;
  durationMs?: number;
  /** Centers on the nearest positioned ancestor instead of the viewport. */
  contained?: boolean;
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
const returnShine = keyframes`
  0% { transform: translateX(680%) skewX(20deg); }
  100% { transform: translateX(-120%) skewX(20deg); }
`;
const titleSizzle = keyframes`
  0%, 100% { text-shadow: 0 0 3px var(--sizzle); } 12% { text-shadow: 0 0 7px var(--sizzle); } 27% { text-shadow: 0 0 2px var(--sizzle); }
  45% { text-shadow: 0 0 8px var(--sizzle); } 61% { text-shadow: 0 0 4px var(--sizzle); } 80% { text-shadow: 0 0 6px var(--sizzle); }
`;
const borderSparks = [[8, 0], [23, 0], [41, 0], [58, 0], [76, 0], [92, 0], [14, 100], [33, 100], [52, 100], [70, 100], [88, 100], [0, 50], [100, 50]] as const;
const titleSparks = [[4, 0], [30, 0], [62, 0], [92, 0], [100, 50], [18, 100], [78, 100]] as const;

function Trophy({ animated }: { animated: boolean }) {
  const theme = useTheme();
  const id = useId();
  const { primary, reward } = theme.palette;
  const edge = alpha(primary.dark, .25);
  const leaves = [[18.5, 42.5, -60], [13.8, 39, -42], [10.6, 34, -26], [8.7, 28.3, -10], [8.2, 22.4, 6], [9, 16.6, 22]] as const;
  const laurel = <>
    <path d="M23 44.5C11 41 5.6 29 9.4 13" fill="none" stroke={reward.main} strokeWidth="1.2" strokeLinecap="round" />
    {leaves.map(([cx, cy, angle]) => <ellipse key={cy} cx={cx - 1.6} cy={cy} rx="1.8" ry="3.7" transform={`rotate(${angle} ${cx - 1.6} ${cy})`} fill={`url(#${id})`} stroke={edge} strokeWidth=".3" />)}
  </>;
  return <svg aria-hidden viewBox="0 0 48 48" width={56} height={56} style={{ position: 'relative', display: 'block', overflow: 'visible', filter: `drop-shadow(0 2px 4px ${alpha(reward.main, .45)})`, animation: animated ? `${ignite} 520ms ${easing.out} both` : undefined }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={reward.light} /><stop offset="1" stopColor={reward.main} /></linearGradient></defs>
    {laurel}
    <g transform="translate(48 0) scale(-1 1)">{laurel}</g>
    <path d="M16.8 12.5H13C13 17.5 14.6 20 17.6 21M31.2 12.5H35C35 17.5 33.4 20 30.4 21" fill="none" stroke={reward.main} strokeWidth="1.6" strokeLinecap="round" />
    <path d="M16 10H32V16C32 22 28.5 26 24 26 19.5 26 16 22 16 16Z" fill={`url(#${id})`} stroke={edge} strokeWidth=".4" />
    <path d="M19.2 12.5V16C19.2 19 20.4 21.2 22.2 22.4" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1" strokeLinecap="round" />
    <path d="M22.6 26H25.4V31H22.6Z" fill={reward.main} />
    <path d="M19 31H29V34H19Z" fill={`url(#${id})`} stroke={edge} strokeWidth=".4" />
    <path d="M17.5 34H30.5V36.5H17.5Z" fill={reward.main} stroke={edge} strokeWidth=".4" />
  </svg>;
}

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

export function CelebrationOverlay(props: CelebrationOverlayProps) {
  return props.open ? <CelebrationPlayback {...props} /> : null;
}

function CelebrationPlayback({ title, message, variant, level, durationMs = durations[level - 1], contained = false, onComplete }: CelebrationOverlayProps) {
  const reducedMotion = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const completed = useRef(false);
  useEffect(() => {
    // Prepare styles and layout before advancing any of the animation clocks.
    // The attribute starts playback without rerendering the particle tree.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (root.current) root.current.dataset.playing = 'true';
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const size = flameSizes[level - 1];
  const perfect = variant === 'perfect';
  const sizzling = perfect && !reducedMotion;
  const titleSizzling = level === 5 && !reducedMotion;
  return <Box
    ref={root}
    data-playing="false"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    sx={{ position: contained ? 'absolute' : 'fixed', zIndex: theme => theme.zIndex.snackbar, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(calc(100% - 32px), 390px)', pointerEvents: 'none', '&[data-playing="false"]': { opacity: 0, '& *, & *::before, & *::after': { animationPlayState: 'paused !important' } } }}
  >
    <Box
      data-testid="celebration-card"
      onAnimationEnd={event => {
        if (event.target !== event.currentTarget || root.current?.dataset.playing !== 'true' || completed.current) return;
        completed.current = true;
        onComplete?.();
      }}
      sx={{
        position: 'relative', border: '1px solid', borderColor: level >= 4 ? 'reward.main' : '#eee5df', borderRadius: 1, bgcolor: 'background.paper', px: 2.5, py: 1.75,
        boxShadow: t => `0 2px 6px ${alpha(t.palette.primary.dark, .08)}, 0 16px 40px ${alpha(t.palette.primary.dark, .14)}${perfect ? `, 0 0 0 1px ${alpha(t.palette.reward.light, .8)}, 0 0 18px ${alpha(t.palette.reward.main, .45)}` : ''}`,
        animation: `${reducedMotion ? reducedEnter : enter} ${durationMs}ms ease-in-out both`,
      }}
    >
      {level >= 3 && !reducedMotion && <Box aria-hidden sx={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none', '&::after': { content: '""', position: 'absolute', top: 0, bottom: 0, left: 0, width: '18%', background: t => `linear-gradient(90deg, transparent, rgba(255,255,255,.75), ${alpha(t.palette.reward.light, .35)}, transparent)`, animation: `${shine} 900ms ${easing.out} 700ms both` }, ...(perfect && { '&::before': { content: '""', position: 'absolute', top: 0, bottom: 0, left: 0, width: '18%', background: t => `linear-gradient(90deg, transparent, ${alpha(t.palette.reward.light, .35)}, rgba(255,255,255,.75), transparent)`, animation: `${returnShine} 900ms ${easing.out} 1850ms both` } }) }} />}
      {sizzling && <>
        <Box aria-hidden sx={{ position: 'absolute', inset: -1, borderRadius: 'inherit', border: '1px solid', borderColor: 'reward.light', boxShadow: t => `0 0 12px ${t.palette.reward.light}, inset 0 0 6px ${alpha(t.palette.reward.light, .6)}`, pointerEvents: 'none', animation: `${sizzle} 800ms linear infinite` }} />
        <Crackle points={borderSparks} size={4} />
      </>}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
        <Box aria-hidden sx={{ position: 'relative', display: 'grid', placeItems: 'center', width: 56, height: 56, flexShrink: 0 }}>
          <GoldBurst level={level} durationMs={durationMs} />
          {perfect ? <Trophy animated={!reducedMotion} /> : <StreakFlame size={size} animated={!reducedMotion} />}
        </Box>
        <Box sx={{ position: 'relative', zIndex: 1 }}><Box sx={{ position: 'relative', width: 'fit-content' }}><Typography variant="h6" fontWeight={800} lineHeight={1.2} letterSpacing="-.01em" color="primary.dark" sx={titleSizzling ? { '--sizzle': t => t.palette.reward.light, animation: `${titleSizzle} 900ms linear infinite` } : undefined}>{title}</Typography>{titleSizzling && <Crackle points={titleSparks} size={3} />}</Box><Typography variant="body2" color="text.secondary">{message}</Typography></Box>
      </Stack>
    </Box>
  </Box>;
}

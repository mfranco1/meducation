import { keyframes } from '@emotion/react';
import { alpha, Box } from '@mui/material';
import type { CSSProperties } from 'react';
import { radius } from '../../../../shared/theme';
import { easing, useReducedMotion } from '../../../../shared/ui/motion';

export type CelebrationLevel = 1 | 2 | 3 | 4 | 5;

const tiers = [
  { sparks: 36, reach: 80, waves: 1, streaks: 0, rings: 0, flash: false },
  { sparks: 48, reach: 90, waves: 1, streaks: 0, rings: 0, flash: true },
  { sparks: 60, reach: 100, waves: 1, streaks: 6, rings: 0, flash: true },
  { sparks: 72, reach: 120, waves: 1, streaks: 10, rings: 1, flash: true },
  { sparks: 90, reach: 135, waves: 2, streaks: 14, rings: 2, flash: true },
] as const;

/** Deterministic pseudo-random in [0, 1) so every render matches. */
export const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const star = 'polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)';
const spark = keyframes`
  0% { opacity: 0; transform: translate(0, 0) scale(.2) rotate(0deg); animation-timing-function: cubic-bezier(.16, 1, .3, 1); }
  8% { opacity: 1; }
  48% { opacity: 1; transform: translate(var(--x), var(--y)) scale(1) rotate(var(--r)); animation-timing-function: cubic-bezier(.5, 0, .9, .6); }
  100% { opacity: 0; transform: translate(calc(var(--x) * 1.05), calc(var(--y) * 1.05 + var(--g))) scale(0) rotate(calc(var(--r) * 1.7)); }
`;
const rimSpark = keyframes`
  0% { opacity: 0; transform: translate(var(--x0), var(--y0)) scale(.2) rotate(0deg); animation-timing-function: cubic-bezier(.16, 1, .3, 1); }
  10% { opacity: 1; }
  52% { opacity: 1; transform: translate(var(--x), var(--y)) scale(1) rotate(var(--r)); animation-timing-function: cubic-bezier(.5, 0, .9, .6); }
  100% { opacity: 0; transform: translate(var(--x), calc(var(--y) + var(--g))) scale(0) rotate(calc(var(--r) * 1.7)); }
`;
const streak = keyframes`
  0% { opacity: 0; transform: rotate(var(--a)) translateX(16px) scaleX(.3); }
  22% { opacity: 1; transform: rotate(var(--a)) translateX(calc(var(--d) * .55)) scaleX(1.7); }
  100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scaleX(.2); }
`;
const flash = keyframes`
  0% { opacity: .95; transform: scale(.3); }
  100% { opacity: 0; transform: scale(1.7); }
`;
const shockwave = keyframes`
  0% { opacity: .95; transform: scale(.4); }
  100% { opacity: 0; transform: scale(4.6); }
`;

const sparkSx = {
  '& > span': { position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none' },
  '& > .spark': {
    width: 'var(--size)',
    height: 'var(--size)',
    margin: 'calc(var(--size) / -2)',
    borderRadius: radius.circle,
    background: (t: { palette: { reward: { main: string; light: string } } }) =>
      `radial-gradient(circle at 40% 40%, var(--c1, ${t.palette.reward.light}) 0%, var(--c2, ${t.palette.reward.main}) 100%)`,
  },
  '& > .star': { borderRadius: 0, clipPath: star },
} as const;

/** Per-spark values: aim, distance, size, launch delay, duration, fall and spin. */
function sparkOf(i: number, count: number, reach: number, waves: number, durationMs: number) {
  const angle = ((i / count) * 360 + (rnd(i, 1) - 0.5) * (300 / count)) * (Math.PI / 180);
  const isStar = i % 2 === 0;
  return {
    className: isStar ? 'spark star' : 'spark',
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    distance: reach * (0.5 + rnd(i, 2) * 0.5),
    vars: {
      '--size': `${isStar ? 5 + (i % 3) : 2 + (i % 2)}px`,
      '--delay': `${130 + (i % waves) * 430 + Math.round(rnd(i, 4) * 110)}ms`,
      '--sd': `${Math.round(durationMs * 0.5 * (0.8 + rnd(i, 5) * 0.45))}ms`,
      '--g': `${8 + Math.round(rnd(i, 6) * 14)}px`,
      '--r': `${60 + Math.round(rnd(i, 7) * 120)}deg`,
    },
  };
}

export function GoldBurst({ level, durationMs }: { level: CelebrationLevel; durationMs: number }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;
  const { sparks, reach, waves, streaks, rings, flash: hasFlash } = tiers[level - 1];
  return (
    <Box
      data-testid="gold-burst"
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        filter: (t) => `drop-shadow(0 0 2px ${alpha(t.palette.reward.main, 0.5)})`,
        ...sparkSx,
        '& > .spark': {
          ...sparkSx['& > .spark'],
          animation: `${spark} var(--sd) both var(--delay)`,
        },
        '& > .flash': {
          width: 76,
          height: 76,
          margin: '-38px',
          borderRadius: radius.circle,
          background: (t) =>
            `radial-gradient(circle, ${t.palette.common.white} 0, ${alpha(t.palette.reward.light, 0.8)} 35%, transparent 70%)`,
          animation: `${flash} 460ms ${easing.out} 120ms both`,
        },
        '& > .shockwave': {
          width: 24,
          height: 24,
          margin: '-12px',
          borderRadius: radius.circle,
          border: '1.5px solid',
          borderColor: 'reward.light',
          boxShadow: (t) =>
            `0 0 6px ${alpha(t.palette.reward.main, 0.6)}, inset 0 0 4px ${alpha(t.palette.reward.main, 0.4)}`,
          animation: `${shockwave} 1200ms ${easing.out} var(--delay) both`,
        },
        '& > .streak': {
          width: 11,
          height: 1.5,
          margin: '-.75px 0 0 0',
          borderRadius: radius.pill,
          transformOrigin: '0 50%',
          background: (t) =>
            `linear-gradient(90deg, transparent, ${t.palette.reward.light} 60%, ${t.palette.common.white})`,
          animation: `${streak} 560ms ${easing.out} var(--delay) both`,
        },
      }}
    >
      {hasFlash && <span className="flash" />}
      {Array.from({ length: rings }, (_, i) => (
        <span key={i} className="shockwave" style={{ '--delay': `${240 + i * 320}ms` } as CSSProperties} />
      ))}
      {Array.from({ length: streaks }, (_, i) => (
        <span
          key={i}
          className="streak"
          style={
            {
              '--a': `${((i / streaks) * 360 + rnd(i, 8) * 18).toFixed(1)}deg`,
              '--d': `${Math.round(reach * (0.45 + rnd(i, 9) * 0.3))}px`,
              '--delay': `${110 + Math.round(rnd(i, 10) * 70)}ms`,
            } as CSSProperties
          }
        />
      ))}
      {Array.from({ length: sparks }, (_, i) => {
        const s = sparkOf(i, sparks, reach, waves, durationMs);
        return (
          <span
            key={i}
            className={s.className}
            style={
              {
                ...s.vars,
                '--x': `${Math.round(s.cos * s.distance)}px`,
                '--y': `${Math.round(s.sin * s.distance)}px`,
              } as CSSProperties
            }
          />
        );
      })}
    </Box>
  );
}

/** Fine sparks launched from the rim of a ring (size set by `--rim`) and flying outward. */
export function RimBurst({
  count,
  travel,
  waves,
  colors,
}: {
  count: number;
  travel: number;
  waves: number;
  colors?: readonly [string, string];
}) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        '--rim': { xs: '98px', sm: '108px' },
        ...sparkSx,
        '& > .spark': { ...sparkSx['& > .spark'], animation: `${rimSpark} var(--sd) both var(--delay)` },
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const s = sparkOf(i, count, travel, waves, 3200);
        const out = `(var(--rim) + ${14 + Math.round(s.distance)}px)`;
        return (
          <span
            key={i}
            className={s.className}
            style={
              {
                ...s.vars,
                '--delay': `${parseInt(s.vars['--delay'], 10) - 100}ms`,
                '--x0': `calc(${s.cos.toFixed(3)} * var(--rim))`,
                '--y0': `calc(${s.sin.toFixed(3)} * var(--rim))`,
                '--x': `calc(${s.cos.toFixed(3)} * ${out})`,
                '--y': `calc(${s.sin.toFixed(3)} * ${out})`,
                ...(colors && { '--c1': colors[0], '--c2': colors[1] }),
              } as CSSProperties
            }
          />
        );
      })}
    </Box>
  );
}

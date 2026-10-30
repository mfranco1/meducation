import { keyframes } from '@emotion/react';
import { alpha, Box } from '@mui/material';
import type { CSSProperties } from 'react';
import { easing, useReducedMotion } from '../../../../shared/ui/motion';

export type CelebrationLevel = 1 | 2 | 3 | 4 | 5;

const tiers = [
  { sparks: 36, reach: 80, waves: 1, glow: true, rings: 0, embers: 0 },
  { sparks: 48, reach: 90, waves: 1, glow: true, rings: 0, embers: 0 },
  { sparks: 60, reach: 100, waves: 1, glow: true, rings: 0, embers: 0 },
  { sparks: 72, reach: 120, waves: 1, glow: true, rings: 1, embers: 0 },
  { sparks: 90, reach: 135, waves: 2, glow: true, rings: 2, embers: 6 },
] as const;

const star = 'polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)';
const spark = keyframes`
  0% { opacity: 0; transform: translate(0, 0) scale(.4); }
  18% { opacity: 1; transform: translate(calc(var(--spark-x) * .5), calc(var(--spark-y) * .5)) scale(1.15); }
  45% { opacity: .8; transform: translate(calc(var(--spark-x) * .8), calc(var(--spark-y) * .8)) scale(1); }
  60% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--spark-x), var(--spark-y)) scale(.5); }
`;
const glow = keyframes`
  0% { opacity: 0; transform: scale(.6); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.5); }
`;
const ring = keyframes`
  0% { opacity: .9; transform: scale(.4); }
  100% { opacity: 0; transform: scale(4); }
`;
const ember = keyframes`
  0% { opacity: 0; transform: translateY(0); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-90px); }
`;

export function GoldBurst({ level, durationMs, scale = 1, sparksOnly }: { level: CelebrationLevel; durationMs: number; scale?: number; sparksOnly?: boolean }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;
  const tier = tiers[level - 1];
  const { waves } = tier;
  const [hasGlow, rings, embers] = sparksOnly ? [false, 0, 0] : [tier.glow, tier.rings, tier.embers];
  const sparks = Math.round(tier.sparks * scale);
  const reach = tier.reach * scale;
  const glowSize = 72 * scale;
  const ringSize = 24 * scale;
  const sparkMs = Math.round(durationMs * .55);
  return <Box data-testid="gold-burst" aria-hidden
    style={{ '--burst-duration': `${durationMs}ms`, '--spark-duration': `${sparkMs}ms`, '--glow-size': `${glowSize}px`, '--ring-size': `${ringSize}px` } as CSSProperties}
    sx={{
      position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', filter: t => `drop-shadow(0 0 2px ${alpha(t.palette.reward.main, .55)})`,
      '& > span': { position: 'absolute', left: '50%', top: '50%', borderRadius: '50%', pointerEvents: 'none' },
      '& > .gold-glow': {
        width: 'var(--glow-size)', height: 'var(--glow-size)', margin: 'calc(var(--glow-size) / -2)',
        background: t => `radial-gradient(circle, ${alpha(t.palette.reward.light, .55)} 0%, transparent 70%)`, animation: `${glow} var(--burst-duration) ${easing.out} both`,
      },
      '& > .gold-ring': {
        width: 'var(--ring-size)', height: 'var(--ring-size)', margin: 'calc(var(--ring-size) / -2)',
        background: t => `radial-gradient(circle, transparent 62%, ${t.palette.reward.main} 70%, ${t.palette.reward.light} 78%, transparent 86%)`, animation: `${ring} 1300ms ${easing.out} var(--delay) both`,
      },
      '& > .gold-spark': {
        width: 'var(--size)', height: 'var(--size)', margin: 'calc(var(--size) / -2)',
        background: t => `radial-gradient(circle at 40% 40%, ${t.palette.reward.light} 0%, ${t.palette.reward.main} 100%)`, animation: `${spark} var(--spark-duration) ${easing.out} var(--delay) both`,
      },
      '& > .gold-star': { borderRadius: 0, clipPath: star },
      '& > .gold-ember': {
        width: 4, height: 4, ml: 'var(--offset)', mt: '-28px',
        background: t => `radial-gradient(circle, ${t.palette.reward.light}, ${t.palette.reward.main})`, animation: `${ember} 1300ms ${easing.out} var(--delay) both`,
      },
    }}
  >
    {hasGlow && <span className="gold-glow" />}
    {Array.from({ length: rings }, (_, i) => <span key={i} className="gold-ring" style={{ '--delay': `${300 + i * 350}ms` } as CSSProperties} />)}
    {Array.from({ length: sparks }, (_, i) => {
      const angle = ((i / sparks) * 360 + ((i * 37) % 11) - 5) * Math.PI / 180;
      const distance = reach * (.55 + ((i * 7) % 9) / 16);
      const isStar = i % 2 === 0;
      const size = isStar ? 5 + (i % 3) : 2 + (i % 2);
      return <span key={i} className={isStar ? 'gold-spark gold-star' : 'gold-spark'} style={{
        '--spark-x': `${Math.round(Math.cos(angle) * distance)}px`, '--spark-y': `${Math.round(Math.sin(angle) * distance)}px`,
        '--size': `${size}px`, '--delay': `${180 + (i % waves) * 450 + Math.round(i / sparks * 360)}ms`,
      } as CSSProperties} />;
    })}
    {Array.from({ length: embers }, (_, i) => <span key={i} className="gold-ember" style={{ '--offset': `${(i - 1) * 56}px`, '--delay': `${500 + i * 160}ms` } as CSSProperties} />)}
  </Box>;
}

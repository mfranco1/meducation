import { alpha, Box } from '@mui/material';
import { sizzle, useReducedMotion } from '../../../shared/ui/motion';
import { Crackle } from '../../../shared/ui/transitions/Crackle';

const smoothstep = (value: number) => {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
};

/** Absolute counts: glow starts at card 3 and is full at 40; sizzle starts at card 21 and is full at 80. */
export const momentumLevels = (count: number) => ({ glow: smoothstep((count - 2) / 38), sizzle: smoothstep((count - 20) / 60) });

const sparkInset = 14;
const radius = { xs: '22px', sm: '28px' };

/** Sparks spaced evenly around the rectangle edge, as [left %, top %]. */
const perimeterPoints = (count: number) => Array.from({ length: count }, (_, i): [number, number] => {
  const t = (i / count) * 4;
  const side = Math.floor(t);
  const along = Math.round((t - side) * 100);
  return [[along, 0], [100, along], [100 - along, 100], [0, 100 - along]][side] as [number, number];
});

/** Gold glow behind a flashcard that builds with the cards studied this session. */
export function FlashcardMomentum({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const levels = momentumLevels(count);
  const showSizzle = levels.sizzle > 0 && !reduced;
  const layer = { position: 'absolute', pointerEvents: 'none', inset: 0, borderRadius: radius } as const;
  return <>
    <Box aria-hidden data-momentum={count} sx={{
      ...layer,
      boxShadow: t => `0 0 ${4 + 24 * levels.glow}px ${alpha(t.palette.reward.light, .5 * levels.glow)}, 0 0 ${2 + 6 * levels.glow}px ${alpha(t.palette.reward.main, .4 * levels.glow)}`,
      transition: reduced ? 'none' : 'box-shadow 700ms',
    }} />
    {showSizzle && <>
      {/* Flickers the same band as the glow so the card keeps a single gold edge. */}
      <Box aria-hidden sx={{ ...layer, opacity: levels.sizzle, boxShadow: t => `0 0 14px ${alpha(t.palette.reward.light, .6)}, 0 0 4px ${alpha(t.palette.reward.main, .5)}`, animation: `${sizzle} 800ms linear infinite` }} />
      <Box aria-hidden sx={{ ...layer, inset: -sparkInset, opacity: levels.sizzle }}>
        <Crackle points={perimeterPoints(Math.round(levels.sizzle * 16))} size={3} />
      </Box>
    </>}
  </>;
}

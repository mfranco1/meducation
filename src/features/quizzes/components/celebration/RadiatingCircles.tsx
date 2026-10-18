import { keyframes } from '@emotion/react';
import { Box } from '@mui/material';
import { useEffect, useState } from 'react';

const radiate = keyframes`
  0% { opacity: 0; transform: translate(0, 0) scale(.45); }
  20% { opacity: 1; }
  78% { opacity: .72; }
  100% { opacity: 0; transform: translate(var(--particle-x), var(--particle-y)) scale(1.1); }
`;

export interface RadiatingCirclesProps {
  particleCount?: number;
  durationMs?: number;
  delayMs?: number;
  colors?: readonly [string, string];
  horizontalSpread?: number;
  verticalSpread?: number;
  particleSize?: number;
  direction?: 'up' | 'both';
}

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reducedMotion;
}

export function RadiatingCircles({
  particleCount = 5,
  durationMs = 900,
  delayMs = 0,
  colors = ['#74b98d', '#2f7a55'],
  horizontalSpread = 18,
  verticalSpread = 22,
  particleSize = 8,
  direction = 'up',
}: RadiatingCirclesProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion || particleCount < 1) return null;

  return <Box data-testid="radiating-circles" aria-hidden sx={{ position: 'absolute', zIndex: 0, inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
    {Array.from({ length: particleCount }, (_, index) => {
      const mirrored = direction === 'both';
      const slot = mirrored ? Math.floor(index / 2) : index;
      const slots = mirrored ? Math.ceil(particleCount / 2) : particleCount;
      const down = mirrored && index % 2 === 1;
      const alternate = (slot + (down ? 1 : 0)) % 2 === 1;
      const left = slots === 1 ? 50 : 17 + slot * (66 / (slots - 1));
      const top = alternate ? 52 : 34;
      const rise = verticalSpread + (slot % 3) * (verticalSpread * .6);
      return <Box
        key={index}
        data-testid="radiating-circle"
        sx={{
          '--particle-x': `${(slot - (slots - 1) / 2) * horizontalSpread}px`, '--particle-y': `${down ? rise : -rise}px`, position: 'absolute', width: alternate ? particleSize * .75 : particleSize, height: alternate ? particleSize * .75 : particleSize, borderRadius: '50%', bgcolor: alternate ? colors[0] : colors[1], top: `${down ? 100 - top : top}%`, left: `${left}%`, animation: `${radiate} ${durationMs}ms ease-out both`, animationDelay: `${delayMs + slot * 28}ms`,
        }}
      />;
    })}
  </Box>;
}

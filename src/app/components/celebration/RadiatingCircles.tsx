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
}: RadiatingCirclesProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion || particleCount < 1) return null;

  return <Box aria-hidden sx={{ position: 'absolute', zIndex: 0, inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
    {Array.from({ length: particleCount }, (_, index) => {
      const alternate = index % 2 === 1;
      const left = particleCount === 1 ? 50 : 17 + index * (66 / (particleCount - 1));
      return <Box
        key={index}
        sx={{
          '--particle-x': `${(index - (particleCount - 1) / 2) * horizontalSpread}px`, '--particle-y': `${-verticalSpread - (index % 3) * (verticalSpread * .6)}px`, position: 'absolute', width: alternate ? particleSize * .75 : particleSize, height: alternate ? particleSize * .75 : particleSize, borderRadius: '50%', bgcolor: alternate ? colors[0] : colors[1], top: alternate ? '52%' : '34%', left: `${left}%`, animation: `${radiate} ${durationMs}ms ease-out both`, animationDelay: `${delayMs + index * 28}ms`,
        }}
      />;
    })}
  </Box>;
}

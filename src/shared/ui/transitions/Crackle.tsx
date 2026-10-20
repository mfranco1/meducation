import { keyframes } from '@emotion/react';
import { Box } from '@mui/material';

const crackle = keyframes`
  0%, 100% { opacity: 0; transform: translate(0, 0) scale(0); }
  8% { opacity: 1; transform: translate(0, 0) scale(1.2); }
  30% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.3); }
`;

/** Gold sparks that keep popping outward from points given as [left %, top %] of the parent. */
export function Crackle({ points, size, travel = .12 }: { points: readonly (readonly [number, number])[]; size: number; travel?: number }) {
  return <>{points.map(([x, y], i) => <Box key={i} aria-hidden sx={{
    position: 'absolute', left: `${x}%`, top: `${y}%`, width: size, height: size, ml: `${-size / 2}px`, mt: `${-size / 2}px`, borderRadius: '50%', bgcolor: 'reward.light', boxShadow: t => `0 0 4px ${t.palette.reward.main}`, pointerEvents: 'none',
    '--dx': `${Math.round((x - 50) * travel)}px`, '--dy': `${Math.round((y - 50) * travel)}px`, animation: `${crackle} 900ms linear ${(i * 137) % 900}ms infinite`,
  }} />)}</>;
}

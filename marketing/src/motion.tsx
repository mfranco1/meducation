import type { CSSProperties, ReactNode } from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';

export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export function progress(frame: number, start = 0, length = 24) {
  return interpolate(frame, [start, start + length], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
}
export function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  const p = progress(useCurrentFrame(), delay);
  return <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * 36}px)` }}>{children}</div>;
}
export function Rule({ color }: { color: string }) {
  return (
    <div
      style={{
        height: 2,
        background: color,
        opacity: 0.3,
        transform: `scaleX(${progress(useCurrentFrame(), 3, 30)})`,
        transformOrigin: 'left',
      }}
    />
  );
}

import type { CSSProperties, ReactNode } from 'react';

/** CSS device frame. Children fill the screen. */
export function Phone({
  width,
  children,
  screenAspect = 960 / 1800,
  style,
}: {
  width: number;
  children: ReactNode;
  screenAspect?: number;
  style?: CSSProperties;
}) {
  const bezel = width * 0.03;
  const screenWidth = width - bezel * 2;
  const outer = width * 0.13;
  return (
    <div
      style={{
        width,
        height: screenWidth / screenAspect + bezel * 2,
        padding: bezel,
        boxSizing: 'border-box',
        borderRadius: outer,
        background: '#27211e',
        boxShadow: '0 28px 80px #27211e30',
        ...style,
      }}
    >
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: outer - bezel }}>{children}</div>
    </div>
  );
}

import type { CSSProperties } from 'react';
import { useCurrentFrame } from 'remotion';
import { fitText } from '@remotion/layout-utils';
import { progress } from './motion';

const letterSpacing = '-0.04em';

/** Headline sized to fit `width`; each line or word slides up from a mask. */
export function KineticText({
  text,
  width,
  delay = 0,
  stagger = 4,
  by = 'line',
  weight = 780,
  maxFontSize = 200,
  color,
  style,
}: {
  text: string;
  width: number;
  delay?: number;
  stagger?: number;
  by?: 'line' | 'word';
  weight?: number;
  maxFontSize?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const lines = text.split('\n');
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
  const { fontSize: fitted } = fitText({
    text: longest,
    withinWidth: width,
    fontFamily: "'DM Sans'",
    fontWeight: weight,
    letterSpacing,
  });
  const fontSize = Math.min(fitted, maxFontSize);
  let index = 0;
  return (
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize,
        fontWeight: weight,
        letterSpacing,
        lineHeight: 1,
        color,
        ...style,
      }}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ whiteSpace: 'pre' }}>
          {(by === 'word' ? line.split(' ') : [line]).map((unit, j) => (
            <span
              key={j}
              style={{
                display: 'inline-block',
                overflow: 'hidden',
                paddingBottom: fontSize * 0.12,
                marginBottom: -fontSize * 0.12,
                verticalAlign: 'top',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  transform: `translateY(${(1 - progress(frame, delay + index++ * stagger, 22)) * 115}%)`,
                }}
              >
                {unit + (by === 'word' ? ' ' : '')}
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

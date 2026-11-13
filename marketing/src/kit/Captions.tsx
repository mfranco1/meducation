import { useMemo, type CSSProperties } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { createTikTokStyleCaptions, type Caption } from '@remotion/captions';
import { themes } from './theme';

export type { Caption };

/** TikTok-style caption pages with the spoken word highlighted. */
export function Captions({
  captions,
  combineMs = 1200,
  fontSize = 64,
  style,
}: {
  captions: Caption[];
  combineMs?: number;
  fontSize?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pages } = useMemo(
    () => createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: combineMs }),
    [captions, combineMs],
  );
  const ms = (frame / fps) * 1000;
  const page = pages.filter((p) => p.startMs <= ms).pop();
  if (!page || ms >= page.startMs + page.durationMs) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', ...style }}>
      <div
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize,
          fontWeight: 780,
          letterSpacing: '-0.03em',
          textAlign: 'center',
          whiteSpace: 'pre',
          color: themes.cream.fg,
        }}
      >
        {page.tokens.map((token, i) => (
          <span key={i} style={ms >= token.fromMs && ms < token.toMs ? { color: themes.cream.accent } : undefined}>
            {token.text}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

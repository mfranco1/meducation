import { keyframes } from '@emotion/react';
import { Box } from '@mui/material';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export const screenTransitionDurationMs = 170;
export const screenTransitionEasing = 'cubic-bezier(0.2, 0, 0, 1)';

const enter = keyframes`
  from { opacity: 0; top: 6px; }
  to { opacity: 1; top: 0; }
`;

/** Animates only when the top-level navigation destination changes. */
export function ScreenTransition({ screenId, children }: { screenId: string; children: ReactNode }) {
  const previousScreenId = useRef(screenId);
  const [animatedScreenId, setAnimatedScreenId] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (previousScreenId.current !== screenId) setAnimatedScreenId(screenId);
    previousScreenId.current = screenId;
  }, [screenId]);
  const shouldAnimate = animatedScreenId === screenId;

  return <Box
    data-testid="screen-transition"
    data-screen-id={screenId}
    key={screenId}
    data-animated={shouldAnimate ? 'true' : 'false'}
    sx={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      animation: shouldAnimate ? `${enter} ${screenTransitionDurationMs}ms ${screenTransitionEasing} both` : 'none',
      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
    }}
  >{children}</Box>;
}

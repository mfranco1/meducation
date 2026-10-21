import { keyframes } from '@emotion/react';
import { Box } from '@mui/material';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { easing, reducedMotion } from '../motion';

export const screenTransitionDurationMs = 170;

const enter = keyframes`
  from { opacity: 0; top: 6px; }
  to { opacity: 1; top: 0; }
`;

/** Starts each new top-level destination at the top of the page and animates its entry. */
export function ScreenTransition({ screenId, children }: { screenId: string; children: ReactNode }) {
  const previousScreenId = useRef(screenId);
  const [animatedScreenId, setAnimatedScreenId] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (previousScreenId.current !== screenId) {
      setAnimatedScreenId(screenId);
      window.scrollTo(0, 0);
    }
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
      animation: shouldAnimate ? `${enter} ${screenTransitionDurationMs}ms ${easing.standard} both` : 'none',
      [reducedMotion]: { animation: 'none' },
    }}
  >{children}</Box>;
}

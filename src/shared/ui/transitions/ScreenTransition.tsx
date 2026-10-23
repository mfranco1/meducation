import { keyframes } from '@emotion/react';
import { Box } from '@mui/material';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { easing, reducedMotion } from '../motion';

export const screenTransitionDurationMs = 170;

const enter = keyframes`
  from { opacity: 0; top: 6px; }
  to { opacity: 1; top: 0; }
`;

/**
 * Starts each new top-level destination at the top of the page and animates its entry.
 * `restoreScroll` decides when a destination returns to where the learner left it instead.
 */
export function ScreenTransition({ screenId, restoreScroll, children }: {
  screenId: string;
  restoreScroll?: (fromScreenId: string, toScreenId: string) => boolean;
  children: ReactNode;
}) {
  const previousScreenId = useRef(screenId);
  // Tracked from scroll events because the new screen may already have clamped window.scrollY by the time it commits.
  const lastScrollY = useRef(0);
  const scrollPositions = useRef(new Map<string, number>());
  const [animatedScreenId, setAnimatedScreenId] = useState<string | null>(null);
  useEffect(() => {
    const onScroll = () => { lastScrollY.current = window.scrollY; };
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    const fromScreenId = previousScreenId.current;
    if (fromScreenId !== screenId) {
      scrollPositions.current.set(fromScreenId, lastScrollY.current);
      setAnimatedScreenId(screenId);
      window.scrollTo(0, restoreScroll?.(fromScreenId, screenId) ? scrollPositions.current.get(screenId) ?? 0 : 0);
      lastScrollY.current = window.scrollY;
    }
    previousScreenId.current = screenId;
  }, [screenId, restoreScroll]);
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

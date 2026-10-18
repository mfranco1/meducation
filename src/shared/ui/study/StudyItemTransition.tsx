import { Box, useMediaQuery } from '@mui/material';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { easing } from '../motion';

const slideDurationMs = 220;
const fadeDurationMs = 150;
const travelPx = 14;

/**
 * Animates the study card when the index changes: neighbours slide a short way in the travel
 * direction and longer jumps crossfade. The outgoing card is the unmounted DOM node itself, kept
 * as an inert, aria-hidden ghost until its exit finishes.
 */
export function StudyItemTransition({ index, children }: { index: number; children: ReactNode }) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const ghostHost = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLDivElement>(null);
  const previous = useRef<{ index: number; node: HTMLDivElement | null }>({ index, node: null });

  useLayoutEffect(() => {
    const outgoing = previous.current;
    const incoming = item.current;
    previous.current = { index, node: incoming };
    // jsdom has no Web Animations API.
    if (outgoing.index === index || !outgoing.node || !incoming?.animate || !ghostHost.current || reducedMotion) return;
    const step = index - outgoing.index;
    const shift = Math.abs(step) === 1 ? Math.sign(step) * travelPx : 0;
    const timing = { duration: shift ? slideDurationMs : fadeDurationMs, easing: easing.standard };
    const ghost = outgoing.node;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghostHost.current.replaceChildren(ghost);
    ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-shift}px)` }], { ...timing, fill: 'forwards' }).onfinish = () => ghost.remove();
    incoming.animate([{ opacity: 0, transform: `translateX(${shift}px)` }, { opacity: 1, transform: 'none' }], timing);
  }, [index, reducedMotion]);

  return <Box sx={{ position: 'relative' }}>
    <Box ref={ghostHost} sx={{ position: 'absolute', inset: '0 0 auto', pointerEvents: 'none' }} />
    <Box key={index} ref={item} sx={{ position: 'relative' }}>{children}</Box>
  </Box>;
}

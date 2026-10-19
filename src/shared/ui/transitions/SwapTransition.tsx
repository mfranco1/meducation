import { Box, useMediaQuery } from '@mui/material';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { easing } from '../motion';

const slideDurationMs = 220;
const fadeDurationMs = 150;
const travelPx = 14;

/**
 * Animates an in-screen swap when `swapKey` changes: a given `direction`, or a numeric step of
 * exactly one, slides a short way; anything else crossfades. The outgoing content is the
 * unmounted DOM node itself, kept as an inert, aria-hidden ghost until its exit finishes.
 */
export function SwapTransition({ swapKey, direction, children }: { swapKey: string | number; direction?: 1 | -1; children: ReactNode }) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const ghostHost = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLDivElement>(null);
  const previous = useRef<{ key: string | number; node: HTMLDivElement | null }>({ key: swapKey, node: null });

  useLayoutEffect(() => {
    const outgoing = previous.current;
    const incoming = item.current;
    previous.current = { key: swapKey, node: incoming };
    // jsdom has no Web Animations API.
    if (outgoing.key === swapKey || !outgoing.node || !incoming?.animate || !ghostHost.current || reducedMotion) return;
    const step = typeof swapKey === 'number' && typeof outgoing.key === 'number' ? swapKey - outgoing.key : 0;
    const slide = direction ?? (Math.abs(step) === 1 ? Math.sign(step) : 0);
    const shift = slide * travelPx;
    const timing = { duration: shift ? slideDurationMs : fadeDurationMs, easing: easing.standard };
    const ghost = outgoing.node;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghostHost.current.replaceChildren(ghost);
    ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-shift}px)` }], { ...timing, fill: 'forwards' }).onfinish = () => ghost.remove();
    incoming.animate([{ opacity: 0, transform: `translateX(${shift}px)` }, { opacity: 1, transform: 'none' }], timing);
  }, [swapKey, direction, reducedMotion]);

  return <Box sx={{ position: 'relative' }}>
    <Box ref={ghostHost} sx={{ position: 'absolute', inset: '0 0 auto', pointerEvents: 'none' }} />
    <Box key={swapKey} ref={item} sx={{ position: 'relative' }}>{children}</Box>
  </Box>;
}
